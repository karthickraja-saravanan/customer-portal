/**
 * NextAuth session augmentation. Surfaces `role` on `session.user` so
 * `authorize(...roles)` and any UI consumers see it without
 * re-fetching. `session.user.id` IS `users.id` in the single-table
 * model — no separate `domainId` needed.
 */
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      /** Same as `users.id`. Populated by NextAuth from the
       *  authenticated session. */
      id?: string;
      /** Value from `users.role`. Substituted at provisioning time
       *  with the app's role enum (default `'user'`). */
      role?: 'admin' | 'user';
    };
  }
}
