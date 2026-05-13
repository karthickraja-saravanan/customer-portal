/**
 * Manual Jest mock for `lucide-react`.
 *
 * Why this exists:
 *   `lucide-react` ships ESM only. `next/jest`'s default `transformIgnorePatterns`
 *   excludes most of `node_modules`, so the import errors at test-time with
 *   `Jest encountered an unexpected token … export { ... }`. Trying to override
 *   `transformIgnorePatterns` is brittle — `next/jest` keeps overwriting it.
 *   A manual mock lives at `__mocks__/lucide-react.ts` and Jest auto-discovers
 *   it via `automock`-style resolution: any file under `__mocks__/<package>.ts`
 *   is used in place of the real module.
 *
 *   The Proxy below returns a stub component for ANY named export, so we don't
 *   have to enumerate which icons (`Search`, `Plus`, `RefreshCw`, …) the
 *   tests use. `default` and `__esModule` are special-cased so `import X from
 *   'lucide-react'` (rare) and `* as` re-exports also work.
 *
 *   Each stub renders a `<svg data-testid="lucide-{name}">` so tests that
 *   assert on icon presence (e.g. `getByTestId('lucide-search')`) keep
 *   working. Component refs are forwarded so callers that pass a `ref` don't
 *   break.
 *
 * Adding an icon library? Drop another file in this directory with the same
 * stub pattern — `__mocks__/<package-name>.ts`.
 */

import * as React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
}

function makeIconStub(name: string) {
  const Stub = React.forwardRef<SVGSVGElement, IconProps>(function Icon(
    { size = 24, strokeWidth = 2, absoluteStrokeWidth: _ignored, ...rest },
    ref,
  ) {
    return React.createElement("svg", {
      ref,
      "data-testid": `lucide-${name.toLowerCase()}`,
      "data-icon": name,
      width: size,
      height: size,
      strokeWidth,
      ...rest,
    });
  });
  Stub.displayName = `LucideStub(${name})`;
  return Stub;
}

const cache = new Map<string, React.ComponentType<IconProps>>();

const handler: ProxyHandler<Record<string, unknown>> = {
  get(_target, prop) {
    if (prop === "__esModule") return true;
    if (typeof prop !== "string") return undefined;
    if (prop === "default") return makeIconStub("Default");
    let stub = cache.get(prop);
    if (!stub) {
      stub = makeIconStub(prop);
      cache.set(prop, stub);
    }
    return stub;
  },
};

const exports: Record<string, unknown> = new Proxy({}, handler);

module.exports = exports;
