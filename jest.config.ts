/**
 * Jest configuration via Next.js's `next/jest` preset.
 *
 * Why this exists in the template:
 * The platform's task drafter mandates a `task_type: "test"` per
 * story (R-TASK-004). Without a test runner shipped in the template,
 * every test task became unimplementable — the implementation agent
 * would burn its turn budget trying to engineer around the missing
 * infrastructure. Shipping Jest by default makes "run npm run test"
 * a real verification command on day one.
 *
 * `next/jest` handles TS + JSX + module aliases automatically by
 * piping everything through SWC, so we don't need a separate
 * ts-jest setup or babel config. Apps add tests under
 * `__tests__/` or as co-located `*.test.ts(x)`.
 */
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  // Path to the Next.js app — used to load next.config.* and .env files.
  dir: "./",
});

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Match both __tests__/ and co-located *.test.* files.
  testMatch: [
    "**/__tests__/**/*.[jt]s?(x)",
    "**/?(*.)+(spec|test).[jt]s?(x)",
  ],
  // Module aliases — kept in sync with tsconfig.json's paths so
  // tests can import via @/components/... etc.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};

export default createJestConfig(config);
