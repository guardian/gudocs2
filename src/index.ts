import serverlessExpress from '@codegenie/serverless-express';
import type { APIGatewayProxyResult, Context } from 'aws-lambda'
import type {
	APIGatewayEventRequestContext,
	APIGatewayProxyCallback,
	APIGatewayProxyEvent,
} from 'aws-lambda';
import { doSchedule, getConfig } from './actions';
import { createApp } from "./app";
import { IS_RUNNING_LOCALLY } from './awsIntegration';

const appPromise = createApp();

async function setup(event: APIGatewayProxyEvent, context: Context, callback: APIGatewayProxyCallback) {
	const app = await appPromise
	const se = serverlessExpress<APIGatewayProxyEvent, APIGatewayProxyResult>({ app })
	return se(event, context, callback)
}
  
export const handler = async (
	event: APIGatewayProxyEvent,
	context: Context,
	callback: APIGatewayProxyCallback,
): Promise<unknown> => {
	return await setup(event, context, callback)
}

export const scheduleHandler = async (
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of lambda API
	event: APIGatewayProxyEvent,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of lambda API
	context: APIGatewayEventRequestContext,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of lambda API
	callback: APIGatewayProxyCallback,
): Promise<string> => {
	const config = await getConfig()
	return await doSchedule(config)
};

if (IS_RUNNING_LOCALLY) {
	const PORT = 3037;
	void appPromise.then((app) => app.listen(PORT, () => {
		console.log(`Listening on port ${PORT}`);
		console.log(`Access via http://localhost:${PORT}`);
	}));
}