import { GuApiGatewayWithLambdaByPath, GuScheduledLambda } from '@guardian/cdk';
import { GuCertificate } from '@guardian/cdk/lib/constructs/acm';
import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import { GuStack, GuStringParameter } from '@guardian/cdk/lib/constructs/core';
import { GuCname } from '@guardian/cdk/lib/constructs/dns/dns-records';
import { GuVpc } from '@guardian/cdk/lib/constructs/ec2/vpc'
import { GuLambdaFunction } from '@guardian/cdk/lib/constructs/lambda';
import { type App, Duration } from 'aws-cdk-lib';
import { CfnBasePathMapping, CfnDomainName } from 'aws-cdk-lib/aws-apigateway';
import {AttributeType, Table} from "aws-cdk-lib/aws-dynamodb";
import { Schedule } from 'aws-cdk-lib/aws-events';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

const APP_NAME = 'gudocs';

interface GuDocsStackProps extends GuStackProps {
	domainName: string;
}

interface GuDocsCertificateStackProps extends GuStackProps {
	domainName: string;
}

export class GuDocsCertificate extends GuStack {
	constructor(scope: App, id: string, props: GuDocsCertificateStackProps) {
		super(scope, id, props);

		new GuCertificate(this, {
			domainName: props.domainName,
			app: "gudocs-cloudfront",
		});
	}
}

export class GuDocs extends GuStack {
	constructor(
		scope: App,
		id: string,
		props: GuDocsStackProps
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
				"s3:PutObjectAcl",
			],
			resources: [
				`arn:aws:s3:::${s3BucketName.valueAsString}/*`,
			],
		})

		const permissionsBucketPolicy = new PolicyStatement({
			actions: [
				"s3:GetObject",
			],
			resources: [
				`arn:aws:s3:::permissions-cache/${this.stage}/*`,
			],
		})
		
		const pandaS3BucketPolcy = new PolicyStatement({
			actions: ['s3:GetObject'],
			resources: [`arn:aws:s3:::pan-domain-auth-settings/*`],
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
		serverlessExpressLambda.addToRolePolicy(permissionsBucketPolicy)
		serverlessExpressLambda.addToRolePolicy(pandaS3BucketPolcy)

		const gateway = new GuApiGatewayWithLambdaByPath(this, {
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
				{
				path: "/legacy",
				httpMethod: "POST",
				lambda: serverlessExpressLambda,
				},
			],
		});

		const cloudFrontCertificateArn = new GuStringParameter(this, 'CloudFrontCertificateArn', {
			fromSSM: true,
			default: `/INFRA/${props.domainName}/cloudFrontCertificateArn`,
			description: "The ARN of the certificate for the Cloudfront distribution. Must be created in us-east-1."
		});

		const cfnDomainName = new CfnDomainName(this, 'DomainName', {
			domainName: props.domainName,
			certificateArn: cloudFrontCertificateArn.valueAsString,
			endpointConfiguration: {
				types: ['EDGE'],
			},
		});

		new CfnBasePathMapping(this, 'BasePathMapping', {
			domainName: cfnDomainName.ref,
			restApiId: gateway.api.restApiId,
			stage: gateway.api.deploymentStage.stageName,
		});

		new GuCname(this, 'CnameApiRecord', {
			domainName: props.domainName,
			app,
			resourceRecord: cfnDomainName.attrDistributionDomainName,
			ttl: Duration.minutes(1),
		});
	
		const scheduledLambda = new GuScheduledLambda(this, APP_NAME, {
			handler: 'index.scheduleHandler',
			functionName: `gudocs-schedule-${this.stage}`,
			rules: [
				{
					schedule: Schedule.cron({ }),
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
