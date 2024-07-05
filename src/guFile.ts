// import gu from '@guardian/koa-gu'
import archieml from 'archieml'
import Papa from 'papaparse'
import * as drive from './drive'
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { delay } from './util'
import { drive_v2, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library'

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
}

const s3Client = new S3Client({});

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

export abstract class GuFile {
    metaData: drive_v2.Schema$File;
    lastUploadTest: unknown;
    lastUploadProd: unknown;
    domainPermissions: string;
    properties: FileProperties;
    config: Config;
    auth: JWT;

    constructor({metaData, lastUploadTest = null, lastUploadProd = null, domainPermissions = 'unknown', properties = {}}: FileJSON, config: Config, auth: JWT) {
        this.metaData = metaData;
        this.lastUploadTest = lastUploadTest;
        this.lastUploadProd = lastUploadProd;
        this.domainPermissions = domainPermissions;
        this.properties = properties;
        this.auth = auth;
        this.config = config;
    }

    get id() { return this.metaData.id || "" }
    get title() { return this.metaData.title || "" }

    get pathTest() { return `${this.config.testFolder}/${this.id}.json` }
    get urlTest() { return `${this.config.s3domain}/${this.pathTest}` }

    get pathProd() { return `${this.config.prodFolder}/${this.id}.json` }
    get urlProd() { return `${this.config.s3domain}/${this.pathProd}` }

    get urlDocs() { return this.metaData.alternateLink; }

    get unixdate() { return Date.parse(this.metaData.modifiedDate || ""); }

    isTestCurrent() { return this.lastUploadTest === this.metaData.modifiedDate }
    isProdCurrent() { return this.lastUploadProd === this.metaData.modifiedDate }

    serializeJSON() {
        const fileJson: FileJSON = {
            metaData: this.metaData,
            lastUploadTest: this.lastUploadTest,
            lastUploadProd: this.lastUploadProd,
            domainPermissions: this.domainPermissions,
            properties: this.properties
        }
        return fileJson;
    }

    cleanRaw(s: string) {
        if (this.title.startsWith('[HTTP]')) return s;
        else return s.replace(/http:\/\//g, 'https://');
    }

    async fetchDomainPermissions(): Promise<string> {
        var configuredRequireDomainPermissions = this.config.require_domain_permissions;
        if (configuredRequireDomainPermissions) {
            var perms = await drive.fetchFilePermissions(this.id, this.auth);
            var domainPermission = (perms.data.items || []).find(i => i.name === configuredRequireDomainPermissions)
            if (domainPermission && domainPermission.role) {
                return domainPermission.role;
            } else if((perms.data.items || []).find(i => i.emailAddress === this.config.client_email)) {
                return 'none';
            } else {
                return 'unknown';
            }
        } else {
            return 'disabled';
        }
    }

    async update(publish: Boolean) {
        console.log(`Updating ${this.id} ${this.title} (${this.metaData.mimeType})`);

        var body = await this.fetchFileJSON();
        this.domainPermissions = await this.fetchDomainPermissions();

        console.log(`Uploading ${this.id} ${this.title} (${this.metaData.mimeType}) to S3`);
        const p = this.uploadToS3(body, false);
        if (publish && p) return p.then(() => this.uploadToS3(body, true));
        return p;
    }

    uploadToS3(body: Object, prod: Boolean) {
        const uploadPath = prod ? this.pathProd : this.pathTest;
        const params = {
            Bucket: this.config.s3bucket,
            Key: uploadPath,
            Body: JSON.stringify(body),
            ACL: 'public-read',
            ContentType: 'application/json',
            CacheControl: prod ? 'max-age=30' : 'max-age=5'
        }

        const command = new PutObjectCommand({
            Bucket: this.config.s3bucket,
            Key: uploadPath,
            Body: JSON.stringify(body),
            ACL: 'public-read',
            ContentType: 'application/json',
            CacheControl: prod ? 'max-age=30' : 'max-age=5'
        });
        
        try {
            return s3Client.send(command).then(_ => {
                this[prod ? 'lastUploadProd' : 'lastUploadTest'] = this.metaData.modifiedDate
                console.log(`Uploaded ${this.title} to ${uploadPath}`)
            }).catch(err => {
                console.error(`Call to S3 failed ${JSON.stringify(err)} ${JSON.stringify(params)}`);
            })
        } catch (err) {
            console.error(`Call to S3 failed ${JSON.stringify(err)} ${JSON.stringify(params)}`);
        }
    }

    abstract fetchFileJSON(): Promise<Object>
    
}

class DocsFile extends GuFile {
    async fetchFileJSON(): Promise<Object> {
      const doc = await drive.getDoc(this.metaData.id || "", this.auth);
      return archieml.load(doc);
    }
}

// Some magic numbers that seem to make Google happy
const delayInitial = 500;
const delayExp = 1.6;
const delayCutoff = 8; // After this many sheets, just wait delayMax
const delayMax = 20000;

class SheetsFile extends GuFile {
    async fetchFileJSON() {
        var spreadsheet = await drive.getSpreadsheet(this.id, this.auth);
        var ms = 0;
        const delays = spreadsheet.data.sheets?.map((sheet, n) => {
            ms += n > delayCutoff ? delayMax : delayInitial * Math.pow(delayExp, n);
            return delay(ms, () => this.fetchSheetJSON(sheet));
        }) || [];
        try {
            var sheetJSONs = await Promise.all(delays.map(d => d.promise));
            this.properties.isTable = sheetJSONs.findIndex(sheetJSON => sheetJSON.tableDataSheet !== undefined) > -1;

            return {'sheets': Object.assign({}, ...sheetJSONs)};
        } catch (err) {
            delays.forEach(d => d.cancel());
            throw err;
        }
    }

    async fetchSheetJSON(sheet: sheets_v4.Schema$Sheet) {
        let exportLinks = this.metaData.exportLinks
        if (!exportLinks) {
            throw new Error("Missing export links")
        }
        const x = await drive.getSheet(this.metaData.id || "", this.auth) // sheet.properties.sheetId - is that the individual sheet rather than the Spreadsheet?
        var csv = this.cleanRaw(x);
        var json = Papa.parse(csv, {'header': sheet.properties?.title !== 'tableDataSheet'}).data;
        return {[sheet.properties?.title || ""]: json};
    }
}

const types: Record<string, typeof SheetsFile | typeof DocsFile> = {
    'application/vnd.google-apps.spreadsheet': SheetsFile,
    'application/vnd.google-apps.document': DocsFile
};

export function deserialize(json: FileJSON, config: Config, auth: JWT): GuFile | undefined {
    const FileClass = types[json.metaData.mimeType || ""];
    if (!FileClass) {
        console.warn(`mimeType ${json.metaData.mimeType} not recognized`);
    } else {
        return new FileClass(json, config, auth);
    }
}
