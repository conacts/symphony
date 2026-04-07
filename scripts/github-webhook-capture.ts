import { mkdir, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const outputRoot = path.resolve(
  process.env.GITHUB_WEBHOOK_CAPTURE_DIR ??
    path.join(process.cwd(), ".tmp", "github-webhook-captures")
);

type CapturedWebhook = {
  capturedAt: string;
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  bodyText: string;
  bodyJson: unknown | null;
};

await mkdir(outputRoot, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    const bodyText = await readBody(request);
    const capture = buildCapture(request, bodyText);
    const filePath = buildCaptureFilePath(capture);

    await writeFile(filePath, `${JSON.stringify(capture, null, 2)}\n`, "utf8");

    console.log("");
    console.log("=== GitHub webhook captured ===");
    console.log(`Time: ${capture.capturedAt}`);
    console.log(`Method: ${capture.method}`);
    console.log(`URL: ${capture.url}`);
    console.log(
      `Event: ${stringHeader(capture.headers["x-github-event"]) ?? "unknown"}`
    );
    console.log(
      `Delivery: ${
        stringHeader(capture.headers["x-github-delivery"]) ?? "unknown"
      }`
    );
    console.log(
      `Action: ${
        typeof capture.bodyJson === "object" &&
        capture.bodyJson !== null &&
        "action" in capture.bodyJson &&
        typeof capture.bodyJson.action === "string"
          ? capture.bodyJson.action
          : "unknown"
      }`
    );
    console.log(`Saved: ${filePath}`);
    console.log("Headers:");
    console.log(JSON.stringify(capture.headers, null, 2));
    console.log("Body:");
    console.log(bodyText);
    console.log("=== End capture ===");

    replyJson(response, 200, {
      ok: true,
      saved: filePath
    });
  } catch (error) {
    console.error("Failed to capture GitHub webhook", error);
    replyJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `GitHub webhook capture server listening on http://127.0.0.1:${port}`
  );
  console.log(`Writing captures to ${outputRoot}`);
});

function buildCapture(
  request: IncomingMessage,
  bodyText: string
): CapturedWebhook {
  const capturedAt = new Date().toISOString();
  let bodyJson: unknown | null = null;

  try {
    bodyJson = bodyText === "" ? null : JSON.parse(bodyText);
  } catch {
    bodyJson = null;
  }

  return {
    capturedAt,
    method: request.method ?? "UNKNOWN",
    url: request.url ?? "/",
    headers: request.headers,
    bodyText,
    bodyJson
  };
}

function buildCaptureFilePath(capture: CapturedWebhook): string {
  const timestamp = capture.capturedAt.replaceAll(":", "-");
  const delivery =
    stringHeader(capture.headers["x-github-delivery"])?.replaceAll("/", "_") ??
    "no-delivery-id";
  return path.join(outputRoot, `${timestamp}-${delivery}.json`);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

function replyJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function stringHeader(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  if (Array.isArray(value)) {
    const first = value.find((entry) => entry.trim() !== "");
    return first ?? null;
  }

  return null;
}
