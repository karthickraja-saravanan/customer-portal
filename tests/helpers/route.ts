/**
 * Test helpers for Pages Router API handlers.
 *
 * Why this exists:
 *   The implementation agent kept reinventing this plumbing — usually
 *   incorrectly, by reaching for `NextRequest` (App Router) instead of
 *   the Pages Router shape. This file is the canonical, paved path.
 *   Use it. Do not hand-roll request/response objects in tests.
 *
 * Quick recipe (copy into your test file):
 *
 *   import handler from '@/pages/api/leads';
 *   import detailHandler from '@/pages/api/leads/[id]';
 *   import { invokeRoute } from '@/tests/helpers/route';
 *
 *   it('GET / returns []', async () => {
 *     const { status, body } = await invokeRoute(handler, { method: 'GET' });
 *     expect(status).toBe(200);
 *     expect(body).toEqual([]);
 *   });
 *
 *   it('PATCH /:id with stale version returns 409', async () => {
 *     const { status } = await invokeRoute(detailHandler, {
 *       method: 'PATCH',
 *       query: { id: leadId },
 *       body: { version: 0, status: 'Contacted' },
 *     });
 *     expect(status).toBe(409);
 *   });
 *
 * Notes:
 *   - `query` is where dynamic route segments go. For `pages/api/leads/[id].ts`,
 *     pass `query: { id: '...' }` — the handler reads `req.query.id`.
 *     Do NOT try to pass a `params` argument; that's App Router.
 *   - `body` is passed through as `req.body` (already-parsed JSON, the way
 *     Next.js delivers it to Pages Router handlers).
 *   - The return value gives you `status` (number), `body` (parsed JSON or
 *     undefined for empty 204s), and `headers` for any header assertions.
 *   - The raw `req` and `res` are exposed too in case you need to assert on
 *     `res.setHeader` calls etc.
 */
import { createMocks, type RequestMethod } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

export interface InvokeRouteOptions {
  method: RequestMethod;
  /** Dynamic-segment values — `pages/api/leads/[id].ts` reads `req.query.id`. */
  query?: Record<string, string | string[]>;
  /** Already-parsed JSON body — what Next.js delivers to handlers. */
  body?: unknown;
  /** Headers to set on the request (Content-Type defaults to JSON). */
  headers?: Record<string, string>;
}

export interface InvokeRouteResult<T = unknown> {
  status: number;
  body: T | undefined;
  headers: Record<string, string | string[] | number | undefined>;
  req: NextApiRequest;
  res: NextApiResponse;
}

// Loose return-type — handlers may return `res.status(...).json(...)`
// (which evaluates to `NextApiResponse`), `void`, or any of those
// inside a Promise. Restricting to `void | Promise<void>` triggered
// TS2345 "Argument of type ... is not assignable to parameter of
// type 'Handler'" on every test that imported a normal Pages-Router
// handler that uses `return res.status(...)`. `unknown` lets TS
// accept whatever the real handler returns; we don't read the
// return value either way (the result lives on `res`).
type Handler = (
  req: NextApiRequest,
  res: NextApiResponse,
) => unknown;

/**
 * Build an `(req, res)` pair, run the handler, and return the parsed
 * outcome. The mocks are isolated — every call gets a fresh pair, so
 * tests can run handlers in any order without bleed-through.
 */
export async function invokeRoute<T = unknown>(
  handler: Handler,
  options: InvokeRouteOptions,
): Promise<InvokeRouteResult<T>> {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: options.method,
    query: options.query,
    // node-mocks-http types `body` narrowly; arbitrary JSON bodies are
    // fine at runtime, so cast through `unknown` to bypass the narrow.
    body: options.body as Parameters<typeof createMocks>[0] extends { body?: infer B }
      ? B
      : never,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
  });
  // `await` on `unknown` is fine — non-thenable values resolve to
  // themselves, thenables (Promise<NextApiResponse> / Promise<void>)
  // resolve normally. Either way we don't use the return value; the
  // handler's effects land on `res`.
  await Promise.resolve(handler(req, res));

  const status = (res as unknown as { _getStatusCode(): number })._getStatusCode();
  const headers = (res as unknown as {
    _getHeaders(): Record<string, string | string[] | number | undefined>;
  })._getHeaders();
  // Try JSON first (the common case); fall back to undefined for empty
  // bodies (204) or non-JSON responses.
  let body: T | undefined;
  try {
    body = (res as unknown as { _getJSONData(): T })._getJSONData();
  } catch {
    body = undefined;
  }
  return { status, body, headers, req, res };
}
