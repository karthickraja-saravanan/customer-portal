/**
 * Server-side auth helpers for Pages Router.
 *
 * Pages Router has no Server Components, so the App-Router pattern
 * `import { auth } from "..."` then `await auth()` doesn't apply
 * here. Instead, every server-side caller has a `req` (from an API
 * handler signature, `getServerSideProps` context, or middleware).
 *
 * This file re-exports `requireUser` / `getSessionUser` from
 * `lib/auth-helpers.ts` (the canonical platform helper) so callers
 * who reach for `@/lib/auth` get the right thing without re-rolling
 * session logic.
 *
 * For middleware, use `getToken` from `next-auth/jwt` directly —
 * see `middleware.ts` for the canonical pattern.
 */
export {
  getSessionUser,
  requireUser,
  UnauthenticatedError,
  type SessionUser,
} from "@/lib/auth-helpers";
