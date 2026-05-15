/**
 * NextAuth v5 (Auth.js) session cookie names and `getToken` salt resolution.
 *
 * `NEXTAUTH_URL` / `AUTH_URL` may describe `https://…` while the browser
 * uses `http://localhost` (or the inverse behind proxies). NextAuth picks
 * the session cookie name at sign-in time; readers must use the same name
 * as `salt` and matching `secureCookie` or JWE decrypt fails silently.
 *
 * Chunked cookies: large JWTs split across `name.0`, `name.1`, … In that
 * case `getCookie("authjs.session-token")` is often empty while `.0` holds
 * data — without checking `.0`, resolution falls through to `fallbackSecure`
 * (true on e2b HTTPS) and wrongly picks `__Secure-*`, so `getToken` never
 * reads the cookie.
 */

/** E2B code-preview iframe only — platform sets `E2B_SANDBOX=true` in sandbox env. */
export const isE2bSandbox = process.env.E2B_SANDBOX === "true";

export const AUTHJS_SESSION_COOKIE = "authjs.session-token";
export const AUTHJS_SESSION_COOKIE_SECURE = "__Secure-authjs.session-token";

function firstChunkOrSelf(
  getCookie: (name: string) => string | undefined,
  baseName: string,
): string | undefined {
  const v = getCookie(baseName);
  if (v !== undefined && v !== "") return v;
  const c0 = getCookie(`${baseName}.0`);
  if (c0 !== undefined && c0 !== "") return c0;
  return undefined;
}

export function resolveAuthJsSessionCookieMode(options: {
  getCookie: (name: string) => string | undefined;
  fallbackSecure: boolean;
}): { secureCookie: boolean; salt: string } {
  const { getCookie, fallbackSecure } = options;

  const secureVal = firstChunkOrSelf(getCookie, AUTHJS_SESSION_COOKIE_SECURE);
  if (secureVal !== undefined && secureVal !== "") {
    return { secureCookie: true, salt: AUTHJS_SESSION_COOKIE_SECURE };
  }

  const bareVal = firstChunkOrSelf(getCookie, AUTHJS_SESSION_COOKIE);
  if (bareVal !== undefined && bareVal !== "") {
    return { secureCookie: false, salt: AUTHJS_SESSION_COOKIE };
  }

  // Sandbox `e2bIframeAuthCookies` always uses bare `authjs.session-token`.
  // On HTTPS `fallbackSecure` is true — must not default to `__Secure-*`
  // or `getToken` looks for cookies Auth.js never issued.
  if (isE2bSandbox) {
    return { secureCookie: false, salt: AUTHJS_SESSION_COOKIE };
  }

  return {
    secureCookie: fallbackSecure,
    salt: fallbackSecure
      ? AUTHJS_SESSION_COOKIE_SECURE
      : AUTHJS_SESSION_COOKIE,
  };
}
