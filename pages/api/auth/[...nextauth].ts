/**
 * NextAuth handler — entry point for all `/api/auth/*` routes.
 *
 * Platform-managed; do not edit. To add OAuth providers, use the
 * `auth-extend` task type instead of forking this file.
 *
 * Pages Router bridge: NextAuth v5 (Auth.js) returns
 * `{ handlers: { GET, POST } }` — App Router shape, where each
 * handler is `(req: Request) => Promise<Response>` (Web API). This
 * platform is Pages Router exclusively, so this file translates
 * Pages Router `(req: NextApiRequest, res: NextApiResponse)` to/from
 * Web API `Request/Response`. The bridge is small, mechanical, and
 * survives v5's eventual native Pages Router support — when v5
 * ships a default-export shim, this file collapses to a one-liner.
 *
 * Why a bridge instead of downgrading to v4: `@next-auth/pg-adapter`
 * (the v4 raw-pg adapter) is deprecated on npm; `@auth/pg-adapter`
 * v0.x depends on `@auth/core` (v5-only). There's no maintained v4
 * + raw-pg path. v5 + bridge is the path forward.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth-config";

const { handlers } = NextAuth(authConfig);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // ── 1. Build a Web API Request from the Pages Router req ──
  // Protocol detection priority:
  //   1. `AUTH_URL` / `NEXTAUTH_URL` env — the platform's env
  //      rewriter sets these to the actual sandbox origin
  //      (`https://3000-….e2b.app`). They're the source of truth.
  //   2. `x-forwarded-proto` header — falls back when env isn't set.
  //      Past failure: e2b's edge didn't always forward this, so
  //      the bridge constructed `http://…` URLs even on HTTPS
  //      requests. NextAuth then derived the wrong cookie name +
  //      JWE salt, returned empty sessions, and `useSession()`
  //      reported `unauthenticated` after a successful sign-in.
  //   3. `http` — final fallback for local dev.
  const envUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  const envProto = envUrl.startsWith("https://")
    ? "https"
    : envUrl.startsWith("http://")
      ? "http"
      : null;
  const headerProto =
    typeof req.headers["x-forwarded-proto"] === "string"
      ? req.headers["x-forwarded-proto"]
      : null;
  const proto = envProto ?? headerProto ?? "http";
  const host = req.headers.host ?? "localhost";
  const url = `${proto}://${host}${req.url ?? "/"}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  // Pages Router pre-parses JSON / urlencoded bodies into req.body.
  // Web API expects a raw stringified body. Re-stringify for non-GET.
  let body: BodyInit | undefined;
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    if (typeof req.body === "string") {
      body = req.body;
    } else if (req.body && typeof req.body === "object") {
      const ct = headers.get("content-type") ?? "";
      if (ct.includes("application/x-www-form-urlencoded")) {
        body = new URLSearchParams(
          req.body as Record<string, string>,
        ).toString();
      } else {
        body = JSON.stringify(req.body);
        if (!ct) headers.set("content-type", "application/json");
      }
    }
  }

  // v5's `handlers` expect a `NextRequest`, not a plain `Request` —
  // they destructure `req.nextUrl.href` internally and throw with
  // "Cannot destructure property 'href' of 'req.nextUrl' as it is
  // undefined" otherwise. NextRequest extends Request and adds the
  // `nextUrl` getter, so wrapping in `new NextRequest(url, init)`
  // is sufficient.
  const webReq = new NextRequest(url, {
    method: req.method,
    headers,
    body,
    // duplex required by Node 20+ when body is set on a Request
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(body ? ({ duplex: "half" } as any) : {}),
  });

  // ── 2. Dispatch to the right v5 handler ──
  const handler =
    req.method === "GET" || req.method === "HEAD"
      ? handlers.GET
      : handlers.POST;
  let webRes: Response;
  try {
    webRes = await handler(webReq);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[auth] handler threw:", err);
    return res
      .status(500)
      .json({ error: "Internal authentication error" });
  }

  // ── 3. Translate Response back to Pages Router res ──
  res.status(webRes.status);

  // `Set-Cookie` can appear multiple times in one Response. The
  // standard Headers iterator merges duplicates with `, ` which
  // breaks cookies. Use the WHATWG `getSetCookie()` (Node 20+) for
  // the array form, falling back to the iterator's merged value.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setCookies = (webRes.headers as any).getSetCookie?.();
  if (Array.isArray(setCookies) && setCookies.length > 0) {
    res.setHeader("set-cookie", setCookies);
  }
  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return; // already handled
    res.setHeader(key, value);
  });

  // Stream the body back. NextAuth handlers always return a body
  // (JSON for /providers /session /csrf, redirects for /signin
  // /signout /callback). 302/303 responses also have a body —
  // forward as-is.
  const buf = Buffer.from(await webRes.arrayBuffer());
  res.send(buf);
}
