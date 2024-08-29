import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import type { JWT } from 'google-auth-library'
import { standardAwsConfig } from './awsIntegration';
import { DYNAMODB_TABLE } from './constants';
import * as drive from './drive'
import type { DriveFile } from './drive';
import { fetchDomainPermissions, updateFileInS3 } from './guFile'
import type { Config, FileJSON} from './guFile';
import { notEmpty } from './util';

export interface State {
    lastChangeId: number;
    lastSaved: Date;
}

const dynamo = DynamoDBDocument.from(new DynamoDB(standardAwsConfig), { marshallOptions: { removeUndefinedValues: true }});

export async function getStateDb(): Promise<State> {
    const result = await dynamo.get({
        TableName: DYNAMODB_TABLE,
        Key: {
            "key": "config"
        }
    })
    if (typeof result.Item?.['lastChangeId'] === "number" && typeof result.Item['lastSaved'] === "number") {
        return { lastChangeId: result.Item['lastChangeId'], lastSaved: new Date(result.Item['lastSaved']) };    
    } else {
        throw "State not found or invalid";
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

    if (result.Item !== undefined) {
        return result.Item['file'] as FileJSON
    } else {
        return null
    }
}

interface PaginatedResult<T> {
    items: T[];
    token: string | undefined;
}
export async function getAllGuFiles(start?: number): Promise<PaginatedResult<FileJSON>> {
    const results = await dynamo.query({
        TableName: DYNAMODB_TABLE,
        IndexName: "last-modified",
        ExpressionAttributeValues: {
            ':type': 'file',
            ':lastModified': start ?? 0,
        },
        ExpressionAttributeNames: {
            "#t": "type"
        },
        KeyConditionExpression: "#t = :type AND lastModified > :lastModified",
        ScanIndexForward: false,
        Limit: 50,
    })
    const lastEvaluatedKey = results.LastEvaluatedKey
    const token = lastEvaluatedKey !== undefined && typeof lastEvaluatedKey['key'] === "string" ? lastEvaluatedKey['key'] : undefined

    const items = results.Items
    return {
        items: items !== undefined ? items.map((item) => item['file'] as FileJSON) : [],
        token
    }
}

export async function saveGuFile(file: FileJSON): Promise<boolean> {
    const lastModified = notEmpty(file.metaData.modifiedDate) ? new Date(file.metaData.modifiedDate).getTime() : new Date().getTime();

    const Item = {
        "key": `file:${file.metaData.id}`,
        file: file,
        lastModified,
        "type": "file",
    };

    // todo: handle errors?
    await dynamo.put({
        TableName: DYNAMODB_TABLE,
        Item,
        ExpressionAttributeValues: {
            ':limit': lastModified,
        },
        ConditionExpression: "attribute_not_exists(lastModified) or lastModified <= :limit"
    });

    return true;
}

async function saveGuFiles(files: FileJSON[]): Promise<boolean[]> {
    return Promise.all(files.map(saveGuFile))
}

async function enrichDriveFilesFromCache(driveFiles: DriveFile[]): Promise<FileJSON[]> {
    return (await Promise.all(driveFiles.map(metaData => {
        return getGuFile(metaData.id).then((fileCache) => {
            return {
                ...fileCache,
                metaData
            }
        })
    })));
}

async function updateFiles(guFiles: FileJSON[], prod: boolean, config: Config, auth: JWT): Promise<FileJSON[]> {
    return await Promise.all(
        guFiles.map(fileJson => {
            const id = fileJson.metaData.id;
            const title = fileJson.metaData.title;
            return updateFileInS3(prod, config, auth, fileJson)
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
}

export async function publishFile(fileId: string, config: Config, auth: JWT): Promise<unknown> {
    const guFile = await getGuFile(fileId)
    if (notEmpty(guFile)) {
        const updatedJson = await updateFiles([guFile], true, config, auth)
        return await saveGuFiles(updatedJson);
    } else {
        throw `File ${fileId} not found in cache`
    }
}

export async function updateChanged(config: Config, auth: JWT): Promise<unknown> {
    const state = await getStateDb()
    const changes = await drive.fetchRecentChanges(1 + Number(state.lastChangeId), auth);
    const guFiles = await enrichDriveFilesFromCache(changes.items);
    const updatedJson = await updateFiles(guFiles, false, config, auth);
    await saveGuFiles(updatedJson);
    await saveStateDb(changes.largestChangeId);
    return 
}

//}
