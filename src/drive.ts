import type { GaxiosPromise } from 'gaxios'
import type { JWT } from 'google-auth-library'
import type { drive_v2, sheets_v4} from 'googleapis';
import { google } from 'googleapis'
import { notEmpty, numberOrZero } from './util';

const drive = google.drive('v2');
const sheets = google.sheets('v4');

export type DriveFile = drive_v2.Schema$File & { id: string } & { title: string };

function isDriveFile(file: drive_v2.Schema$File): file is DriveFile {
    return notEmpty(file.id) && notEmpty(file.title)
}

export interface ChangedFiles {
    items: DriveFile[];
    largestChangeId: number;
}

function changedFiles(changes: drive_v2.Schema$Change[] | undefined): DriveFile[] {
    return changes?.map(item => item.file).filter(notEmpty).filter(isDriveFile) ?? []
}


export async function fetchAllChanges(pageToken: string | undefined = undefined, auth: JWT): Promise<ChangedFiles> {
    const options = Object.assign({auth, 'maxResults': 1000}, pageToken !== undefined ? {pageToken} : {});
    const page = await drive.changes.list(options);

    if (notEmpty(page.data.nextPageToken)) {
        const nextPage = await fetchAllChanges(page.data.nextPageToken, auth);
        const pageLargestChangeId = numberOrZero(page.data.largestChangeId);
        const nextPageLargestChangeId = nextPage.largestChangeId;
        return {
            items: (changedFiles(page.data.items)).concat(nextPage.items),
            largestChangeId: Math.max(pageLargestChangeId, nextPageLargestChangeId)
        };
    } else {
        return {
            items: changedFiles(page.data.items),
            largestChangeId: numberOrZero(page.data.largestChangeId),
        };
    }
}

export async function fetchRecentChanges(startChangeId: number, auth: JWT): Promise<ChangedFiles> {
    const options = {auth, startChangeId: startChangeId.toString(), 'maxResults': 25};
    const page = await drive.changes.list(options);
    return {
        items: changedFiles(page.data.items),
        largestChangeId: numberOrZero(page.data.largestChangeId),
    };
}

export function fetchFilePermissions(fileId: string, auth: JWT) {
    return drive.permissions.list({ auth, fileId })
}

export function getSpreadsheet(spreadsheetId: string, auth: JWT) {
    return sheets.spreadsheets.get({ auth, spreadsheetId })
}

export function getDoc(fileId: string, auth: JWT): GaxiosPromise<string>  {
    return drive.files.export({
        auth,
        fileId: fileId,
        mimeType: 'text/plain'
    }) as GaxiosPromise<string>
}

export async function getSheet(spreadsheetId: string, sheetName: string, auth: JWT): GaxiosPromise<sheets_v4.Schema$ValueRange> {
    return await sheets.spreadsheets.values.get({ auth, spreadsheetId, range: `${sheetName}!A:ZZ`, valueRenderOption: 'FORMATTED_VALUE' })
}