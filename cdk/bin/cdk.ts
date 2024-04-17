import 'source-map-support/register';
import { GuRoot } from '@guardian/cdk/lib/constructs/root'
import { GuDocs } from '../lib/gudocs';

const app = new GuRoot();

new GuDocs(
	app,
	'gudocs2-CODE',
	{
		env: { region: 'eu-west-1' },
		stack: 'interactives',
		stage: 'CODE',
	},
);

new GuDocs(
	app,
	'gudocs2-PROD',
	{
		env: { region: 'eu-west-1' },
		stack: 'interactives',
		stage: 'PROD',
	},
);
