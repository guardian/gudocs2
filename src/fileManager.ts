import { Config, GuFile, deserialize } from './guFile'
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

async function getGuFile(id: string): Promise<GuFile | null> {
    const result = await dynamo.get({
        TableName: DYNAMODB_TABLE,
        Key: {
            "key": `file:${id}`
        }
    })

    if (result.Item) {
        return result.Item.file as GuFile
    } else {
        return null
    }
}

type DynamoRecord =  Record<string, AttributeValue>;

interface PaginatedResult<T> {
    items: Array<T>;
    token: string;
}
export async function getAllGuFiles(start?: string): Promise<PaginatedResult<GuFile>> {
    const results = await dynamo.scan({
        TableName: DYNAMODB_TABLE,
        ExclusiveStartKey: {
            "key": start
        },
        Limit: 10,
    })
    const lastEvaluatedKey = results.LastEvaluatedKey
    const token = lastEvaluatedKey ? lastEvaluatedKey['key'] : undefined

    const items = results.Items
    return {
        items: items ? items.map((item) => item.file as GuFile) : [],
        token
    }
}

async function saveGuFile(id: GuFile): Promise<boolean> {
    // if (ids.length === 0) return [];

    const result = await dynamo.get({
        TableName: DYNAMODB_TABLE,
        Key: {
            "key": "config"
        }
    })

    // todo: fetch files from dynamodb
    // var keys = ids.map(id => `${gu.config.dbkey}:${id}`)
    // var strs = await gu.db.mget.call(gu.db, keys);
    // var jsons = strs.map(JSON.parse);
    // return jsons.map(json => json && deserialize(json));
    return Promise.reject("not implemented");
}

async function saveGuFiles(files: Array<GuFile>): Promise<Array<boolean>> {
    if (files.length === 0) return Promise.resolve([]);

    // var saveArgs = _.flatten( files.map(file => [`${gu.config.dbkey}:${file.id}`, file.serialize()]) )
    // await gu.db.mset.call(gu.db, saveArgs);

    // var indexArgs = _.flatten( files.map(file => [file.unixdate, file.id]) )
    // indexArgs.unshift(`${gu.config.dbkey}:index`)
    // await gu.db.zadd.call(gu.db, indexArgs);
    return Promise.all(files.map(saveGuFile))
}


function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
    return value !== null && value !== undefined;
}

export async function update({fetchAll = false, fileIds = [], prod = false}: { fetchAll: boolean; fileIds: string[]; prod: boolean}, config: Config, auth: JWT): Promise<unknown> {
    var guFiles: Array<GuFile>;
    if (fileIds.length > 0) {
        guFiles = (await Promise.all(fileIds.map(getGuFile))).filter(notEmpty);
    } else {
        const db = await getStateDb();
        const changeList = fetchAll ?
            await drive.fetchAllChanges(undefined, auth) :
            await drive.fetchRecentChanges((1 + Number(db.lastChangeId).toString()), auth);

        console.log(`${changeList.items.length} changes. Largest ChangeId: ${changeList.largestChangeId}`);

        await saveStateDb(changeList.largestChangeId);

        const filesMetadata = changeList.items.map(change => change.file).filter(Boolean) as Array<drive_v2.Schema$File> // todo: remove cast
        const files = filesMetadata.map(f => f.id).filter((x) => x !== undefined && x !== null) as Array<string> // todo: remove cast

        const unfilteredFiles = await Promise.all(filesMetadata.map(metaData => {
            if (metaData.id) {
                return getGuFile(metaData.id).then((fileCache) => {
                    if (fileCache) {
                        fileCache.metaData = metaData
                    }
                    return fileCache
                })
            } else {
                return deserialize({metaData}, config, auth)
            }
        }))
        guFiles = unfilteredFiles.filter(notEmpty); // filter any broken/unrecognized

    }

    var promises = guFiles.map(guFile => {
        return guFile.update(prod)
            .then(() => undefined)
            .catch(err => {
                console.error('Failed to update', guFile.id, guFile.title)
                console.error(err);
                return guFile;
            });
    });

    var fails = (await Promise.all(promises)).filter(notEmpty);
    if (fails.length > 0) {
        console.error('The following updates failed');
        fails.forEach(fail => console.error(`\t${fail.id} ${fail.title}`));
    }

    return await saveGuFiles(guFiles);
}
//}
