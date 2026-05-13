/**
 * Reset-password endpoint — LOCKED. Platform-managed.
 *
 * Validates the verification_token row + applies the new password
 * hash. Tokens are single-use: deleted on success regardless of
 * outcome of the password update (consume-then-update is wrong; we
 * use a transaction so the token is only burned if the update commits).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { pool } from "@/lib/db";

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

  const body = (req.body ?? {}) as {
    email?: string;
    token?: string;
    password?: string;
  };
  const email = String(body.email ?? "").trim().toLowerCase();
  const rawToken = String(body.token ?? "");
  const password = String(body.password ?? "");

  if (!email || !rawToken) {
    return res
      .status(400)
      .json({ success: false, error: "Email and token required" });
  }
  if (password.length < 8) {
    return res
      .status(400)
      .json({ success: false, error: "Password must be at least 8 characters" });
  }

  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const identifier = `password-reset:${email}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock + read the token row. `FOR UPDATE` so a concurrent reset
    // attempt can't both succeed.
    const tokenResult = await client.query<{
      identifier: string;
      token: string;
      expires: Date;
    }>(
      `SELECT identifier, token, expires
         FROM verification_token
        WHERE identifier = $1 AND token = $2
        LIMIT 1
        FOR UPDATE`,
      [identifier, tokenHash],
    );
    const tokenRow = tokenResult.rows[0];

    if (!tokenRow) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ success: false, error: "Invalid or already-used reset link" });
    }
    if (new Date(tokenRow.expires).getTime() < Date.now()) {
      // Burn expired tokens proactively to keep the table tidy.
      await client.query(
        `DELETE FROM verification_token WHERE identifier = $1 AND token = $2`,
        [identifier, tokenHash],
      );
      await client.query("COMMIT");
      return res
        .status(400)
        .json({ success: false, error: "Reset link has expired. Request a new one." });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const updateResult = await client.query(
      `UPDATE users SET password_hash = $1 WHERE email = $2`,
      [password_hash, email],
    );
    if (!updateResult.rowCount) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ success: false, error: "Account not found" });
    }

    // Burn the token. Also nuke any sessions for this user so a stolen
    // session cookie can't outlast a password change — defence-in-depth.
    await client.query(
      `DELETE FROM verification_token WHERE identifier = $1 AND token = $2`,
      [identifier, tokenHash],
    );
    await client.query(
      `DELETE FROM sessions
        WHERE "userId" IN (SELECT id FROM users WHERE email = $1)`,
      [email],
    );

    await client.query("COMMIT");
    return res.status(200).json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    // eslint-disable-next-line no-console
    console.error("[auth/reset-password]", err);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  } finally {
    client.release();
  }
}
