import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import archieml from 'archieml'
import type { JWT } from 'google-auth-library'
import type { drive_v2, sheets_v4 } from 'googleapis';
import { standardAwsConfig } from './awsIntegration';
import * as drive from './drive'
import { delay, notEmpty } from './util'

export interface Config {
    testFolder: string;
    s3domain: string;
    prodFolder: string;
    require_domain_permissions: string;
    s3bucket: string;
    client_email: string;
    baseUrl: string;
}

const s3Client = new S3Client(standardAwsConfig);

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
    const domainPermission = (perms.data.items ?? []).find(i => i.name === requiredDomain)
    if (typeof domainPermission?.role === "string") {
        return domainPermission.role;
    } else if((perms.data.items ?? []).find(i => i.emailAddress === client_email) !== undefined) {
        return 'none';
    } else {
        return 'unknown';
    }
}

async function uploadToS3(body: object, prod: boolean, s3bucket: string, title: string, id: string, folder: string): Promise<void> {
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

async function fetchFileJSON(file: FileJSON, auth: JWT): Promise<object> {
    if (file.metaData.mimeType === 'application/vnd.google-apps.document') {
        return fetcDocJSON(file.metaData.id, file.metaData.title, auth);
    } else if (file.metaData.mimeType === 'application/vnd.google-apps.spreadsheet') {
        return fetchSpreadsheetJSON(file, auth);
    } else {
        throw `mimeType ${file.metaData.mimeType} not recognized`
    }
}

async function fetcDocJSON(id: string, title: string, auth: JWT): Promise<object> {
    const doc = await drive.getDoc(id, auth);
    return archieml.load(cleanRaw(title, doc.data));
}

async function fetchSheetJSON(sheet: sheets_v4.Schema$Sheet, exportLinks: drive_v2.Schema$File['exportLinks'], id: string, title: string, auth: JWT) {
    if (!notEmpty(exportLinks)) {
        throw new Error("Missing export links")
    }
    const response = await drive.getSheet(id, sheet.properties?.title ?? "", auth)
    if (sheet.properties?.title !== 'tableDataSheet') {
        const headings = response.data.values?.[0] ?? [];
        return {[sheet.properties?.title ?? ""]: response.data.values?.slice(1).map((row) => {
            return Object.fromEntries<string>(headings.map((k, i) => [k, row[i]]));
        }) ?? [] }
    } else {
        return {[sheet.properties.title]: response.data.values as string[][] }
    }
}

const requestSpacing = 200;

async function fetchSpreadsheetJSON(file: FileJSON, auth: JWT): Promise<{'sheets': Record<string, Array<Record<string, string>> | string[][]>}> {
    const spreadsheet = await drive.getSpreadsheet(file.metaData.id, auth);
    const delays = spreadsheet.data.sheets?.map((sheet, n) => {
        return delay((n + 1) * requestSpacing, () => fetchSheetJSON(sheet, file.metaData.exportLinks, file.metaData.id, file.metaData.title, auth));
    }) ?? [];
    try {
        const sheetJSONs = await Promise.all(delays.map(d => d.promise));
        file.properties = {
            isTable: sheetJSONs.findIndex(sheetJSON => sheetJSON['tableDataSheet'] !== undefined) > -1
        }
        return {
            sheets: sheetJSONs.reduce((a, b) => ({ ...a, ...b, }), {})
        };
    } catch (err) {
        delays.forEach(d => d.cancel());
        throw err;
    }
}