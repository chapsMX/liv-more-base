const COOKIE_NAME = "garmin_oauth1";
const MAX_AGE = 600; // 10 minutes

export type OAuth1CookiePayload = {
  oauth_token_secret: string;
  fid?: number;
  userId?: number;
};

export function getOAuth1CookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: MAX_AGE,
    path: "/",
  };
}

export function encodeOAuth1Cookie(payload: OAuth1CookiePayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeOAuth1Cookie(value: string): OAuth1CookiePayload | null {
  try {
    const json = Buffer.from(value, "base64url").toString("utf-8");
    const data = JSON.parse(json) as OAuth1CookiePayload;
    if (typeof data.oauth_token_secret === "string") {
      const hasFid = Number.isInteger(data.fid) && (data.fid ?? 0) > 0;
      const hasUserId = Number.isInteger(data.userId) && (data.userId ?? 0) > 0;
      if (hasFid || hasUserId) {
        return {
          oauth_token_secret: data.oauth_token_secret,
          fid: data.fid,
          userId: data.userId,
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export { COOKIE_NAME as GARMIN_OAUTH1_COOKIE_NAME };
