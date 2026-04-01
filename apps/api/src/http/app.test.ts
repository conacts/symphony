import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createSymphonyRuntimeApp } from "./app.js";
import type { SymphonyRuntimeTestHarness } from "../test-support/create-symphony-runtime-test-harness.js";
import { createSymphonyRuntimeTestHarness } from "../test-support/create-symphony-runtime-test-harness.js";

const harnesses: SymphonyRuntimeTestHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

async function responseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("@symphony/api app", () => {
  it("serves the runtime state and refresh surfaces", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Review",
        projectSlug: "coldets",
        projectId: "project-1"
      }
    });
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const stateResponse = await app.request("/api/v1/state");
    const refreshResponse = await app.request("/api/v1/refresh", {
      method: "POST"
    });
    const statePayload = await responseJson<{
      data: {
        running: Array<{
          sessionId: string | null;
        }>;
      };
    }>(stateResponse);
    const refreshPayload = await responseJson<{
      data: {
        queued: boolean;
        coalesced: boolean;
        operations: [string, string];
      };
    }>(refreshResponse);

    expect(stateResponse.status).toBe(200);
    expect(statePayload.data.running[0]?.sessionId).toBe("thread-live");

    expect(refreshResponse.status).toBe(202);
    expect(refreshPayload.data.queued).toBe(true);
    expect(refreshPayload.data.coalesced).toBe(false);
    expect(refreshPayload.data.operations).toEqual(["poll", "reconcile"]);
  });

  it("serves forensics routes and the runtime issue detail route", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Review"
      }
    });
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const issuesResponse = await app.request("/api/v1/issues");
    const issueDetailResponse = await app.request("/api/v1/issues/COL-123");
    const issueBundleResponse = await app.request(
      "/api/v1/issues/COL-123/forensics-bundle"
    );
    const runDetailResponse = await app.request("/api/v1/runs/run-123");
    const problemRunsResponse = await app.request("/api/v1/problem-runs");
    const runtimeIssueResponse = await app.request("/api/v1/COL-123");
    const issuesPayload = await responseJson<{
      data: {
        issues: Array<{
          issueIdentifier: string;
        }>;
        totals: {
          issueCount: number;
        };
      };
    }>(issuesResponse);
    const issueDetailPayload = await responseJson<{
      data: {
        issueIdentifier: string;
      };
    }>(issueDetailResponse);
    const issueBundlePayload = await responseJson<{
      data: {
        issue: {
          issueIdentifier: string;
        };
        recentRuns: unknown[];
      };
    }>(issueBundleResponse);
    const runDetailPayload = await responseJson<{
      data: {
        run: {
          runId: string;
        };
      };
    }>(runDetailResponse);
    const problemRunsPayload = await responseJson<{
      data: {
        problemRuns: unknown[];
      };
    }>(problemRunsResponse);
    const runtimeIssuePayload = await responseJson<{
      data: {
        issueIdentifier: string;
        tracked: {
          url: string | null;
        };
        operator: {
          githubPullRequestSearchUrl: string | null;
          requeueCommand: string;
        };
      };
    }>(runtimeIssueResponse);

    expect(issuesResponse.status).toBe(200);
    expect(issuesPayload.data.issues[0]?.issueIdentifier).toBe("COL-123");
    expect(issuesPayload.data.totals.issueCount).toBeGreaterThanOrEqual(1);

    expect(issueDetailResponse.status).toBe(200);
    expect(issueDetailPayload.data.issueIdentifier).toBe("COL-123");

    expect(issueBundleResponse.status).toBe(200);
    expect(issueBundlePayload.data.issue.issueIdentifier).toBe("COL-123");
    expect(Array.isArray(issueBundlePayload.data.recentRuns)).toBe(true);

    expect(runDetailResponse.status).toBe(200);
    expect(runDetailPayload.data.run.runId).toBe("run-123");

    expect(problemRunsResponse.status).toBe(200);
    expect(Array.isArray(problemRunsPayload.data.problemRuns)).toBe(true);

    expect(runtimeIssueResponse.status).toBe(200);
    expect(runtimeIssuePayload.data.issueIdentifier).toBe("COL-123");
    expect(runtimeIssuePayload.data.tracked.url).toBe(
      "https://linear.app/coldets/issue/col-123"
    );
    expect(runtimeIssuePayload.data.operator.githubPullRequestSearchUrl).toContain(
      "github.com/openai/symphony/pulls"
    );
    expect(runtimeIssuePayload.data.operator.requeueCommand).toBe("/rework");
  });

  it("serves tracker-only runtime issue context when no live runtime state exists", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "Done"
      },
      snapshot: {
        running: [],
        retrying: []
      }
    });
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const runtimeIssueResponse = await app.request("/api/v1/COL-123");
    const runtimeIssuePayload = await responseJson<{
      data: {
        issueIdentifier: string;
        status: string;
        tracked: {
          url: string | null;
        };
        running: null;
        retry: null;
      };
    }>(runtimeIssueResponse);

    expect(runtimeIssueResponse.status).toBe(200);
    expect(runtimeIssuePayload.data.issueIdentifier).toBe("COL-123");
    expect(runtimeIssuePayload.data.status).toBe("tracked");
    expect(runtimeIssuePayload.data.tracked.url).toBe(
      "https://linear.app/coldets/issue/col-123"
    );
    expect(runtimeIssuePayload.data.running).toBeNull();
    expect(runtimeIssuePayload.data.retry).toBeNull();
  });

  it("serves the new health, runtime logs, and issue timeline surfaces", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Review"
      }
    });
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const healthResponse = await app.request("/api/v1/health");
    const logsResponse = await app.request("/api/v1/runtime/logs");
    const timelineResponse = await app.request("/api/v1/issues/COL-123/timeline");

    const healthPayload = await responseJson<{
      data: {
        healthy: boolean;
        db: {
          ready: boolean;
        };
      };
    }>(healthResponse);
    const logsPayload = await responseJson<{
      data: {
        logs: Array<{
          eventType: string;
        }>;
      };
    }>(logsResponse);
    const timelinePayload = await responseJson<{
      data: {
        entries: Array<{
          eventType: string;
        }>;
      };
    }>(timelineResponse);

    expect(healthResponse.status).toBe(200);
    expect(healthPayload.data.healthy).toBe(true);
    expect(healthPayload.data.db.ready).toBe(true);

    expect(logsResponse.status).toBe(200);
    expect(logsPayload.data.logs[0]?.eventType).toBe("db_initialized");

    expect(timelineResponse.status).toBe(200);
    expect(timelinePayload.data.entries[0]?.eventType).toBe("retry_scheduled");
  });

  it("fails closed on invalid params and ingests GitHub review events", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Review"
      }
    });
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const rawBody = JSON.stringify({
      repository: {
        full_name: "openai/symphony"
      },
      action: "submitted",
      pull_request: {
        number: 123,
        head: {
          sha: "abc123",
          ref: "symphony/COL-123"
        },
        url: "https://api.github.com/repos/openai/symphony/pulls/123",
        html_url: "https://github.com/openai/symphony/pull/123"
      },
      review: {
        id: 999,
        state: "changes_requested",
        user: {
          login: "reviewer"
        }
      }
    });
    const signature = `sha256=${createHmac("sha256", "secret").update(rawBody).digest("hex")}`;

    const invalidResponse = await app.request("/api/v1/issues?limit=0");
    const ingressResponse = await app.request("/api/v1/github/review-events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-1",
        "x-github-event": "pull_request_review",
        "x-hub-signature-256": signature
      },
      body: rawBody
    });
    const invalidPayload = await responseJson<{
      error: {
        code: string;
      };
    }>(invalidResponse);
    const ingressPayload = await responseJson<{
      data: {
        accepted: boolean;
      };
    }>(ingressResponse);

    expect(invalidResponse.status).toBe(400);
    expect(invalidPayload.error.code).toBe("VALIDATION_FAILED");

    expect(ingressResponse.status).toBe(202);
    expect(ingressPayload.data.accepted).toBe(true);
  });

  it("accepts raw GitHub issue_comment /rework webhooks", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Review"
      }
    });
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const rawBody = JSON.stringify({
      action: "created",
      repository: {
        full_name: "openai/symphony",
        private: true,
        default_branch: "main"
      },
      issue: {
        number: 123,
        title: "Requeue issue",
        state: "open",
        pull_request: {
          url: "https://api.github.com/repos/openai/symphony/pulls/123",
          html_url: "https://github.com/openai/symphony/pull/123"
        }
      },
      comment: {
        id: 456,
        body: "/rework please retry",
        created_at: "2026-04-01T07:41:59.000Z",
        user: {
          login: "reviewer",
          id: 1
        }
      },
      sender: {
        login: "reviewer",
        id: 1
      }
    });
    const signature = `sha256=${createHmac("sha256", "secret").update(rawBody).digest("hex")}`;

    const ingressResponse = await app.request("/api/v1/github/review-events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-issue-comment-1",
        "x-github-event": "issue_comment",
        "x-hub-signature-256": signature
      },
      body: rawBody
    });
    const ingressPayload = await responseJson<{
      data: {
        accepted: boolean;
        event: string;
      };
    }>(ingressResponse);

    expect(ingressResponse.status).toBe(202);
    expect(ingressPayload.data.accepted).toBe(true);
    expect(ingressPayload.data.event).toBe("issue_comment");
  });

  it("allows local dashboard origins to read the runtime api", async () => {
    const harness = await createSymphonyRuntimeTestHarness();
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services);
    const response = await app.request("/api/v1/problem-runs", {
      headers: {
        origin: "http://localhost:3000"
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000"
    );
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("rejects disallowed cors preflight requests", async () => {
    const harness = await createSymphonyRuntimeTestHarness();
    harnesses.push(harness);

    const app = createSymphonyRuntimeApp(harness.services, {
      allowedOrigins: ["http://localhost:3000"]
    });
    const response = await app.request("/api/v1/problem-runs", {
      method: "OPTIONS",
      headers: {
        origin: "https://example.com"
      }
    });

    expect(response.status).toBe(403);
  });
});
