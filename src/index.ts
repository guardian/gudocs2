import type {
	APIGatewayEventRequestContext,
	APIGatewayProxyCallback,
	APIGatewayProxyEvent,
} from 'aws-lambda';
import { google } from 'googleapis'
import { renderToString } from 'react-dom/server';
import { configPromiseGetter, secretPromiseGetter } from './awsIntegration';
import type { State} from './fileManager';
import { getAllGuFiles, getStateDb, publishFile, updateChanged } from './fileManager';
import type { Config} from './guFile';
import { isProdCurrent, isTestCurrent, s3Url } from './guFile';
import { index } from './templates';
import { style } from './templates/style';
import { numberOrZero } from './util';

interface GoogleAccountDetails {
	client_email: string;
	private_key: string;
}

const getAuth = async () => {
	const googleServiceAccountDetails = JSON.parse(await secretPromiseGetter("serviceAccountKey")) as GoogleAccountDetails;
	return new google.auth.JWT(googleServiceAccountDetails.client_email, undefined, googleServiceAccountDetails.private_key, ['https://www.googleapis.com/auth/drive']);
}

const getConfig = async (): Promise<Config> => {
	const testFolder = "docsdata-test"
	const prodFolder = "docsdata"
	const s3domain = await configPromiseGetter("s3domain")
	const s3bucket = await configPromiseGetter("s3bucket")
	const require_domain_permissions = await configPromiseGetter("require_domain_permissions")
	const client_email = await configPromiseGetter("client_email")
	const baseUrl = await configPromiseGetter("base_url")

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
	return await updateChanged(config, auth).then(() => "Schedule done");
};

export const scheduleHandler = async (
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of lambda API
	event: APIGatewayProxyEvent,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of lambda API
	context: APIGatewayEventRequestContext,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of lambda API
	callback: APIGatewayProxyCallback,
): Promise<string> => {
	return await doSchedule()
};

export const doPublish = async (fileId: string): Promise<string> => {
	// todo: this should return HTML rather than JSON
	const auth = await getAuth();
	const config = await getConfig();
	return await publishFile(fileId, config, auth).then(() => "File published")
};

export const publishHandler = async (
	event: APIGatewayProxyEvent,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of lambda API
	context: APIGatewayEventRequestContext,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of lambda API
	callback: APIGatewayProxyCallback,
): Promise<string> => {
	if (event.httpMethod !== "POST") {
		throw new Error("Method not allowed")
	}
	const body = event.body ? JSON.parse(event.body) : {}; // todo: fix this to be a form post
	const fileId = body["id"];
	if (!fileId) {
		throw new Error("File ID not found")
	}
	return doPublish(fileId)
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
	token: string | undefined;
	dev: string | undefined;
	state: State;
	files: DocumentInfo[];
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
		domainPermissions: file.domainPermissions ?? "unknown",
		iconLink: file.metaData.iconLink,
		modifiedDate: file.metaData.modifiedDate,
		urlDocs: file.metaData.alternateLink,
		isTable: file.properties?.isTable,
		isTestCurrent: isTestCurrent(file),
		urlTest: s3Url(file, config.s3domain, config.testFolder),
		isProdCurrent: isProdCurrent(file),
		urlProd: s3Url(file, config.s3domain, config.prodFolder),
		id: file.metaData.id,
		title: file.metaData.title,
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
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of lambda API
	context: APIGatewayEventRequestContext,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of lambda API
	callback: APIGatewayProxyCallback,
): Promise<Response> => {
	const lastModified = numberOrZero(event.queryStringParameters?.["lastModified"])
	const dev = event.queryStringParameters?.["dev"];
	return readDocuments(lastModified, dev);
};