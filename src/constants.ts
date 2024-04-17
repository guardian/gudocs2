export const APP = "gudocs";

export const STAGE = process.env.STAGE || "DEV";

export const AWS_REGION = "eu-west-1";

export const DYNAMODB_TABLE = `gudocs-${STAGE}`