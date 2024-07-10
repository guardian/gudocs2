import serverlessExpress from '@codegenie/serverless-express';
import type { Handler } from 'aws-lambda'
import { createApp } from "./app";
import { IS_RUNNING_LOCALLY } from './awsIntegration';

const app = createApp();

export const handler: Handler = serverlessExpress({ app });

if (IS_RUNNING_LOCALLY) {
	const PORT = 3030;
	app.listen(PORT, () => {
		console.log(`Listening on port ${PORT}`);
		console.log(`Access via http://localhost:${PORT}`);
	});
}