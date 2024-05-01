import { GuApiGatewayWithLambdaByPath, GuScheduledLambda } from '@guardian/cdk';
import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import { GuStack } from '@guardian/cdk/lib/constructs/core';
import { GuVpc } from '@guardian/cdk/lib/constructs/ec2/vpc'
import { GuLambdaFunction } from '@guardian/cdk/lib/constructs/lambda';
import type { App } from 'aws-cdk-lib';
import { Schedule } from 'aws-cdk-lib/aws-events';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import {AttributeType, Table} from "aws-cdk-lib/aws-dynamodb";


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
		const fileName = "gudocs2.zip";
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

		const sharedParametersPolicy = new PolicyStatement({
			actions: ["ssm:GetParametersByPath"],
			resources: [
			`arn:aws:ssm:${scope.region}:${scope.account}:parameter/${this.stage}/${this.stack}/${app}/*`,
			],
		})
		getDocumentsLambda.addToRolePolicy(sharedParametersPolicy)

		const publishLambda = new GuLambdaFunction(this, "publish", {
			handler: "dist/lambda/index.publishHandler",
			functionName: `gudocs-publish-${this.stage}`,
			app: `${app}-publish`,
			...sharedLambdaProps,
		});

		publishLambda.addToRolePolicy(sharedParametersPolicy)

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
	
		const scheduledLambda = new GuScheduledLambda(this, APP_NAME, { // NB this lambs is called interactives-CODE-gu-docs-gudocs860B986D-SIKViKuP8A6S it would be nice for it to have a better name
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
		scheduledLambda.addToRolePolicy(sharedParametersPolicy)

		const table = new Table(this, 'Table', {
			partitionKey: {
				name: 'key',
				type: AttributeType.STRING,
			},
		});
		table.grantReadWriteData(scheduledLambda);
		table.grantReadWriteData(publishLambda);
		table.grantReadData(getDocumentsLambda);
	}
}
