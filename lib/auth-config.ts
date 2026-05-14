/**
 * Centralized NextAuth configuration (v5 / Auth.js).
 *
 * Platform-managed — every generated app inherits this. Uses
 * `@auth/pg-adapter` against the canonical NextAuth tables
 * (users / accounts / sessions / verification_token) directly with
 * raw SQL. No ORM dependency. Single-table model: `users` holds both
 * NextAuth identity columns AND app business attributes (role + any
 * app-specific user fields).
 *
 * Pages Router note: v5 returns `{ handlers, auth, signIn, signOut }`
 * — App Router shape. `pages/api/auth/[...nextauth].ts` uses a
 * bridge wrapper to translate Pages Router `(req, res)` to/from
 * Web API `Request/Response` for `handlers.GET / handlers.POST`.
 *
 * Override path: apps that need additional providers (Microsoft,
 * Apple, Okta, custom SAML) add them via the `auth-extend` task type.
 * Don't fork this file — extend it.
 */
import type { NextAuthConfig } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import PostgresAdapter from "@auth/pg-adapter";
import bcrypt from "bcryptjs";

import { pool } from "@/lib/db";

/**
 * Public self-signup toggle. Default: false (invite-only). Apps that
 * want public signup set `PUBLIC_SIGNUP_ENABLED=true` in their env.
 * The `/api/auth/signup` route honors this; the signup page reads it
 * via `getServerSideProps` to show / hide the form.
 */
export const isPublicSignupEnabled =
  process.env.PUBLIC_SIGNUP_ENABLED === "true";

// GoogleProvider is registered ONLY when both env vars are set.
// Eager `requireEnv`-style throws at module load turn every
// `/api/auth/*` request into a 500 HTML page (which then breaks
// `signIn` post-signup with a `Unexpected token '<', "<!DOCTYPE"`
// client error). Email/password works without Google; apps that
// want SSO add `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` to their
// env and the provider lights up automatically on next dev reload.
const providers: NextAuthConfig["providers"] = [];
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Allow account linking when the Google email matches an
      // existing credentials user — common pattern for "signed up
      // with email/password, later added Google for SSO."
      allowDangerousEmailAccountLinking: true,
    }),
  );
}
providers.push(
  CredentialsProvider({
    name: "Email + password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = String(credentials?.email ?? "").trim().toLowerCase();
      const password = String(credentials?.password ?? "");
      if (!email || !password) return null;

      // Look up the user by email on the canonical `users` table.
      // `password_hash` is a platform extension column — the adapter
      // doesn't touch it; we read it here for credentials login.
      const result = await pool.query<{
        id: string;
        email: string | null;
        name: string | null;
        image: string | null;
        password_hash: string | null;
      }>(
        `SELECT id, email, name, image, password_hash
           FROM users
          WHERE email = $1
          LIMIT 1`,
        [email],
      );
      const user = result.rows[0];
      if (!user || !user.password_hash) return null;

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return null;

      return {
        id: user.id,
        email: user.email ?? undefined,
        name: user.name ?? undefined,
        image: user.image ?? undefined,
      };
    },
  }),
);

export const authConfig: NextAuthConfig = {
  // pg adapter against the canonical NextAuth tables. The adapter
  // writes camelCase quoted columns (`"emailVerified"`, `"userId"`,
  // etc.) which match the platform's schema post-processor.
  adapter: PostgresAdapter(pool),

  // **JWT sessions.** This platform is Pages Router and the
  // middleware reads the cookie via `getToken` from `next-auth/jwt`.
  // Database sessions store an opaque session_id and `getToken`
  // returns null for them — silently breaking every protected
  // route. Trade-off accepted: revocation requires waiting for
  // token expiry (default 30 days). Keep `lib/auth-helpers.ts` and
  // `middleware.ts` aligned on this.
  session: { strategy: "jwt" },

  // ── Cookie config for iframe-embedded preview ──────────────────
  // The platform's code-builder previews this app in a cross-origin
  // iframe. NextAuth's default `SameSite=Lax` cookies are blocked
  // by browsers in third-party contexts, breaking the CSRF check on
  // login (operator sees `MissingCSRF` and can never sign in via the
  // iframe). `SameSite=None` permits the cookie in iframes; `Secure`
  // is required when `SameSite=None` (e2b sandbox URL is HTTPS).
  //
  // The cookie body uses the NextAuth v5 (Auth.js) convention
  // `authjs.session-token` — NOT the v4 `next-auth.session-token`.
  // The bug they pair-symptomized in production (job-traced 2026-05-11
  // to a "validates and bounces back to /login" user report): writing
  // the session cookie under the v4 name while `middleware.ts` reads
  // it under the v5 name. NextAuth's `getToken` defaults `cookieName`
  // to the v5 family based on `secureCookie`, so the middleware
  // silently couldn't find the cookie even though sign-in succeeded.
  // The JWE salt that `getToken` uses for decryption ALSO derives
  // from this name — so even a `req.cookies.get()` override wouldn't
  // fix it without matching salt. The clean fix: align both writer
  // and reader on v5 naming, which is what NextAuth v5 expects by
  // default everywhere.
  cookies: {
    sessionToken: {
      name: "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "none",
        secure: false,
        path: "/",
      },
    },
    csrfToken: {
      name: "__Host-authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "none",
        secure: false,
        path: "/",
      },
    },
    callbackUrl: {
      name: "authjs.callback-url",
      options: {
        sameSite: "none",
        secure: false,
        path: "/",
      },
    },
  },

  pages: {
    signIn: "/login",
  },

  providers,

  callbacks: {
    /**
     * JWT callback — runs every time a JWT is created (sign-in) or
     * updated. Stash `role` on the token so the `session` callback
     * can hand it to the client without an extra DB roundtrip per
     * request. Read on first sign-in only (when `user` is provided)
     * so subsequent middleware calls don't hit the DB.
     */
    async jwt({ token, user }) {
      if (user?.id) {
        try {
          // Read role from users.role. If null (Google OAuth users
          // never go through the signup endpoint, so the @auth/pg-
          // adapter inserts a row with role=NULL), atomically default
          // to 'user' via COALESCE so subsequent role-gated routes
          // can pass authorize() instead of throwing
          // "User has no role assigned — complete onboarding first."
          // every protected request.
          //
          // The COALESCE-UPDATE is racy-safe: if two concurrent first
          // sign-ins fire, both write 'user' (idempotent) and both
          // read the same final value.
          const result = await pool.query<{ role: string | null }>(
            `UPDATE users
                SET role = COALESCE(role, 'user')
              WHERE id = $1
              RETURNING role`,
            [user.id],
          );
          const row = result.rows[0];
          if (row?.role) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (token as any).role = row.role;
          } else {
            // Defensive fallback if the UPDATE returned no rows
            // (user deleted mid-sign-in, etc.). Token still gets a
            // role so authorize() doesn't throw on the next request.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (token as any).role = "user";
          }
        } catch (err) {
          // Role lookup/assignment failed (DB hiccup, race against
          // migration). Log but don't crash — assign 'user' on the
          // token so the protected route can still run with the
          // baseline role instead of 403ing on a transient DB blip.
          // eslint-disable-next-line no-console
          console.error("[auth] role lookup failed:", err);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (token as any).role = "user";
        }
      }
      return token;
    },

    /**
     * Expose `id` and `role` on the client session so React
     * components can read them via `useSession()`. With JWT
     * strategy, the callback receives `{ session, token }` — pull
     * from `token`.
     */
    async session({ session, token }) {
      if (session.user && token) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).id = token.sub;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).role = (token as any).role;
      }
      return session;
    },
  },
};
