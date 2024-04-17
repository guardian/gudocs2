import { drive_v2, google } from 'googleapis'
// import key from '../key.json'
import { docs } from 'googleapis/build/src/apis/docs';
import { secretPromiseGetter } from './awsIntegration';
import { STAGE } from './constants';
import { JWT } from 'google-auth-library'

var drive = google.drive('v2');
var sheets = google.sheets('v4');

secretPromiseGetter("google-key")

export async function fetchAllChanges(pageToken: string | undefined = undefined, auth: JWT): Promise<{ items: drive_v2.Schema$Change[], largestChangeId: number }> {
    const options = Object.assign({auth, 'maxResults': 1000}, pageToken ? {pageToken} : {});
    const page = await drive.changes.list(options);

    if (page.data.nextPageToken) {
        let nextPage = await fetchAllChanges(page.data.nextPageToken, auth);
        const pageLargestChangeId = Number(page.data.largestChangeId) || 0;
        const nextPageLargestChangeId = Number(nextPage.largestChangeId) || 0;
        return {
            items: (page.data.items || []).concat(nextPage.items),
            largestChangeId: Math.max(pageLargestChangeId, nextPageLargestChangeId)
        };
    } else {
        return {
            items: page.data.items || [],
            largestChangeId: Number(page.data.largestChangeId) || 0,
        };
    }
}

export async function fetchRecentChanges(startChangeId: string, auth: JWT): Promise<{ items: drive_v2.Schema$Change[], largestChangeId: number }> {
    const options = {auth, startChangeId, 'maxResults': 25};
    const page = await drive.changes.list(options);
    return {
        items: page.data.items || [],
        largestChangeId: Number(page.data.largestChangeId) || 0,
    };
}

export function fetchFilePermissions(fileId: string, auth: JWT) {
    return drive.permissions.list({ auth, fileId })
}

export function getSpreadsheet(spreadsheetId: string, auth: JWT) {
    return sheets.spreadsheets.get({ auth, spreadsheetId })
}

export async function getDoc(fileId: string, auth: JWT) {
    return drive.files.export({
        auth,
        fileId: fileId,
        mimeType: 'text/plain'
    }) as unknown as string
}

export async function getSheet(fileId: string, auth: JWT): Promise<string> {
    return await drive.files.export({
        auth,
        fileId: fileId,
        mimeType: 'text/csv'
    }) as unknown as string
}