import serverlessExpress from '@codegenie/serverless-express';
import type { Handler } from 'aws-lambda'
import type {
	APIGatewayEventRequestContext,
	APIGatewayProxyCallback,
	APIGatewayProxyEvent,
} from 'aws-lambda';
import { doSchedule } from './actions';
import { createApp } from "./app";
import { IS_RUNNING_LOCALLY } from './awsIntegration';

const app = createApp();

export const handler: Handler = serverlessExpress({ app });

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

if (IS_RUNNING_LOCALLY) {
	const PORT = 3030;
	app.listen(PORT, () => {
		console.log(`Listening on port ${PORT}`);
		console.log(`Access via http://localhost:${PORT}`);
	});
}