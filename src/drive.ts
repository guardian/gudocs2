import { drive_v2, google } from 'googleapis'
// import key from '../key.json'
import { docs } from 'googleapis/build/src/apis/docs';
import { secretPromiseGetter } from './awsIntegration';
import { STAGE } from './constants';
import { JWT } from 'google-auth-library'
import type { GaxiosPromise } from 'gaxios'
import { notEmpty } from './util';

var drive = google.drive('v2');
var sheets = google.sheets('v4');

export type DriveFileWithId = drive_v2.Schema$File & { id: string };

function hasId(file: drive_v2.Schema$File): file is DriveFileWithId {
    return notEmpty(file.id)
}

export interface ChangedFiles {
    items: Array<DriveFileWithId>;
    largestChangeId: number;
}

function changedFiles(changes: drive_v2.Schema$Change[] | undefined): Array<DriveFileWithId> {
    return changes?.map(item => item.file).filter(notEmpty).filter(hasId) || []
}

export async function fetchAllChanges(pageToken: string | undefined = undefined, auth: JWT): Promise<ChangedFiles> {
    const options = Object.assign({auth, 'maxResults': 1000}, pageToken ? {pageToken} : {});
    const page = await drive.changes.list(options);

    if (page.data.nextPageToken) {
        let nextPage = await fetchAllChanges(page.data.nextPageToken, auth);
        const pageLargestChangeId = Number(page.data.largestChangeId) || 0;
        const nextPageLargestChangeId = Number(nextPage.largestChangeId) || 0;
        return {
            items: (changedFiles(page.data.items)).concat(nextPage.items),
            largestChangeId: Math.max(pageLargestChangeId, nextPageLargestChangeId)
        };
    } else {
        return {
            items: changedFiles(page.data.items),
            largestChangeId: Number(page.data.largestChangeId) || 0,
        };
    }
}

export async function fetchRecentChanges(startChangeId: number, auth: JWT): Promise<ChangedFiles> {
    const options = {auth, startChangeId: startChangeId.toString(), 'maxResults': 25};
    const page = await drive.changes.list(options);
    return {
        items: changedFiles(page.data.items),
        largestChangeId: Number(page.data.largestChangeId) || 0,
    };
}

export function fetchFilePermissions(fileId: string, auth: JWT) {
    return drive.permissions.list({ auth, fileId })
}

export function getSpreadsheet(spreadsheetId: string, auth: JWT) {
    return sheets.spreadsheets.get({ auth, spreadsheetId })
}

export async function getDoc(fileId: string, auth: JWT): GaxiosPromise<string>  {
    return drive.files.export({
        auth,
        fileId: fileId,
        mimeType: 'text/plain'
    }) as GaxiosPromise<string>
}

export function getSheet(fileId: string, auth: JWT): GaxiosPromise<Blob> {
    return drive.files.export({
        auth,
        fileId: fileId,
        mimeType: 'text/csv'
    }) as GaxiosPromise<Blob>
}