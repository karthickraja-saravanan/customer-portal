/**
 * Role-gated authorization helper for Pages Router.
 *
 * Apps wrap protected API routes with:
 *
 *   const user = await authorize(req, "Admin", "Counselor");
 *   //                            ^^^ NextApiRequest  ^^^ allowed roles
 *
 * The session shape is augmented via the platform's auth callback —
 * `session.user.role` carries the value from `users.role`.
 *
 * Throws `AuthorizationError` for unauthenticated/unauthorized; the
 * caller catches and translates to a 401/403 JSON response.
 *
 * Pages Router note: there is no `getServerAuthSession()` / App
 * Router `redirect()` here — server-side session resolution requires
 * the request object. `getServerSidePropsHelper` adapts the same
 * call for `getServerSideProps` contexts.
 */
import type { NextApiRequest } from "next";
import type { GetServerSidePropsContext } from "next";
import { getSessionUser } from "@/lib/auth-helpers";

export type AppRole = 'admin' | 'user';

export const APP_ROLES: readonly AppRole[] = ['admin', 'user'] as const;

export class AuthorizationError extends Error {
  readonly status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
    this.name = "AuthorizationError";
  }
}

/**
 * Assert the request's session belongs to a user with one of the
 * allowed roles. Pass no roles to require ANY authenticated user.
 *
 * - Unauthenticated → throws 401
 * - Authenticated but role not in allow-list → throws 403
 * - Authenticated, no role assigned (first OAuth login) → throws 403
 *   with a hint for the app to redirect to onboarding
 *
 * Usage in an API handler:
 *
 *   try {
 *     const user = await authorize(req, "Admin");
 *     // ... user is { id, email, name, role }
 *   } catch (err) {
 *     if (err instanceof AuthorizationError) {
 *       return res.status(err.status).json({ error: err.message });
 *     }
 *     throw err;
 *   }
 */
export async function authorize(
  req: NextApiRequest,
  ...allowedRoles: AppRole[]
): Promise<{ id: string; email: string | null; name: string | null; role?: AppRole }> {
  const session = await getSessionUser(req);
  if (!session) {
    throw new AuthorizationError(401, "Not authenticated");
  }
  // `getSessionUser` returns the JWT-claim subset (id/email/name).
  // The role lives on the same JWT — read the raw token if your app
  // needs it. Keeping this helper minimal for the common cases:
  // most routes only need "is anybody?" or "is one of these roles?",
  // and the role check uses what the credentials provider's
  // `jwt` callback put on the token (see `lib/auth-config.ts`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (session as any).role as AppRole | undefined;
  if (allowedRoles.length === 0) {
    return { ...session, role };
  }
  if (!role) {
    throw new AuthorizationError(
      403,
      "User has no role assigned — complete onboarding first.",
    );
  }
  if (!allowedRoles.includes(role)) {
    throw new AuthorizationError(
      403,
      `Role '${role}' not in allow-list [${allowedRoles.join(", ")}]`,
    );
  }
  return { ...session, role };
}

/**
 * Page-level helper for `getServerSideProps`: returns either the
 * authorized user or a `redirect` props object the caller can return
 * directly. Lets pages avoid try/catch boilerplate.
 *
 * Usage:
 *
 *   export const getServerSideProps: GetServerSideProps = async (ctx) => {
 *     const result = await authorizePageOrRedirect(ctx, "Admin");
 *     if ("redirect" in result) return result;
 *     return { props: { user: result.user } };
 *   };
 */
export async function authorizePageOrRedirect(
  ctx: GetServerSidePropsContext,
  ...allowedRoles: AppRole[]
): Promise<
  | { user: Awaited<ReturnType<typeof authorize>> }
  | { redirect: { destination: string; permanent: false } }
> {
  try {
    const user = await authorize(ctx.req as unknown as NextApiRequest, ...allowedRoles);
    return { user };
  } catch (err) {
    if (err instanceof AuthorizationError && err.status === 401) {
      const callback = encodeURIComponent(ctx.resolvedUrl ?? "/");
      return {
        redirect: {
          destination: `/login?callbackUrl=${callback}`,
          permanent: false,
        },
      };
    }
    throw err;
  }
}
