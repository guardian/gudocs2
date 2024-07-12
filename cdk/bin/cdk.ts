import 'source-map-support/register';
import { GuRoot } from '@guardian/cdk/lib/constructs/root'
import { GuDocs, GuDocsCertificate } from '../lib/gudocs';

const app = new GuRoot();

const codeDomainName = "gudocs.code.dev-gutools.co.uk";

const prodDomainName = "gudocs.gutools.co.uk";

new GuDocsCertificate(
  app,
  "gudocs2-certificates-CODE",
  {
    env: {
      region: "us-east-1",
    },
    stack: "interactives",
    stage: "CODE",
    domainName: codeDomainName,
  }
);

new GuDocsCertificate(
  app,
  "gudocs2-certificates-PROD",
  {
    env: {
      region: "us-east-1",
    },
    stack: "interactives",
    stage: "PROD",
    domainName: prodDomainName,
  }
);

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
