import path from "node:path";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

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

describe("tool spike-result command", () => {
  it(
    "fails cleanly when the spike details are missing",
    async () => {
      await expect(
        execSpikeResultCommand(
          [
            "--summary",
            "Need a detailed comment."
          ],
          {
            SYMPHONY_RUN_ID: "run-123",
            SYMPHONY_ISSUE_ID: "issue-123",
            SYMPHONY_ISSUE_IDENTIFIER: "COL-123"
          }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          "requires either `--details` or `--details-file`"
        )
      });
    },
    20_000
  );

  it(
    "submits the spike result through the runtime tools API when a control-plane URL is available",
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "symphony-cli-spike-result-"));
      tempRoots.push(root);

      const detailsFile = path.join(root, "spike-result.md");
      await writeFile(
        detailsFile,
        "- Findings\n- Recommendation: proceed with the container-side SDK runner spike."
      );

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
                output: JSON.stringify({ commentPosted: true, via: "api" }),
                contentItems: [
                  {
                    type: "inputText",
                    text: JSON.stringify({ commentPosted: true, via: "api" })
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
        throw new TypeError(
          "Expected a TCP address for the CLI spike-result API test."
        );
      }

      try {
        const command = await execSpikeResultCommand(
          [
            "--summary",
            "Documented the spike result.",
            "--details-file",
            detailsFile
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

        expect(command.stdout).toContain('"commentPosted": true');
        expect(requestBody).toContain('"runId":"run-456"');
        expect(requestBody).toContain('"summary":"Documented the spike result."');
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    },
    20_000
  );
});

function execSpikeResultCommand(
  args: string[],
  env: Record<string, string>
) {
  return execFileAsync(
    "node",
    [devJsPath, "tool", "spike-result", ...args],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env
      }
    }
  );
}
