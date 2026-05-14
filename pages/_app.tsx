import type { AppProps } from "next/app";
import { Inter } from "next/font/google";
import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import "../styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

/** __AS_ERROR_FORWARD_V2__ — merge all console.error args; skip vague-only headlines (overlay sends full text). */
function formatConsoleErrorArgs(args: unknown[]): string {
  const parts: string[] = [];
  for (const a of args) {
    if (a == null) continue;
    if (typeof a === "string") {
      parts.push(a);
      continue;
    }
    if (a instanceof Error) {
      parts.push(a.message + (a.stack ? "\n" + a.stack.slice(0, 1200) : ""));
      continue;
    }
    try {
      parts.push(JSON.stringify(a));
    } catch {
      parts.push(String(a));
    }
  }
  return parts.join("\n").slice(0, 4000);
}

function shouldForwardToParent(formatted: string): boolean {
  const m = formatted;
  if (
    m.includes("Hydration") ||
    m.includes("hydration") ||
    m.includes("did not match") ||
    m.includes("Parsing ecmascript") ||
    m.includes("Build Error") ||
    m.includes("Runtime Error") ||
    m.includes("Unhandled Runtime") ||
    m.includes("Module not found") ||
    m.includes("Expected") ||
    m.includes("Unexpected token") ||
    m.includes("SyntaxError") ||
    // Route collisions: Next.js throws this from page-bootstrap.js when two
    // files claim the same URL (e.g. pages/foo.ts vs pages/foo/index.ts).
    // The parent overlay has a dedicated UI + delete button for this class;
    // it was being silently dropped here because the whitelist didn't cover
    // it.
    m.includes("Conflicting app and page file")
  ) {
    return true;
  }
  return false;
}

/** Do not forward a headline-only line; the _document overlay bridge posts the full Turbopack panel. */
function isVagueOnlyHeadline(formatted: string): boolean {
  const t = formatted.trim();
  return /^(Parsing ecmascript|Build Error|Runtime Error)\s*$/i.test(t);
}

// Intercept console.error at module level — runs when the JS bundle loads,
// BEFORE React begins hydration, so build errors and hydration mismatches are captured.
if (typeof window !== "undefined" && !(window as unknown as { __AS_ERROR_FORWARD__?: boolean }).__AS_ERROR_FORWARD__) {
  (window as unknown as { __AS_ERROR_FORWARD__: boolean }).__AS_ERROR_FORWARD__ = true;
  const _origError = console.error.bind(console);
  (console as any).error = (...args: unknown[]) => {
    _origError(...args);
    const formatted = formatConsoleErrorArgs(args);
    if (!formatted.trim()) return;
    if (!shouldForwardToParent(formatted)) return;
    if (isVagueOnlyHeadline(formatted)) return;
    const errorMsg = formatted.slice(0, 2500);
    try {
      window.parent?.postMessage({ type: "__AS_RUNTIME_ERROR__", message: errorMsg }, "*");
    } catch {
      /* ignore */
    }
  };
}

// Error reporter: captures thrown runtime errors and unhandled rejections,
// forwarding them to the AI builder for automatic fix suggestions.
function useErrorReporter() {
  useEffect(() => {
    const send = (msg: string, stack?: string) => {
      try {
        window.parent?.postMessage({ type: "__AS_RUNTIME_ERROR__", message: msg, stack }, "*");
      } catch {
        /* ignore */
      }
    };
    const onError = (e: ErrorEvent) =>
      send(e.message + (e.filename ? `\n  at ${e.filename}:${e.lineno}` : ""), e.error?.stack);
    const onUnhandled = (e: PromiseRejectionEvent) =>
      send(
        e.reason instanceof Error ? e.reason.message : String(e.reason),
        (e.reason as Error)?.stack
      );
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);
}

export default function App({ Component, pageProps }: AppProps) {
  useErrorReporter();
  // SessionProvider lets `useSession()` work across the app. The
  // NextAuth handler is provisioned at `pages/api/auth/[...nextauth].ts`
  // (Pages Router; locked, platform-managed). `pageProps.session` is
  // populated by NextAuth when present; otherwise SessionProvider
  // fetches it client-side on mount.
  return (
    <SessionProvider session={pageProps.session}>
      <main className={`${inter.variable} font-sans antialiased`}>
        <Component {...pageProps} />
      </main>
    </SessionProvider>
  );
}
