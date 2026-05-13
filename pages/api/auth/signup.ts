/**
 * Signup endpoint — LOCKED. Platform-managed.
 *
 * Creates a `users` row with the canonical NextAuth identity columns
 * + the platform's `role` extension column (default `user`).
 * The user immediately can sign in via the credentials provider.
 * Single-table model: this is the only INSERT — no separate domain
 * row, no two-table dance.
 *
 * Why locked: this endpoint writes to the `users` table's
 * adapter-managed columns (`email`, `name`) alongside the platform's
 * `password_hash` extension. R-BACKEND-002 forbids app code from
 * reinventing password hashing or session storage.
 *
 * Public-signup flag: `auth-config.ts` exports `isPublicSignupEnabled`.
 * When false (the platform default for invite-only apps), this
 * endpoint returns 403 — admins create users via a separate
 * invite flow instead.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";

const PUBLIC_SIGNUP_ENABLED =
  process.env.PUBLIC_SIGNUP_ENABLED === "true";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  if (!PUBLIC_SIGNUP_ENABLED) {
    return res
      .status(403)
      .json({ success: false, error: "Self-signup is disabled. Contact your admin." });
  }

  // `req.body` is already-parsed JSON in Pages Router (no need for
  // req.json()). When the client sends bad JSON, Next.js fails parse
  // before reaching this handler — but accept missing fields and
  // surface the validation errors below regardless.
  const body = (req.body ?? {}) as {
    email?: string;
    password?: string;
    name?: string;
  };
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = body.name ? String(body.name).trim() : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res
      .status(400)
      .json({ success: false, error: "Valid email required" });
  }
  if (password.length < 8) {
    return res
      .status(400)
      .json({ success: false, error: "Password must be at least 8 characters" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Reject duplicates against existing users row.
    const existing = await client.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ success: false, error: "An account with that email already exists" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    // First-user-auto-promote: if the users table is empty, the very
    // first signup is almost certainly the operator who just deployed
    // the app. Bootstrap them as the highest-privileged role
    // (admin) so they can reach admin pages without
    // an out-of-band role bump. Subsequent signups land on
    // user, which an admin can promote later. The check
    // runs inside the same transaction as the INSERT so two
    // simultaneous signups can't both claim first-user status —
    // whichever commits first gets the highest role, the other gets
    // the default.
    const userCountRes = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM users`,
    );
    const isFirstUser = userCountRes.rows[0]?.n === "0";
    const role = isFirstUser ? "admin" : "user";

    // Single INSERT: NextAuth identity columns + platform extensions
    // (password_hash, role) on the same `users` row. No domain table
    // to populate separately.
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [email, name, password_hash, role],
    );
    const userId = inserted.rows[0].id;

    await client.query("COMMIT");
    return res
      .status(201)
      .json({ success: true, data: { id: userId, email } });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const message =
      err instanceof Error ? err.message : "Internal server error";
    // eslint-disable-next-line no-console
    console.error("[auth/signup]", err);
    return res
      .status(500)
      .json({ success: false, error: message });
  } finally {
    client.release();
  }
}
