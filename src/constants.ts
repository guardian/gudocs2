export const APP = "gudocs";

const stages = [ "PROD", "CODE", "LOCAL" ] as const;

type Stage = typeof stages[number];

export const STAGE: Stage = stages.find((stage) => stage === process.env['STAGE']) ?? "LOCAL";

export const STACK = process.env['STACK'] ?? "interactives";

export const AWS_REGION = "eu-west-1";

export const DYNAMODB_TABLE = `${STACK}-${STAGE === "LOCAL" ? "CODE" : STAGE}-${APP}`

const pandaConfigFilenameLookup: { [stage in Stage]: string } = {
    PROD: "gutools.co.uk.settings",
    CODE: "code.dev-gutools.co.uk.settings",
    LOCAL: "local.dev-gutools.co.uk.settings",
  } as const;
  
  export const pandaSettingsBucketName = "pan-domain-auth-settings";
  
  export const pandaPublicConfigFilename = `${
    pandaConfigFilenameLookup[STAGE]
  }.public`;

export const LOGIN_GUTOOLS = STAGE === "PROD" ? "https://login.gutools.co.uk" : `https://login.${STAGE}.dev-gutools.co.uk`