// import gu from '@guardian/koa-gu'
import archieml from 'archieml'
import Papa from 'papaparse'
import * as drive from './drive'
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { delay } from './util'
import { drive_v2, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library'
import { s3AwsConfig } from './awsIntegration';

// import createLimiter from './limiter'

// var s3limiter = createLimiter('s3', 50);

// interface Metadata {
//     id: string;
//     title: string;
//     alternateLink: string;
//     modifiedDate: string; // might be number?
//     mimeType: string;
// }

export interface Config {
    testFolder: string;
    s3domain: string;
    prodFolder: string;
    require_domain_permissions: string;
    s3bucket: string;
    client_email: string;
    baseUrl: string;
}

const s3Client = new S3Client(s3AwsConfig);

interface FileProperties {
    isTable?: boolean;
}

export interface FileJSON {
    lastUploadTest?: unknown;
    metaData: drive_v2.Schema$File;
    lastUploadProd?: unknown;
    domainPermissions?: string;
    properties?: FileProperties;
}

export function isTestCurrent(file: FileJSON) {
    return file.lastUploadTest === file.metaData.modifiedDate;
}

export function isProdCurrent(file: FileJSON) {
    return file.lastUploadProd === file.metaData.modifiedDate;
}

export function s3Url(file: FileJSON, s3domain: string, testFolder: string) { 
    return `${s3domain}/${testFolder}/${file.metaData.id || ""}.json`
}

export async function fetchDomainPermissions(file: FileJSON, auth: JWT, requiredDomain: string, client_email: string): Promise<string> {
    const perms = await drive.fetchFilePermissions(file.metaData.id || "", auth);
    const domainPermission = (perms.data.items || []).find(i => i.name === requiredDomain)
    if (domainPermission && domainPermission.role) {
        return domainPermission.role;
    } else if((perms.data.items || []).find(i => i.emailAddress === client_email)) {
        return 'none';
    } else {
        return 'unknown';
    }
}

function uploadToS3(body: Object, prod: Boolean, s3bucket: string, title: string, id: string, folder: string): Promise<unknown> {
    const uploadPath = `${folder}/${id}.json` 
    const params = {
        Bucket: s3bucket,
        Key: uploadPath,
        Body: JSON.stringify(body),
        ACL: 'public-read',
        ContentType: 'application/json',
        CacheControl: prod ? 'max-age=30' : 'max-age=5'
    }

    const command = new PutObjectCommand({
        Bucket: s3bucket,
        Key: uploadPath,
        Body: JSON.stringify(body),
        ACL: 'public-read',
        ContentType: 'application/json',
        CacheControl: prod ? 'max-age=30' : 'max-age=5'
    });
    
    // try {
    //     return s3Client.send(command).then(_ => {
    //         this[prod ? 'lastUploadProd' : 'lastUploadTest'] = this.metaData.modifiedDate // todo: store this somewhere
    //         console.log(`Uploaded ${title} to ${uploadPath}`)
    //     }).catch(err => {
    //         console.error(`Call to S3 failed ${JSON.stringify(err)} ${JSON.stringify(params)}`);
    //     })
    // } catch (err) {
    //     console.error(`Call to S3 failed ${JSON.stringify(err)} ${JSON.stringify(params)}`);
    // }
    return Promise.reject("uploading disabled");
}

export async function fileUpdate(publish: Boolean, config: Config, auth: JWT, file: FileJSON) {
    console.log(`Updating ${file.metaData.id} ${file.metaData.title} (${file.metaData.mimeType})`);

    const body = fetchFileJSON(file, auth);
    if (body === undefined)
        return;

    console.log(`Uploading ${file.metaData.id} ${file.metaData.title} (${file.metaData.mimeType}) to S3`);
    const p = uploadToS3(body, false, config.s3bucket, file.metaData.title || "", file.metaData.id || "", config.testFolder);
    if (publish && p) return p.then(() => 
        uploadToS3(body, true, config.s3bucket, file.metaData.title || "", file.metaData.id || "", config.prodFolder)
    );
    return p;
}

function cleanRaw(title: string, s: string) {
    if (title.startsWith('[HTTP]')) return s;
    else return s.replace(/http:\/\//g, 'https://');
}

async function fetchFileJSON(file: FileJSON, auth: JWT): Promise<Object> {
    if (file.metaData.mimeType === 'application/vnd.google-apps.document') {
        return fetcDocJSON(file.metaData.id || "", file.metaData.title || "", auth);
    } else if (file.metaData.mimeType === 'application/vnd.google-apps.spreadsheet') {
        return fetchSpreadsheetJSON(file, auth);
    } else {
        throw `mimeType ${file.metaData.mimeType} not recognized`
    }
}

async function fetcDocJSON(id: string, title: string, auth: JWT): Promise<Object> {
    const doc = await drive.getDoc(id, auth);
    return archieml.load(cleanRaw(title, doc.data));
}

// Some magic numbers that seem to make Google happy
const delayInitial = 500;
const delayExp = 1.6;
const delayCutoff = 8; // After this many sheets, just wait delayMax
const delayMax = 20000;

async function fetchSheetJSON(sheet: sheets_v4.Schema$Sheet, exportLinks: drive_v2.Schema$File['exportLinks'], id: string, title: string, auth: JWT) {
    if (!exportLinks) {
        throw new Error("Missing export links")
    }
    const response = await drive.getSheet(id, auth) // sheet.properties.sheetId - is that the individual sheet rather than the Spreadsheet?
    const text = await response.data.text();
    var csv = cleanRaw(title, text);
    var json = Papa.parse(csv, {'header': sheet.properties?.title !== 'tableDataSheet'}).data;
    return {[sheet.properties?.title || ""]: json};
}

async function fetchSpreadsheetJSON(file: FileJSON, auth: JWT) {
    var spreadsheet = await drive.getSpreadsheet(file.metaData.id || "", auth);
    var ms = 0;
    const delays = spreadsheet.data.sheets?.map((sheet, n) => {
        ms += n > delayCutoff ? delayMax : delayInitial * Math.pow(delayExp, n);
        return delay(ms, () => fetchSheetJSON(sheet, file.metaData.exportLinks, file.metaData.id || "", file.metaData.title || "", auth));
    }) || [];
    try {
        var sheetJSONs = await Promise.all(delays.map(d => d.promise));
        file.properties = {
            isTable: sheetJSONs.findIndex(sheetJSON => sheetJSON.tableDataSheet !== undefined) > -1
        }

        return {'sheets': Object.assign({}, ...sheetJSONs)};
    } catch (err) {
        delays.forEach(d => d.cancel());
        throw err;
    }
}