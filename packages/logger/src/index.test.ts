import { describe, expect, it } from "vitest";
import {
  createSilentSymphonyLogger,
  createSymphonyLogger,
  resolveSymphonyLogLevel,
  type SymphonyLogEntry
} from "./index.js";

describe("@symphony/logger", () => {
  it("serializes structured context and child logger metadata", () => {
    const entries: SymphonyLogEntry[] = [];
    const logger = createSymphonyLogger({
      name: "@symphony/logger.test",
      level: "debug",
      now: () => new Date("2026-03-31T00:00:00.000Z"),
      pid: 42,
      sink(entry) {
        entries.push(entry);
      }
    }).child({
      requestId: "req-1"
    });

    logger.error("request failed", {
      status: 500,
      error: new Error("boom")
    });

    expect(entries).toEqual([
      {
        timestamp: "2026-03-31T00:00:00.000Z",
        level: "error",
        logger: "@symphony/logger.test",
        message: "request failed",
        pid: 42,
        context: {
          requestId: "req-1",
          status: 500,
          error: {
            name: "Error",
            message: "boom",
            stack: expect.any(String)
          }
        }
      }
    ]);
  });

  it("falls back when a log level is invalid", () => {
    expect(resolveSymphonyLogLevel("invalid", "debug")).toBe("debug");
    expect(resolveSymphonyLogLevel("warn", "debug")).toBe("warn");
  });

  it("supports a silent logger for tests", () => {
    const logger = createSilentSymphonyLogger("@symphony/logger.silent");

    expect(() => {
      logger.debug("ignored");
      logger.info("ignored");
      logger.warn("ignored");
      logger.error("ignored");
    }).not.toThrow();
  });
});
