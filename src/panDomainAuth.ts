import {
  guardianValidation,
  PanDomainAuthentication,
} from "@guardian/pan-domain-node";
import { standardAwsConfig } from "./awsIntegration";
import { AWS_REGION, pandaPublicConfigFilename, pandaSettingsBucketName } from "./constants";

let pandaPromise: Promise<PanDomainAuthentication> | undefined;

export const getVerifiedUserEmail = async (
  cookieHeader: string | undefined
): Promise<void | string> => {
  if (typeof cookieHeader !== "string") return;

  pandaPromise ??= PanDomainAuthentication.builder({
    cookieName: "gutoolsAuth-assym",
    region: AWS_REGION,
    bucket: pandaSettingsBucketName,
    keyFile: pandaPublicConfigFilename,
    validateUser: guardianValidation,
    credentialsProvider: standardAwsConfig.credentials,
  }).catch((error: unknown) => {
    pandaPromise = undefined;
    throw error;
  });

  const panda = await pandaPromise;
  const result = await panda.verify(cookieHeader);
  if (result.success) return result.user.email;
};