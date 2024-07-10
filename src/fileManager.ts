import { Config, FileJSON, fetchDomainPermissions, updateFile } from './guFile'
import { drive_v2 } from 'googleapis'
import * as drive from './drive'
import { JWT } from 'google-auth-library'
import { AttributeValue, DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { standardAwsConfig } from './awsIntegration';
import { DYNAMODB_TABLE } from './constants';

export interface State {
    lastChangeId: number;
    lastSaved: Date;
}

const dynamo = DynamoDBDocument.from(new DynamoDB(standardAwsConfig));

export async function getStateDb(): Promise<State> {
    const result = await dynamo.get({
        TableName: DYNAMODB_TABLE,
        Key: {
            "key": "config"
        }
    })
    if (result.Item && result.Item.lastChangeId && result.Item.lastSaved) {
        return { lastChangeId: result.Item.lastChangeId, lastSaved: new Date(result.Item.lastSaved) };    
    } else {
        return { lastChangeId: 0, lastSaved: new Date('1900-01-01') };
    }
}

async function saveStateDb(lastChangeId: number): Promise<void> {
    const state = {
        key: "config",
        lastChangeId,
        lastSaved: new Date().getTime(),
    };

    await dynamo.put({
        TableName: DYNAMODB_TABLE,
        Item: state,
    });

    return
}

async function getGuFile(id: string): Promise<FileJSON | null> {
    const result = await dynamo.get({
        TableName: DYNAMODB_TABLE,
        Key: {
            "key": `file:${id}`
        }
    })

    if (result.Item) {
        return result.Item.file as FileJSON
    } else {
        return null
    }
}

type DynamoRecord =  Record<string, AttributeValue>;

interface PaginatedResult<T> {
    items: Array<T>;
    token: string;
}
export async function getAllGuFiles(start?: number): Promise<PaginatedResult<FileJSON>> {
    const results = await dynamo.query({
        TableName: DYNAMODB_TABLE,
        IndexName: "last-modified",
        ExpressionAttributeValues: {
            ':type': 'file',
            ':lastModified': start || 0,
        },
        ExpressionAttributeNames: {
            "#t": "type"
        },
        KeyConditionExpression: "#t = :type AND lastModified > :lastModified",
        Limit: 10,
    })
    const lastEvaluatedKey = results.LastEvaluatedKey
    const token = lastEvaluatedKey ? lastEvaluatedKey['key'] : undefined

    const items = results.Items
    return {
        items: items ? items.map((item) => item.file as FileJSON) : [],
        token
    }
}

async function saveGuFile(file: FileJSON): Promise<boolean> {
    const Item = {
        "key": `file:${file.metaData.id}`,
        file: file,
        lastModified: file.metaData.modifiedDate ? new Date(file.metaData.modifiedDate).getTime() : new Date().getTime(),
        "type": "file",
    };

    // todo: handle errors?
    await dynamo.put({
        TableName: DYNAMODB_TABLE,
        Item
    });

    return true;
}

async function saveGuFiles(files: Array<FileJSON>): Promise<Array<boolean>> {
    return Promise.all(files.map(saveGuFile))
}


function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
    return value !== null && value !== undefined;
}

export async function update({fetchAll = false, fileIds = [], prod = false}: { fetchAll: boolean; fileIds: string[]; prod: boolean}, config: Config, auth: JWT): Promise<unknown> {
    var guFiles: Array<FileJSON>;
    if (fileIds.length > 0) {
        guFiles = (await Promise.all(fileIds.map(getGuFile))).filter(notEmpty);
    } else {
        const db = await getStateDb();
        const changeList = fetchAll ?
            await drive.fetchAllChanges(undefined, auth) :
            await drive.fetchRecentChanges(1 + Number(db.lastChangeId), auth);

        console.log(`${changeList.items.length} changes. Largest ChangeId: ${changeList.largestChangeId}`);

        await saveStateDb(changeList.largestChangeId);

        const filesMetadata = changeList.items.map(change => change.file).filter((x) => x !== undefined)

        const unfilteredFiles = await Promise.all(filesMetadata.map(metaData => {
            if (metaData.id) {
                return getGuFile(metaData.id).then((fileCache) => {
                    if (fileCache) {
                        fileCache.metaData = metaData
                        return fileCache
                    } else {
                        return {metaData}
                    }
                })
            } else {
                return null;
            }
        }))
        guFiles = unfilteredFiles.filter(notEmpty); // filter any broken/unrecognized
    }

    const updatedJson: FileJSON[] = await Promise.all(
        guFiles.map(fileJson => {
            const id = fileJson.metaData.id;
            const title = fileJson.metaData.title;
            return updateFile(prod, config, auth, fileJson)
                .catch(err => {
                    console.error(`Failed to upload file ${id} - ${title}`)
                    console.error(err);
                    return;
                })
                .then(() =>
                    fetchDomainPermissions(fileJson, auth, config.require_domain_permissions, config.client_email)
                        .catch(err => {
                            console.error(`Failed fetch domain permissions for ${id} - ${title}`)
                            console.error(err);
                            return fileJson.domainPermissions;
                        })
                        .then(perms => ({
                            ...fileJson,
                            lastUploadProd: prod ? fileJson.metaData.modifiedDate : fileJson.lastUploadProd,
                            lastUploadTest: fileJson.metaData.modifiedDate,
                            domainPermissions: perms,
                        }))
                )
        })
    );

    console.log("Storing file metadata")
    return await saveGuFiles(updatedJson);
}
//}
