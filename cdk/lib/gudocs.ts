import { GuApiGatewayWithLambdaByPath, GuScheduledLambda } from '@guardian/cdk';
import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import { GuStack } from '@guardian/cdk/lib/constructs/core';
import { GuVpc } from '@guardian/cdk/lib/constructs/ec2/vpc'
import { GuLambdaFunction } from '@guardian/cdk/lib/constructs/lambda';
import type { App } from 'aws-cdk-lib';
import { Schedule } from 'aws-cdk-lib/aws-events';
import { Runtime } from 'aws-cdk-lib/aws-lambda';


const APP_NAME = 'gudocs';

export class GuDocs extends GuStack {
	constructor(
		scope: App,
		id: string,
		props: GuStackProps
	) {
		super(scope, id, props);

		const app = "gudocs";
		const vpc = GuVpc.fromIdParameter(this, "vpc");
		const runtime = Runtime.NODEJS_18_X;
		const fileName = "index.js";
		const environment = {
			"Stage": this.stage,
		};

		const vpcSubnets = {
			subnets: GuVpc.subnetsFromParameter(this),
		};

		const sharedLambdaProps = {
			runtime,
			fileName,
			vpc,
			vpcSubnets,
			environment,
		};

		const getDocumentsLambda = new GuLambdaFunction(this, "get-documents", {
			handler: "dist/lambda/index.getDocuments",
			functionName: `gudocs-get-document-${this.stage}`,
			app: `${app}-get-documents`,
			...sharedLambdaProps,			
		});

		const publishLambda = new GuLambdaFunction(this, "publish", {
			handler: "dist/lambda/index.publishHandler",
			functionName: `gudocs-publish-${this.stage}`,
			app: `${app}-publish`,
			...sharedLambdaProps,
		});

		new GuApiGatewayWithLambdaByPath(this, {
			app: "testing",
			monitoringConfiguration: { noMonitoring: true },
			targets: [
				{
				path: "/documents",
				httpMethod: "GET",
				lambda: getDocumentsLambda,
				},
				{
				path: "/publish",
				httpMethod: "POST",
				lambda: publishLambda,
				},
			],
		});
	
		new GuScheduledLambda(this, APP_NAME, {
			handler: 'dist/lambda/index.scheduleHandler',
			rules: [
				{
					schedule: Schedule.cron({ hour: '10', minute: '00', weekDay: '2' }),
				},
			],
			monitoringConfiguration: {
				noMonitoring: true, // todo
			},
			app: `${app}-schedule`,
			...sharedLambdaProps,
		});
	}
}
