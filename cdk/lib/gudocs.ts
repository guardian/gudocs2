import { GuApiGatewayWithLambdaByPath, GuScheduledLambda } from '@guardian/cdk';
import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import { GuStack, GuStringParameter } from '@guardian/cdk/lib/constructs/core';
import { GuVpc } from '@guardian/cdk/lib/constructs/ec2/vpc'
import { GuLambdaFunction } from '@guardian/cdk/lib/constructs/lambda';
import type { App } from 'aws-cdk-lib';
import {AttributeType, Table} from "aws-cdk-lib/aws-dynamodb";
import { Schedule } from 'aws-cdk-lib/aws-events';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
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

		const s3BucketName = new GuStringParameter(this, 'S3BucketName', {
			fromSSM: true,
			default: `/${this.stage}/interactives/gudocs/s3bucket`,
			description: "The bucket used to store docs"
		  });

		const s3BucketPolicy = new PolicyStatement({
			actions: [
				"s3:PutObject",
			],
			resources: [
				`arn:aws:s3:${this.region}:${this.account}:${s3BucketName}/*`,
			],
		})

		const sharedParametersPolicy = new PolicyStatement({
			actions: [
				"ssm:GetParametersByPath",
				"ssm:GetParameters",
				"ssm:GetParameter"
			],
			resources: [
			`arn:aws:ssm:${this.region}:${this.account}:parameter/${this.stage}/${this.stack}/${app}/*`,
			],
		})
		
		const serverlessExpressLambda = new GuLambdaFunction(this, "serverless-express", {
			handler: "index.handler",
			functionName: `gudocs-serverless-express-${this.stage}`,
			app: `${app}-serverless-express`,
			...sharedLambdaProps,			
		});
		serverlessExpressLambda.addToRolePolicy(s3BucketPolicy)
		serverlessExpressLambda.addToRolePolicy(sharedParametersPolicy)

		new GuApiGatewayWithLambdaByPath(this, {
			app: "testing",
			monitoringConfiguration: { noMonitoring: true },
			targets: [
				{
				path: "/",
				httpMethod: "GET",
				lambda: serverlessExpressLambda,
				},
				{
				path: "/publish",
				httpMethod: "POST",
				lambda: serverlessExpressLambda,
				},
			],
		});
	
		const scheduledLambda = new GuScheduledLambda(this, APP_NAME, {
			handler: 'index.scheduleHandler',
			functionName: `gudocs-schedule-${this.stage}`,
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
		scheduledLambda.addToRolePolicy(s3BucketPolicy)
		scheduledLambda.addToRolePolicy(sharedParametersPolicy)

		const table = new Table(this, 'Table', {
			tableName: `${this.stack}-${this.stage}-${app}`,
			partitionKey: {
				name: 'key',
				type: AttributeType.STRING,
			},
		});

		table.addGlobalSecondaryIndex({
			indexName: 'last-modified',
			partitionKey: {
				name: 'type',
				type: AttributeType.STRING,
			},
			sortKey: {
				name: 'lastModified',
				type: AttributeType.NUMBER,
			}
		});

		table.grantReadWriteData(scheduledLambda);
		table.grantReadWriteData(serverlessExpressLambda);
	}
}
