import { S3 } from "@aws-sdk/client-s3";
import { standardAwsConfig } from "./awsIntegration";
import { STAGE } from "./constants";

interface Override {
    userId: string;
    active: boolean;
}
  
interface Permission {
    permission: {
        name: string;
        app: string;
    };
    overrides: Override[];
}

const s3 = new S3(standardAwsConfig);

const getGuDocsPermissionsOverrides = (S3: S3) =>
    S3.getObject({
      Bucket: "permissions-cache",
      Key: `${STAGE}/permissions.json`,
    })
      .then(({ Body }) => {
        if (Body === undefined) {
          throw Error("could not read permissions");
        }
        return Body.transformToString();
      })
      .then((Body) => {
        const allPermissions = JSON.parse(Body) as Permission[];
        return allPermissions.find(
          ({ permission }) =>
            permission.app === "gudocs" && permission.name === "gudocs_access"
        )?.overrides ?? [];
      });

export const userHasPermission = (userEmail: string): Promise<boolean> =>
    getGuDocsPermissionsOverrides(s3).then((overrides) =>
        overrides.some(({ userId, active }) => userId === userEmail && active)
    );