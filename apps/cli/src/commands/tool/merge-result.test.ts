import path from "node:path";
import { createServer } from "node:http";
import { beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { ensureRuntimeToolsBuild } from "../../test-support/ensure-runtime-tools-build.js";

const execFileAsync = promisify(execFile);
const devJsPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../bin/dev.js"
);

beforeAll(async () => {
  await ensureRuntimeToolsBuild();
});

describe("tool merge-result command", () => {
  it(
    "fails cleanly when the merge status is missing",
    async () => {
      await expect(
        execMergeResultCommand([], {
          SYMPHONY_RUN_ID: "run-123",
          SYMPHONY_ISSUE_ID: "issue-123",
          SYMPHONY_ISSUE_IDENTIFIER: "COL-123"
        })
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("Missing required flag status")
      });
    },
    20_000
  );

  it(
    "submits the merge result through the runtime tools API when a control-plane URL is available",
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
                output: JSON.stringify({ mergeResultRecorded: true, via: "api" }),
                contentItems: [
                  {
                    type: "inputText",
                    text: JSON.stringify({ mergeResultRecorded: true, via: "api" })
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
        throw new TypeError("Expected a TCP address for the CLI merge-result API test.");
      }

      try {
        const command = await execMergeResultCommand(
          [
            "--status",
            "blocked",
            "--summary",
            "Conflicts remain unresolved.",
            "--blocking-reason",
            "Conflicts in packages/workspace/src/docker-client.ts"
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

        expect(command.stdout).toContain('"mergeResultRecorded": true');
        expect(requestBody).toContain('"runId":"run-456"');
        expect(requestBody).toContain('"status":"blocked"');
        expect(requestBody).toContain(
          '"blockingReason":"Conflicts in packages/workspace/src/docker-client.ts"'
        );
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    },
    20_000
  );
});

function execMergeResultCommand(
  args: string[],
  env: Record<string, string>
) {
  return execFileAsync(
    "node",
    [devJsPath, "tool", "merge-result", ...args],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env
      }
    }
  );
}
