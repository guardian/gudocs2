import {
	APIGatewayProxyEvent,
	APIGatewayEventRequestContext,
	APIGatewayProxyCallback,
} from 'aws-lambda';
import { State, getAllGuFiles, getStateDb, update } from './fileManager';

import { google } from 'googleapis'
import { configPromiseGetter, secretPromiseGetter } from './awsIntegration';
import { STAGE } from './constants';
import { Config, isProdCurrent, isTestCurrent, s3Url } from './guFile';
import { renderToString } from 'react-dom/server';
import { index } from './templates';
import { style } from './templates/style';


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
		baseUrl,
	}
}

export const doSchedule = async (): Promise<string> => {
	const auth = await getAuth();
	const config = await getConfig();
	return await update({ fetchAll: false, fileIds: [], prod: false }, config, auth).then(() => "Schedule done");
};

export const scheduleHandler = async (
	event: APIGatewayProxyEvent,
	context: APIGatewayEventRequestContext,
	callback: APIGatewayProxyCallback,
): Promise<string> => {
	return await doSchedule()
};

export const doPublish = async (fileId: string, test: boolean): Promise<string> => {
	// todo: this should return HTML rather than JSON
	const auth = await getAuth();
	const config = await getConfig();
	return await update({ fetchAll: false, fileIds: [fileId], prod: !test }, config, auth).then(() => "File published")
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
	return doPublish(fileId, !!test)
};

export interface DocumentInfo {
	domainPermissions: string;
	iconLink: string | null | undefined;
	modifiedDate: string | null | undefined;
	urlDocs: string | null | undefined;
	isTable: boolean | undefined;
	isTestCurrent: boolean | undefined;
	urlTest: string;
	isProdCurrent: boolean | undefined;
	urlProd: string;
	id: string;
	title: string;
	lastModifyingUserName: string | null | undefined;
}

interface Response {
	token: string;
	dev: string | undefined;
	state: State;
	files: Array<DocumentInfo>;
}

export async function renderDashboard() {
	const config = await getConfig();
	const state = await getStateDb();
	const r = await readDocuments(undefined, undefined);
	return renderToString(index(
		style,
		state.lastSaved.toISOString(),
		config.client_email,
		config.require_domain_permissions,
		r.files,
		config.baseUrl
	));
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
		urlDocs: file.metaData.alternateLink,
		isTable: file.properties?.isTable,
		isTestCurrent: isTestCurrent(file),
		urlTest: s3Url(file, config.s3domain, config.testFolder),
		isProdCurrent: isProdCurrent(file),
		urlProd: s3Url(file, config.s3domain, config.prodFolder),
		id: file.metaData.id || "",
		title: file.metaData.title || "",
		lastModifyingUserName: file.metaData.lastModifyingUserName,
	})
	})
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