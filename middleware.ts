/**
 * Next.js middleware — fast-path auth check for protected zones only.
 *
 * Architectural model: **public by default, protected where listed.**
 * Most modern SaaS / business apps have substantial public surface
 * (marketing, pricing, blog, signup, password reset). Forcing auth
 * everywhere and allowlisting the public routes was the wrong default.
 *
 * Two enforcement layers:
 *   1. THIS middleware — fast bouncer for `PROTECTED_PREFIXES`.
 *      Routes not in the list pass through with no DB hit. Routes
 *      in the list need a session; missing session → /login (pages)
 *      or 401 JSON (API).
 *   2. `lib/authorize.ts` — the REAL source of truth for fine-
 *      grained auth + role gating. API routes and `getServerSideProps`
 *      call `authorize(req, ...roles)` to enforce specific role sets.
 *
 * Edit `PROTECTED_PREFIXES` to add app-specific zones — e.g. an app
 * with a `/portal/**` surface adds `/portal` to the list.
 *
 * Pages Router note: this platform is Pages-Router-only, so the
 * middleware reads the session via `getToken` from `next-auth/jwt`
 * directly — there is no `auth()` helper to import (that's an App
 * Router pattern). NextAuth v5 (Auth.js) requires explicit `salt`
 * matching the session cookie name (`authjs.session-token` vs
 * `__Secure-authjs.session-token`). `fallbackSecure` guesses from
 * `AUTH_URL` / `NEXTAUTH_URL` and `req.nextUrl.protocol`; when both
 * disagree with the cookie NextAuth actually set, `resolveAuthJsSessionCookieMode`
 * prefers whichever session cookie is present on the request.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { resolveAuthJsSessionCookieMode } from "@/lib/auth-session-cookie";

function getAuthSecret(): string {
  return (
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    ""
  ).trim();
}

/**
 * Path prefixes that require an authenticated session at the
 * middleware layer. Anything NOT in this list is public.
 *
 * Conventions the platform expects:
 *   /app          — main authenticated app shell
 *   /dashboard    — alternate auth zone naming
 *   /admin        — admin-only surface (role-gated further by authorize())
 *   /account      — user account settings
 *   /api/private  — private API routes (return 401 JSON on miss)
 *   /api/staff    — staff-only API
 *
 * Public-by-default surface (no entry needed):
 *   /             — landing page
 *   /pricing, /about, /contact, /features
 *   /login, /signup, /forgot-password, /reset-password/[token]
 *   /api/auth/*   — NextAuth's own handlers
 *   /api/public/* — explicitly public APIs
 *   /blog, /docs, anything else
 */
const PROTECTED_PREFIXES: string[] = [
  "/app",
  "/dashboard",
  "/admin",
  "/account",
  "/api/private",
  "/api/staff",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Public route — pass through immediately. NO token lookup at all
  // for the marketing / public surface; that keeps cold latency low.
  if (!isProtected(pathname)) return NextResponse.next();

  // Protected route — verify the session token via NextAuth v5's
  // `getToken`. Two layers of detail conspire here:
  //
  // 1. In edge middleware, `req.url` is path-only — v5's
  //    auto-detection of `secureCookie` via
  //    `req.url.startsWith("https://")` always returns false.
  //
  // 2. `req.nextUrl.protocol` ALSO reports `"http:"` on hosts that
  //    sit behind a TLS-terminating edge proxy (e2b, Cloudflare,
  //    Fly, …). Next.js sees the internal forwarded request, not
  //    the external scheme.
  //
  // So neither `req.url` nor `req.nextUrl.protocol` is reliable alone.
  // `fallbackSecure` combines env (`AUTH_URL` / `NEXTAUTH_URL`, set by
  // the platform rewriter to the sandbox origin) with the request URL
  // protocol. `resolveAuthJsSessionCookieMode` then prefers whichever
  // session cookie exists on the wire when env and browser disagree.
  const envUrl =
    process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  const fallbackSecure =
    envUrl.startsWith("https://") || req.nextUrl.protocol === "https:";
  const { secureCookie, salt } = resolveAuthJsSessionCookieMode({
    getCookie: (name) => req.cookies.get(name)?.value,
    fallbackSecure,
  });
  const secret = getAuthSecret();
  let session: { sub?: string } | null = null;
  let decryptError: string | null = null;
  if (secret) {
    try {
      // NextRequest is an Edge runtime variant; getToken's typed `req`
      // accepts it via the `Request` branch but TS strict mode prefers
      // an explicit cast to silence the `Headers | Record<string,
      // string>` mismatch on the headers shape.
      //
      // `salt` is REQUIRED for v5 JWE decryption: it must equal the
      // session cookie name NextAuth used at sign-in. Without a
      // matching `salt` + `secureCookie`, `getToken` silently decrypts
      // to null and protected routes bounce to /login.
      //
      // `cookieName` must match `salt` so SessionStore aggregates `.0`, `.1`, … chunks.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session = (await getToken({
        req: req as unknown as Parameters<typeof getToken>[0]['req'],
        secret,
        secureCookie,
        salt,
        cookieName: salt,
      })) as any;
    } catch (err) {
      decryptError = err instanceof Error ? err.message : String(err);
      session = null;
    }
  }
  if (session?.sub) return NextResponse.next();

  // Diagnostic — fires only on protected-route session-check failures.
  // Drop once the cookie/decryption issue is fully resolved.
  // eslint-disable-next-line no-console
  console.warn(
    `[middleware] redirect ${pathname} → /login`,
    JSON.stringify({
      hasSecret: !!secret,
      secretLen: secret ? secret.length : 0,
      fallbackSecure,
      secureCookie,
      salt,
      protocol: req.nextUrl.protocol,
      cookieKeys: Array.from(req.cookies.getAll()).map((c) => c.name),
      secureTokenPresent:
        !!req.cookies.get("__Secure-authjs.session-token") ||
        !!req.cookies.get("__Secure-authjs.session-token.0"),
      bareTokenPresent:
        !!req.cookies.get("authjs.session-token") ||
        !!req.cookies.get("authjs.session-token.0"),
      sessionResult: session === null ? "null" : "object",
      sessionSub: session?.sub ?? null,
      decryptError,
    }),
  );

  // API protected route → 401 JSON so callers can handle programmatically.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  // Page protected route → redirect to /login, preserving the
  // originally requested path so post-login returns there.
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Match every route EXCEPT static assets + favicon. The middleware
  // short-circuits public routes itself, so the matcher is broad.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
