/**
 * Jest setup — wired via `setupFilesAfterEnv` in jest.config.ts so it
 * runs once per test file after the testing framework is installed.
 *
 * Imports `@testing-library/jest-dom` so test files get the extended
 * matchers (`toBeInTheDocument`, `toHaveClass`, etc.) without each
 * file needing to import them individually.
 */
import "@testing-library/jest-dom";
