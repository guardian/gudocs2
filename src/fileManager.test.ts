import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { mock } from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { drive_v2, google, sheets_v4 } from 'googleapis';
import { DeadlineExceededError } from './deadline';
import { publishFile } from './fileManager';
import type { Config, FileJSON } from './guFile';

const fileId = 'example-sheet';
const config: Config = {
    testFolder: 'test', prodFolder: 'prod', s3bucket: 'unused', s3domain: 'unused',
    require_domain_permissions: 'example.com', client_email: 'test@example.com',
    baseUrl: '/', scheduleEnabled: false, legacyKey: '',
};

function stubPublishDependencies(tracker: typeof mock) {
    const file: FileJSON = {
        metaData: {
            id: fileId,
            title: 'Example spreadsheet',
            mimeType: 'application/vnd.google-apps.spreadsheet',
            modifiedDate: '2026-11-26T08:00:00Z',
            exportLinks: {},
        },
    };

    tracker.method(DynamoDBDocument.prototype, 'get', async () => ({ Item: { file } }));
    tracker.method(drive_v2.Resource$Permissions.prototype, 'list', async () => ({ data: { items: [] } }));
    return {
        upload: tracker.method(S3Client.prototype, 'send', async () => ({})),
        save: tracker.method(DynamoDBDocument.prototype, 'put', async () => ({})),
    };
}

void test('publishFile uploads a spreadsheet to test and prod and saves its status', async t => {
    const { upload, save } = stubPublishDependencies(t.mock);
    t.mock.method(sheets_v4.Resource$Spreadsheets.prototype, 'get', async () => ({
        data: { sheets: [{ properties: { title: 'Example' } }] },
    }));
    t.mock.method(sheets_v4.Resource$Spreadsheets$Values.prototype, 'get', async () => ({
        data: { values: [['headline'], ['Example']] },
    }));

    assert.deepEqual(await publishFile(fileId, config, new google.auth.JWT()), [true]);
    assert.equal(upload.mock.callCount(), 2);
    assert.equal(save.mock.callCount(), 1);
});

void test('publishFile propagates a Sheets timeout without uploading or saving', { timeout: 2_000 }, async t => {
    const { upload, save } = stubPublishDependencies(t.mock);
    t.mock.method(console, 'error', () => undefined);
    // The installed Node types predate the mock timer options object.
    (t.mock.timers.enable as unknown as (options: { apis: string[] }) => void)({ apis: ['setTimeout'] });
    const started = new Promise<AbortSignal>(resolve => {
        t.mock.method(sheets_v4.Resource$Spreadsheets.prototype, 'get', (_params: unknown, { signal }: { signal: AbortSignal }) => {
            resolve(signal);
            return new Promise<never>(() => undefined);
        });
    });

    const publishing = publishFile(fileId, config, new google.auth.JWT());
    const rejected = assert.rejects(publishing, error =>
        error instanceof DeadlineExceededError && error.message === 'Timed out: sheets.metadata'
    );
    const signal = await started;
    t.mock.timers.tick(20_000);
    await rejected;

    assert.equal(signal.aborted, true);
    assert.equal(upload.mock.callCount(), 0);
    assert.equal(save.mock.callCount(), 0);
});
