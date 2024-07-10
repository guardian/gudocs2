export const APP = "gudocs";

export const STAGE = process.env['STAGE'] ?? "CODE";

export const STACK = process.env['STACK'] ?? "interactives";

export const AWS_REGION = "eu-west-1";

//export const DYNAMODB_TABLE = `${STACK}-${STAGE}-${APP}`
export const DYNAMODB_TABLE = "interactives-CODE-gu-docs-TableCD117FA1-15P615BXL3FKE"