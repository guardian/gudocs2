import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import archieml from 'archieml'
import type { JWT } from 'google-auth-library'
import type { drive_v2, sheets_v4 } from 'googleapis';
import Papa from 'papaparse'
import { s3AwsConfig } from './awsIntegration';
import * as drive from './drive'
import { delay } from './util'

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
    metaData: drive.DriveFile;
    lastUploadTest?: string | null | undefined;
    lastUploadProd?: string | null | undefined;
    domainPermissions?: string | undefined;
    properties?: FileProperties;
}

export function isTestCurrent(file: FileJSON) {
    return file.lastUploadTest === file.metaData.modifiedDate;
}

export function isProdCurrent(file: FileJSON) {
    return file.lastUploadProd === file.metaData.modifiedDate;
}

export function s3Url(file: FileJSON, s3domain: string, testFolder: string) { 
    return `${s3domain}/${testFolder}/${file.metaData.id}.json`
}

export async function fetchDomainPermissions(file: FileJSON, auth: JWT, requiredDomain: string, client_email: string): Promise<string> {
    const perms = await drive.fetchFilePermissions(file.metaData.id, auth);
    const domainPermission = (perms.data.items || []).find(i => i.name === requiredDomain)
    if (domainPermission?.role) {
        return domainPermission.role;
    } else if((perms.data.items || []).find(i => i.emailAddress === client_email)) {
        return 'none';
    } else {
        return 'unknown';
    }
}

async function uploadToS3(body: Object, prod: boolean, s3bucket: string, title: string, id: string, folder: string): Promise<void> {
    const uploadPath = `${folder}/${id}.json` 

    const command = new PutObjectCommand({
        Bucket: s3bucket,
        Key: uploadPath,
        Body: JSON.stringify(body),
        ACL: 'public-read',
        ContentType: 'application/json',
        CacheControl: prod ? 'max-age=30' : 'max-age=5'
    });
    
    try {
        await s3Client.send(command)
        console.log(`Uploaded ${title} to ${uploadPath}`)
    } catch (err) {
        console.error(`Call to S3 failed ${JSON.stringify(err)}`);
        throw "Upload to S3 failed";
    }
}

export async function updateFileInS3(publish: boolean, config: Config, auth: JWT, file: FileJSON): Promise<void> {
    console.log(`Fetching ${file.metaData.id} ${file.metaData.title} (${file.metaData.mimeType})`);

    const body = await fetchFileJSON(file, auth);
    if (body === undefined || body === null)
        {throw `Failed to fetch ${file.metaData.id} ${file.metaData.title}`;}

    console.log(`Uploading ${file.metaData.id} ${file.metaData.title} (${file.metaData.mimeType}) to S3 [test]`);
    await uploadToS3(body, false, config.s3bucket, file.metaData.title, file.metaData.id, config.testFolder);
    if (publish) {
        console.log(`Uploading ${file.metaData.id} ${file.metaData.title} (${file.metaData.mimeType}) to S3 [prod]`);
        await uploadToS3(body, true, config.s3bucket, file.metaData.title, file.metaData.id, config.prodFolder)
    }
}

function cleanRaw(title: string, s: string) {
    if (title.startsWith('[HTTP]')) {return s;}
    else {return s.replace(/http:\/\//g, 'https://');}
}

async function fetchFileJSON(file: FileJSON, auth: JWT): Promise<Object> {
    if (file.metaData.mimeType === 'application/vnd.google-apps.document') {
        return fetcDocJSON(file.metaData.id, file.metaData.title, auth);
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
    const csv = cleanRaw(title, text);
    const json = Papa.parse(csv, {'header': sheet.properties?.title !== 'tableDataSheet'}).data;
    return {[sheet.properties?.title || ""]: json};
}

async function fetchSpreadsheetJSON(file: FileJSON, auth: JWT) {
    const spreadsheet = await drive.getSpreadsheet(file.metaData.id, auth);
    let ms = 0;
    const delays = spreadsheet.data.sheets?.map((sheet, n) => {
        ms += n > delayCutoff ? delayMax : delayInitial * Math.pow(delayExp, n);
        return delay(ms, () => fetchSheetJSON(sheet, file.metaData.exportLinks, file.metaData.id, file.metaData.title, auth));
    }) || [];
    try {
        const sheetJSONs = await Promise.all(delays.map(d => d.promise));
        file.properties = {
            isTable: sheetJSONs.findIndex(sheetJSON => sheetJSON['tableDataSheet'] !== undefined) > -1
        }

        return {'sheets': Object.assign({}, ...sheetJSONs)};
    } catch (err) {
        delays.forEach(d => d.cancel());
        throw err;
    }
}