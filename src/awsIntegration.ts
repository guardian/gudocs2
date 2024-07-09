import { SSM } from "@aws-sdk/client-ssm";
import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { APP, STAGE, STACK, AWS_REGION } from "./constants";

const LOCAL_PROFILE = "interactives";

const LOCAL_S3_PROFILE = "composer";

export const IS_RUNNING_LOCALLY = !process.env.LAMBDA_TASK_ROOT;

export const standardAwsConfig = {
  region: AWS_REGION,
  credentials: IS_RUNNING_LOCALLY
    ? fromIni({ profile: LOCAL_PROFILE })
    : fromNodeProviderChain(),
};

export const s3AwsConfig = {
  region: AWS_REGION,
  credentials: IS_RUNNING_LOCALLY
    ? fromIni({ profile: LOCAL_S3_PROFILE })
    : fromNodeProviderChain(),
};

const ssm = new SSM(standardAwsConfig);

const paramStorePromiseGetter =
  (WithDecryption: boolean) => (nameSuffix: string) => {
    const Name = `/${STAGE}/${STACK}/${APP}/${nameSuffix}`;
    return ssm
      .getParameter({
        Name,
        WithDecryption,
      })
      .then((result) => {
        const value = result.Parameter?.Value;
        if (!value) {
          throw Error(`Could not retrieve parameter value for '${Name}'`);
        }
        return value;
      });
  };

export const secretPromiseGetter = paramStorePromiseGetter(true);
export const configPromiseGetter = paramStorePromiseGetter(false);