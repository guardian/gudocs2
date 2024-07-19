//import { userHasPermission } from "../permissionCheck";
import type { NextFunction, Request, Response } from "express";
import { LOGIN_GUTOOLS } from "./constants";
import { getVerifiedUserEmail } from "./panDomainAuth";


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

    //if (await userHasPermission(maybeAuthenticatedEmail)) {
      request.userEmail = maybeAuthenticatedEmail;
      return next();
    // }

    // const NO_PINBOARD_PERMISSION_MESSAGE =
    //   "You do not have permission to use PinBoard";

    // return sendErrorAsOk
    //   ? response.send(`console.log('${NO_PINBOARD_PERMISSION_MESSAGE}')`)
    //   : response
    //       .status(HttpStatusCodes.FORBIDDEN)
    //       .send(NO_PINBOARD_PERMISSION_MESSAGE);
  };