import serverlessExpress from '@codegenie/serverless-express';
import type { APIGatewayProxyResult } from 'aws-lambda'
import type {
	APIGatewayEventRequestContext,
	APIGatewayProxyCallback,
	APIGatewayProxyEvent,
} from 'aws-lambda';
import { doSchedule, getConfig } from './actions';
import { createApp } from "./app";
import { IS_RUNNING_LOCALLY } from './awsIntegration';

const appPromise = createApp();

const app = await appPromise;

export const handler = serverlessExpress<APIGatewayProxyEvent, APIGatewayProxyResult>({ app })

export const scheduleHandler = async (
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of lambda API
	event: APIGatewayProxyEvent,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of lambda API
	context: APIGatewayEventRequestContext,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of lambda API
	callback: APIGatewayProxyCallback,
): Promise<string> => {
	console.log("Starting scheduled lambda")
	const config = await getConfig()
	if (config.scheduleEnabled) {
		console.log("Running schedule")
		return await doSchedule(config)
	} else {
		console.log("Schedule disabled - skipping")
		return "Schedule disabled"
	}
};

if (IS_RUNNING_LOCALLY) {
	const PORT = 3037;
	void appPromise.then((app) => app.listen(PORT, () => {
		console.log(`Listening on port ${PORT}`);
		console.log(`Access via http://localhost:${PORT}`);
	}));
}