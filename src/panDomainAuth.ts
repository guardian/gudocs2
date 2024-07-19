import {
    AuthenticationStatus,
    guardianValidation,
    PanDomainAuthentication,
  } from "@guardian/pan-domain-node";
  import { AWS_REGION, pandaPublicConfigFilename, pandaSettingsBucketName } from "./constants";
  
  const panda = new PanDomainAuthentication(
    "gutoolsAuth-assym", // cookie name
    AWS_REGION, // AWS region
    pandaSettingsBucketName, // Settings bucket
    pandaPublicConfigFilename, // Settings files
    guardianValidation
  );
  
  export const getVerifiedUserEmail = async (
    cookieHeader: string | undefined
  ): Promise<void | string> => {
    if (typeof cookieHeader === "string") {
      const { status, user } = await panda.verify(cookieHeader);
  
      if (status === AuthenticationStatus.AUTHORISED && user !== undefined) {
        return user.email;
      }
    }
  };