import {
    guardianValidation,
    PanDomainAuthentication,
  } from "@guardian/pan-domain-node";
import { standardAwsConfig } from "./awsIntegration";
import { AWS_REGION, pandaPublicConfigFilename, pandaSettingsBucketName } from "./constants";
  
  const panda = new PanDomainAuthentication(
    "gutoolsAuth-assym", // cookie name
    AWS_REGION, // AWS region
    pandaSettingsBucketName, // Settings bucket
    pandaPublicConfigFilename, // Settings files
    guardianValidation,
    standardAwsConfig.credentials,
  );
  
  export const getVerifiedUserEmail = async (
    cookieHeader: string | undefined
  ): Promise<void | string> => {
    if (typeof cookieHeader === "string") {
      const result = await panda.verify(cookieHeader);
  
      if (result.success) {
        return result.user.email;
      }
    }
  };