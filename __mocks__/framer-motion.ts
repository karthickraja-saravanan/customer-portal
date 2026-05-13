/**
 * Manual Jest mock for `framer-motion`.
 *
 * Same rationale as `__mocks__/lucide-react.ts`: framer-motion ships ESM
 * only, `next/jest`'s default `transformIgnorePatterns` excludes most of
 * `node_modules`, so a real import errors at test-time with
 * `Jest encountered an unexpected token … export { ... }`. The manual mock
 * is auto-discovered.
 *
 * Behaviour goals (NOT 100% fidelity — just "tests don't crash and DOM
 * assertions keep working"):
 *
 *   - `motion.div`, `motion.span`, `motion.button`, … render as the plain
 *     HTML element with non-DOM motion props (`initial`, `animate`,
 *     `exit`, `whileHover`, `transition`, etc.) stripped so React doesn't
 *     warn about unknown attrs.
 *   - `motion(Component)` returns the wrapped component unchanged.
 *   - `AnimatePresence` is a pass-through fragment.
 *   - `LazyMotion`, `MotionConfig`, `Reorder.Group`, `Reorder.Item` —
 *     pass-through.
 *   - `useScroll`, `useTransform`, `useSpring`, `useMotionValue`,
 *     `useMotionValueEvent`, `useInView`, `useAnimate`, `useAnimation`
 *     return harmless inert objects so the component renders.
 */

import * as React from "react";

// Motion-specific props that React would warn about as unknown DOM
// attributes. `style` is intentionally NOT here — apps pass real CSS
// through it.
const NON_DOM_PROPS = new Set([
  "initial",
  "animate",
  "exit",
  "transition",
  "variants",
  "whileHover",
  "whileTap",
  "whileFocus",
  "whileDrag",
  "whileInView",
  "viewport",
  "drag",
  "dragConstraints",
  "dragElastic",
  "dragMomentum",
  "dragTransition",
  "layout",
  "layoutId",
  "layoutDependency",
  "onAnimationStart",
  "onAnimationComplete",
  "onUpdate",
  "onDragStart",
  "onDrag",
  "onDragEnd",
  "onHoverStart",
  "onHoverEnd",
  "onTap",
  "onTapStart",
  "onTapCancel",
  "onViewportEnter",
  "onViewportLeave",
  "custom",
  "transformTemplate",
]);

function stripMotionProps<P extends Record<string, unknown>>(props: P): P {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(props)) {
    if (NON_DOM_PROPS.has(k)) continue;
    out[k] = props[k];
  }
  return out as P;
}

function makeMotionElement(tag: string) {
  const Comp = React.forwardRef<HTMLElement, Record<string, unknown>>(
    function MotionStub(props, ref) {
      const { children, ...rest } = props;
      return React.createElement(
        tag,
        { ref, ...stripMotionProps(rest as Record<string, unknown>) },
        children as React.ReactNode,
      );
    },
  );
  Comp.displayName = `MotionStub(${tag})`;
  return Comp;
}

const motionCache = new Map<string, React.ComponentType<unknown>>();

function motionFactory(target: unknown) {
  // `motion(Component)` — wrap a custom component, return it unchanged.
  if (typeof target === "function" || (typeof target === "object" && target !== null)) {
    return target;
  }
  return target;
}

const motion = new Proxy(motionFactory as unknown as Record<string, unknown>, {
  get(_target, prop) {
    if (prop === "__esModule") return true;
    if (typeof prop !== "string") return undefined;
    let stub = motionCache.get(prop);
    if (!stub) {
      stub = makeMotionElement(prop) as unknown as React.ComponentType<unknown>;
      motionCache.set(prop, stub);
    }
    return stub;
  },
  apply(_target, _thisArg, args: unknown[]) {
    return motionFactory(args[0]);
  },
});

const AnimatePresence: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  React.createElement(React.Fragment, null, children);

const LazyMotion: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  React.createElement(React.Fragment, null, children);

const MotionConfig: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  React.createElement(React.Fragment, null, children);

const Reorder = {
  Group: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  Item: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
};

const inertMotionValue = {
  get: () => 0,
  set: () => undefined,
  on: () => () => undefined,
  destroy: () => undefined,
  isAnimating: () => false,
};

const useMotionValue = (initial?: unknown) => ({ ...inertMotionValue, get: () => initial ?? 0 });
const useTransform = () => inertMotionValue;
const useSpring = () => inertMotionValue;
const useScroll = () => ({
  scrollX: inertMotionValue,
  scrollY: inertMotionValue,
  scrollXProgress: inertMotionValue,
  scrollYProgress: inertMotionValue,
});
const useMotionValueEvent = () => undefined;
const useInView = () => false;
const useAnimate = () => [React.createRef(), () => Promise.resolve()] as const;
const useAnimation = () => ({
  start: () => Promise.resolve(),
  stop: () => undefined,
  set: () => undefined,
  mount: () => () => undefined,
});
const useAnimationControls = useAnimation;

const domAnimation = {};
const domMax = {};

module.exports = {
  __esModule: true,
  motion,
  m: motion,
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  Reorder,
  useMotionValue,
  useTransform,
  useSpring,
  useScroll,
  useMotionValueEvent,
  useInView,
  useAnimate,
  useAnimation,
  useAnimationControls,
  domAnimation,
  domMax,
  default: motion,
};
