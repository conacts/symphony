import path from "node:path";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  createSymphonyIssueDeliveryReportStore,
  initializeSymphonyDb
} from "@symphony/db";
import { ensureRuntimeToolsBuild } from "../../test-support/ensure-runtime-tools-build.js";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];
const devJsPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../bin/dev.js"
);

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true
      })
    )
  );
});

beforeAll(async () => {
  await ensureRuntimeToolsBuild();
});

describe("tool finish command", () => {
  it(
    "records a completed delivery report from CLI context",
    async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-cli-finish-"));
    tempRoots.push(root);

    const dbFile = path.join(root, "symphony.db");
    const database = initializeSymphonyDb({
      dbFile
    });
    database.close();

    const command = await execFinishCommand(
      [
        "--status",
        "completed",
        "--summary",
        "Opened PR for the requested work.",
        "--pr-url",
        "https://github.com/openai/symphony/pull/123",
        "--branch-name",
        "codex/col-123"
      ],
      {
        SYMPHONY_DB_FILE: dbFile,
        SYMPHONY_RUN_ID: "run-123",
        SYMPHONY_ISSUE_ID: "issue-123",
        SYMPHONY_ISSUE_IDENTIFIER: "COL-123",
        SYMPHONY_ISSUE_STATE: "In Review",
        SYMPHONY_TURN_ID: "turn-123",
        SYMPHONY_LINEAR_TEAM_KEY: "COL",
        LINEAR_API_KEY: "token"
      }
    );

    expect(command.stdout).toContain('"recorded": true');
    expect(command.stdout).toContain('"targetState": "In Review"');

    const verificationDb = initializeSymphonyDb({
      dbFile
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: verificationDb.db
    });
    const reports = await deliveryReports.listForRun("run-123");
    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual(
      expect.objectContaining({
        issueIdentifier: "COL-123",
        runId: "run-123",
        turnId: "turn-123",
        status: "completed",
        prUrl: "https://github.com/openai/symphony/pull/123",
        branchName: "codex/col-123"
      })
    );
    verificationDb.close();
    },
    20_000
  );

  it(
    "fails cleanly when required runtime context is missing",
    async () => {
    await expect(
      execFinishCommand(
        [
          "--status",
          "partial",
          "--summary",
          "Partial delivery."
        ],
        {
          SYMPHONY_LINEAR_TEAM_KEY: "COL",
          LINEAR_API_KEY: "token"
        }
      )
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Missing required Symphony CLI environment variable")
    });
    },
    20_000
  );

  it(
    "records delivery through the runtime tools API when a control-plane URL is available",
    async () => {
      let requestBody = "";
      const server = createServer((request, response) => {
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          requestBody += chunk;
        });
        request.on("end", () => {
          response.writeHead(200, {
            "Content-Type": "application/json"
          });
          response.end(
            JSON.stringify({
              ok: true,
              schemaVersion: "1",
              data: {
                success: true,
                output: JSON.stringify({ recorded: true, via: "api" }),
                contentItems: [
                  {
                    type: "inputText",
                    text: JSON.stringify({ recorded: true, via: "api" })
                  }
                ]
              },
              meta: {
                durationMs: 0,
                generatedAt: new Date().toISOString()
              }
            })
          );
        });
      });

      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", () => resolve())
      );
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        throw new TypeError("Expected a TCP address for the CLI finish API test.");
      }

      try {
        const command = await execFinishCommand(
          [
            "--status",
            "partial",
            "--summary",
            "Partial delivery through the control plane."
          ],
          {
            SYMPHONY_API_BASE_URL: `http://127.0.0.1:${address.port}`,
            SYMPHONY_RUN_ID: "run-456",
            SYMPHONY_ISSUE_ID: "issue-456",
            SYMPHONY_ISSUE_IDENTIFIER: "COL-456",
            SYMPHONY_ISSUE_STATE: "In Progress",
            SYMPHONY_TURN_ID: "turn-456"
          }
        );

        expect(command.stdout).toContain('"recorded": true');
        expect(requestBody).toContain('"runId":"run-456"');
        expect(requestBody).toContain('"status":"partial"');
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    },
    20_000
  );
});

function execFinishCommand(
  args: string[],
  env: Record<string, string>
) {
  return execFileAsync(
    "node",
    [devJsPath, "tool", "finish", ...args],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env
      }
    }
  );
}
