import {
	APIGatewayProxyEvent,
	APIGatewayEventRequestContext,
	APIGatewayProxyCallback,
} from 'aws-lambda';
import { State, getAllGuFiles, getStateDb, update } from './fileManager';

import { google } from 'googleapis'
import { configPromiseGetter, secretPromiseGetter } from './awsIntegration';
import { STAGE } from './constants';
import { Config } from './guFile';


const getAuth = async () => {
	const googleServiceAccountDetails = JSON.parse(
		await secretPromiseGetter(
			`google/${STAGE === "PROD" ? "PROD" : "CODE"}/serviceAccountKey`
		)
	);
	
	return new google.auth.JWT(googleServiceAccountDetails.client_email, undefined, googleServiceAccountDetails.private_key, ['https://www.googleapis.com/auth/drive']);
}

const getConfig = async (): Promise<Config> => {
	const testFolder = await configPromiseGetter(`s3/${STAGE === "PROD" ? "PROD" : "CODE"}/testFolder`)
	const prodFolder = await configPromiseGetter(`s3/${STAGE === "PROD" ? "PROD" : "CODE"}/prodFolder`)
	const s3domain = await configPromiseGetter(`s3/${STAGE === "PROD" ? "PROD" : "CODE"}/s3domain`)
	const s3bucket = await configPromiseGetter(`s3/${STAGE === "PROD" ? "PROD" : "CODE"}/s3bucket`)
	const require_domain_permissions = await configPromiseGetter(`${STAGE === "PROD" ? "PROD" : "CODE"}/require_domain_permissions`)
	const client_email = await configPromiseGetter(`google/${STAGE === "PROD" ? "PROD" : "CODE"}/client_email`)
	await configPromiseGetter(`s3/${STAGE === "PROD" ? "PROD" : "CODE"}/testFolder`)

	return {
		testFolder,
		s3domain,
		prodFolder,
		require_domain_permissions,
		s3bucket,
		client_email,
	}
}

export const scheduleHandler = async (
	event: APIGatewayProxyEvent,
	context: APIGatewayEventRequestContext,
	callback: APIGatewayProxyCallback,
): Promise<string> => {
	const auth = await getAuth();
	const config = await getConfig();
	return await update({ fetchAll: false, fileIds: [], prod: false }, config, auth).then(() => "Schedule done");
};

export const publishHandler = async (
	event: APIGatewayProxyEvent,
	context: APIGatewayEventRequestContext,
	callback: APIGatewayProxyCallback,
): Promise<string> => {
	const auth = await getAuth();
	const config = await getConfig();
	if (event.httpMethod !== "POST") {
		throw new Error("Method not allowed")
	}
	const body = event.body ? JSON.parse(event.body) : {};
	const test = (event.queryStringParameters || {})["test"];
	const fileId = body["id"];
	if (!fileId) {
		throw new Error("File ID not found")
	}
	return await update({ fetchAll: false, fileIds: [fileId], prod: !test }, config, auth).then(() => "File published")
};

interface DocumentInfo {
	domainPermissions: unknown;
	iconLink: string | null | undefined;
	modifiedDate: string | null | undefined;
	urlDocs: string | null | undefined;
	isTable: boolean | undefined;
	isTestCurrent: boolean | undefined;
	urlTest: string;
	isProdCurrent: boolean | undefined;
	urlProd: string;
	id: string;
}

interface Response {
	token: string;
	dev: string | undefined;
	state: State;
	files: Array<DocumentInfo>;
}

export async function readDocuments(lastModified: number | undefined, dev: string | undefined): Promise<Response> {
	const state = await getStateDb();
	const filesResponse = await getAllGuFiles(lastModified)
	const config = await getConfig();
	const files = filesResponse.items.map((file) => {
		return ({
		domainPermissions: file.domainPermissions,
		iconLink: file.metaData.iconLink,
		modifiedDate: file.metaData.modifiedDate,
		urlDocs: file.urlDocs,
		isTable: file.properties.isTable,
		isTestCurrent: file.isTestCurrent(),
		urlTest: file.urlTest,
		isProdCurrent: file.isProdCurrent(),
		urlProd: file.urlProd,
		id: file.id
	}))
	return {
		token: filesResponse.token,
		dev,
		state,
		files
	}
}

export const getDocuments = async (
	event: APIGatewayProxyEvent,
	context: APIGatewayEventRequestContext,
	callback: APIGatewayProxyCallback,
): Promise<Response> => {
	const lastModified = Number((event.queryStringParameters || {})["lastModified"]) || 0
	const dev = (event.queryStringParameters || {})["dev"];
	return readDocuments(lastModified, dev);
};