import type { NextFunction, Request, Response } from "express";
import { LOGIN_GUTOOLS } from "./constants";
import { getVerifiedUserEmail } from "./panDomainAuth";
import { userHasPermission } from "./permissionCheck";

const MISSING_AUTH_COOKIE_MESSAGE =
  "pan-domain auth cookie missing, invalid or expired";

export interface AuthenticatedRequest extends Request {
  userEmail?: string;
}

export const getAuthMiddleware =
  (baseUrl: string, sendErrorAsOk = false) =>
  async (
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction
  ) => {
    const maybeCookieHeader = request.header("Cookie");
    const maybeAuthenticatedEmail = await getVerifiedUserEmail(
      maybeCookieHeader
    );

    if (typeof maybeAuthenticatedEmail !== "string") {
      return sendErrorAsOk
        ? response.send(`console.error('${MISSING_AUTH_COOKIE_MESSAGE}')`)
        : response
            .redirect(`${LOGIN_GUTOOLS}/login?returnUrl=${encodeURIComponent(baseUrl)}`);
    }

    if (await userHasPermission(maybeAuthenticatedEmail)) {
      request.userEmail = maybeAuthenticatedEmail;
      return next();
    }

    const NO_GUDOCS_PERMISSION_MESSAGE =
      "You do not have permission to use GuDocs. If you believe this is a mistake please contact Central Production.";

    return sendErrorAsOk
      ? response.send(`console.log('${NO_GUDOCS_PERMISSION_MESSAGE}')`)
      : response
          .status(403)
          .send(NO_GUDOCS_PERMISSION_MESSAGE);
  };