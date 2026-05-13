/**
 * Platform-managed session helper for Pages Router API handlers.
 *
 * NextAuth v5 (Auth.js) — `getToken({ req, secret, salt })` reads
 * the JWT-encoded session cookie. v5 beta requires the `salt`
 * parameter to equal the cookie name; HTTPS uses the
 * `__Secure-authjs.session-token` cookie, HTTP the bare
 * `authjs.session-token`.
 *
 * This file is a LOCKED PATH (see
 * `apps/backend/src/services/implementationAgent/safety.ts`).
 * Tasks must NOT modify or extend it. If you need session info,
 * import `requireUser` / `getSessionUser` from here.
 */
import type { NextApiRequest } from 'next';
import { getToken } from 'next-auth/jwt';

const SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '';

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
}

/**
 * Detect whether the request is HTTPS so we can pick the right
 * `__Secure-` cookie prefix at sign-in time. Pages Router
 * `req.url` is the path (`/api/auth/session`), not the full URL,
 * so we can't ask `getToken` to auto-detect — read the proxy
 * headers directly. e2b / Cloudflare / Next.js proxies set
 * `x-forwarded-proto: https` on the live preview origin.
 */
function isSecureRequest(req: NextApiRequest): boolean {
  const proto = req.headers['x-forwarded-proto'];
  if (proto === 'https' || proto === 'wss') return true;
  if (Array.isArray(proto) && proto.some((p) => p === 'https' || p === 'wss')) {
    return true;
  }
  // Fallback: NEXTAUTH_URL / AUTH_URL is set by the platform's env
  // rewriter to the real origin. If it starts with `https://`, the
  // sign-in side issued `__Secure-` cookies and we must match.
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '';
  return url.startsWith('https://');
}

/**
 * Resolve the current session's user from the request cookies.
 * Returns `null` when:
 *  - `AUTH_SECRET` / `NEXTAUTH_SECRET` is not configured
 *  - no session cookie is present
 *  - the cookie's signature doesn't verify
 *
 * Implementation note: NextAuth v5 ties cookie name AND salt to the
 * secure-prefix decision — both must match what the sign-in handler
 * used or the JWE decrypts to null silently. We pass `secureCookie`
 * explicitly (not relying on `req.url` auto-detection, which doesn't
 * work for Pages Router API routes whose `req.url` is path-only).
 */
export async function getSessionUser(
  req: NextApiRequest,
): Promise<SessionUser | null> {
  if (!SECRET) return null;
  try {
    const secureCookie = isSecureRequest(req);
    // next-auth v5 beta typed `getToken`'s `req` as `Request | {
    // headers: Headers | Record<string, string> }`. Pages Router's
    // `NextApiRequest` doesn't structurally match because
    // `IncomingHttpHeaders` allows `string[]` for some header values.
    // Runtime is fine — `getToken` only reads `req.headers.cookie`.
    // We pass a stripped-down object satisfying the type while
    // preserving the cookie path.
    //
    // `salt` is REQUIRED for v5 JWE decryption: it must equal the
    // session cookie name. The signin handler encrypts with
    // `__Secure-authjs.session-token` (HTTPS) or `authjs.session-token`
    // (HTTP); without a matching salt, getToken silently decrypts to
    // null and every protected route bounces to /login even after a
    // successful sign-in. Past failure (helpdesk app): the docstring
    // here flagged the requirement but the call site omitted the
    // parameter — we shipped broken auth in every app. Don't drop it.
    const cookieName = secureCookie
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token';
    const token = await getToken({
      req: { headers: req.headers as Record<string, string> },
      secret: SECRET,
      secureCookie,
      salt: cookieName,
    });
    if (!token?.sub) return null;
    const email = typeof token.email === 'string' ? token.email : null;
    const name = typeof token.name === 'string' ? token.name : null;
    return { id: token.sub, email, name };
  } catch {
    return null;
  }
}

/** Wrap a handler that requires auth. Throws an error with
 *  `status: 401` when no valid session is present. Catch in your
 *  handler and respond `res.status(err.status).json({...})`. */
export class UnauthenticatedError extends Error {
  status = 401;
  constructor(message = 'Unauthenticated') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

export async function requireUser(req: NextApiRequest): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (!user) throw new UnauthenticatedError();
  return user;
}
