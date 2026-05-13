/**
 * Default reset-password page — works out of the box, page agent regenerates freely.
 *
 * The reset link emailed by /api/auth/forgot-password lands here with
 * `?email=<email>` in the query string and the raw token in the URL
 * path. The form POSTs both to /api/auth/reset-password.
 */
import * as React from "react";
import { useRouter } from "next/router";
import Link from "next/link";

export default function ResetPasswordPage() {
  const router = useRouter();
  const token = router.query.token as string | undefined;
  const email = router.query.email as string | undefined;

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (password !== confirm) {
      setErrorMessage("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErrorMessage(data.error || "Reset failed. Request a new link.");
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token || !email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm text-center text-sm text-muted-foreground">
          Reset link is missing required parameters.{" "}
          <Link href="/forgot-password" className="font-medium text-foreground hover:underline">
            Request a new one
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">For {email}</p>

        {done ? (
          <div className="mt-5 space-y-3">
            <div className="rounded-md border bg-muted px-3 py-2 text-sm">
              Password updated.
            </div>
            <Link
              href="/login"
              className="block w-full rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-medium">New password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirm" className="block text-xs font-medium">Confirm password</label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {errorMessage ? (
              <p className="text-xs text-destructive">{errorMessage}</p>
            ) : null}
            <button
              type="submit"
              disabled={submitting || password.length < 8 || password !== confirm}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {submitting ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
