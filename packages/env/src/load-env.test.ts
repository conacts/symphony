import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnv } from "./load-env.js";

const ORIGINAL_ENV = { ...process.env };
const TEMP_DIRS: string[] = [];
const TEST_ENV_KEY = "TEST_ENV_VALUE";

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coldets-env-"));
  TEMP_DIRS.push(dir);
  return dir;
}

function writeEnvFile(dir: string, name: string, contents: string): void {
  fs.writeFileSync(path.join(dir, name), contents, "utf8");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  for (const dir of TEMP_DIRS.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("@symphony/env loadEnv", () => {
  it("loads env files with explicit precedence and returns discovered files in precedence order", () => {
    const cwd = createTempDir();
    writeEnvFile(cwd, ".env", `${TEST_ENV_KEY}=base\n`);
    writeEnvFile(cwd, ".env.development", `${TEST_ENV_KEY}=mode\n`);
    writeEnvFile(cwd, ".env.local", `${TEST_ENV_KEY}=local\n`);
    writeEnvFile(cwd, ".env.development.local", `${TEST_ENV_KEY}=mode-local\n`);
    delete process.env[TEST_ENV_KEY];

    const loaded = loadEnv({ cwd, mode: "development", quiet: true });

    expect(loaded).toEqual([
      path.join(cwd, ".env.development.local"),
      path.join(cwd, ".env.local"),
      path.join(cwd, ".env.development"),
      path.join(cwd, ".env")
    ]);
    expect(process.env[TEST_ENV_KEY]).toBe("mode-local");
  });

  it("preserves existing process env values across multiple loads", () => {
    const firstCwd = createTempDir();
    const secondCwd = createTempDir();
    writeEnvFile(firstCwd, ".env", `${TEST_ENV_KEY}=first\n`);
    writeEnvFile(secondCwd, ".env", `${TEST_ENV_KEY}=second\n`);
    delete process.env[TEST_ENV_KEY];

    loadEnv({ cwd: firstCwd, quiet: true });
    loadEnv({ cwd: secondCwd, quiet: true });

    expect(process.env[TEST_ENV_KEY]).toBe("first");
  });

  it("skips .env.local in test mode while keeping test-specific local overrides", () => {
    const cwd = createTempDir();
    writeEnvFile(cwd, ".env", `${TEST_ENV_KEY}=base\n`);
    writeEnvFile(cwd, ".env.local", `${TEST_ENV_KEY}=local\n`);
    writeEnvFile(cwd, ".env.test", `${TEST_ENV_KEY}=test\n`);
    writeEnvFile(cwd, ".env.test.local", `${TEST_ENV_KEY}=test-local\n`);
    delete process.env[TEST_ENV_KEY];

    const loaded = loadEnv({ cwd, mode: "test", quiet: true });

    expect(loaded).toEqual([
      path.join(cwd, ".env.test.local"),
      path.join(cwd, ".env.test"),
      path.join(cwd, ".env")
    ]);
    expect(process.env[TEST_ENV_KEY]).toBe("test-local");
  });

  it("fails fast in strict mode when no env files exist", () => {
    const cwd = createTempDir();

    expect(() => loadEnv({ cwd, mode: "development", quiet: true, strict: true })).toThrowError(
      /No env files found/
    );
  });
});
