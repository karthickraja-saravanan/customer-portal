/**
 * Forgot-password endpoint — LOCKED. Platform-managed.
 *
 * Creates a single-use `verification_token` row and emails the reset
 * link. Always returns 200 (even when the email isn't registered) to
 * avoid leaking which addresses have accounts — standard pattern.
 *
 * Email transport: per-app Resend via the `resend` integration slug.
 * When `RESEND_API_KEY` is unset (dev / un-provisioned apps), the link
 * is `console.warn`'d so the developer can paste it manually. In
 * production, Resend is wired through the platform's integration
 * registry — the operator runs the integration agent for `resend`
 * once and the env var is injected on every sandbox connect.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { randomBytes, createHash } from "crypto";
import { pool } from "@/lib/db";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

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

  const body = (req.body ?? {}) as { email?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) {
    return res
      .status(400)
      .json({ success: false, error: "Email required" });
  }

  // Look up but do not reveal existence. Always respond 200.
  const userResult = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );
  const user = userResult.rows[0];

  if (user) {
    // Generate a 32-byte random token. Store only the SHA-256 hash;
    // emailing the raw token, then comparing hash on reset means a DB
    // breach can't be used to take over accounts.
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expires = new Date(Date.now() + TOKEN_TTL_MS);

    // Identifier convention: "password-reset:<email>" so the token row
    // doesn't collide with NextAuth's own email-magic-link tokens which
    // use the bare email as identifier.
    await pool.query(
      `INSERT INTO verification_token (identifier, token, expires)
       VALUES ($1, $2, $3)
       ON CONFLICT (identifier, token) DO NOTHING`,
      [`password-reset:${email}`, tokenHash, expires],
    );

    const baseUrl = process.env.NEXTAUTH_URL ?? "";
    const resetLink = `${baseUrl}/reset-password/${rawToken}?email=${encodeURIComponent(email)}`;

    await sendResetEmail(email, resetLink).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[auth/forgot-password] email send failed:", err);
    });
  }

  return res.status(200).json({
    success: true,
    message: "If an account exists for that email, a reset link has been sent.",
  });
}

async function sendResetEmail(email: string, resetLink: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Dev / un-provisioned: print the link so the operator can paste
    // it. Production runs always have the integration installed.
    // eslint-disable-next-line no-console
    console.warn(
      `[auth/forgot-password] RESEND_API_KEY missing — reset link for ${email}: ${resetLink}`,
    );
    return;
  }

  const from = process.env.RESEND_FROM_ADDRESS || "no-reply@example.com";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Reset your password",
      html: `<p>Click the link below to reset your password. The link expires in 1 hour.</p>
             <p><a href="${resetLink}">Reset password</a></p>
             <p>If you didn&apos;t request this, you can safely ignore this email.</p>`,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API ${res.status}: ${text.slice(0, 200)}`);
  }
}
