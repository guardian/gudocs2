export const APP = "gudocs";

const stages = [ "PROD", "CODE", "LOCAL" ] as const;

type Stage = typeof stages[number];

export const STAGE: Stage = stages.find((stage) => stage === process.env['STAGE']) ?? "LOCAL";

export const STACK = process.env['STACK'] ?? "interactives";

export const AWS_REGION = "eu-west-1";

export const DYNAMODB_TABLE = `${STACK}-${STAGE === "LOCAL" ? "CODE" : STAGE}-${APP}`

