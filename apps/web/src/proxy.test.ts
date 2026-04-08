import { afterEach, describe, expect, it } from "vitest";
import { buildMockProxyResponse } from "./proxy";

const originalMockFlag = process.env.NEXT_PUBLIC_SYMPHONY_USE_MOCK_RUNTIME;

afterEach(() => {
  if (originalMockFlag === undefined) {
    delete process.env.NEXT_PUBLIC_SYMPHONY_USE_MOCK_RUNTIME;
  } else {
    process.env.NEXT_PUBLIC_SYMPHONY_USE_MOCK_RUNTIME = originalMockFlag;
  }
});

describe("web proxy", () => {
  it("does not intercept api requests when mock runtime is disabled", () => {
    delete process.env.NEXT_PUBLIC_SYMPHONY_USE_MOCK_RUNTIME;

    const response = buildMockProxyResponse({
      method: "GET",
      url: "http://localhost:3000/api/v1/state"
    });

    expect(response).toBeNull();
  });

  it("serves the runtime state endpoint from mock data when mock runtime is enabled", async () => {
    process.env.NEXT_PUBLIC_SYMPHONY_USE_MOCK_RUNTIME = "true";

    const response = buildMockProxyResponse({
      method: "GET",
      url: "http://localhost:3000/api/v1/state"
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);

    const payload = await response!.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.counts.running).toBe(3);
  });

  it("serves the issue index endpoint from mock data when mock runtime is enabled", async () => {
    process.env.NEXT_PUBLIC_SYMPHONY_USE_MOCK_RUNTIME = "true";

    const response = buildMockProxyResponse({
      method: "GET",
      url: "http://localhost:3000/api/v1/issues?sortBy=lastActive&sortDirection=desc"
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);

    const payload = await response!.json();
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data.issues)).toBe(true);
    expect(payload.data.issues.length).toBeGreaterThan(0);
  });

  it("returns a mock 501 response for unsupported mock-runtime endpoints", async () => {
    process.env.NEXT_PUBLIC_SYMPHONY_USE_MOCK_RUNTIME = "true";

    const response = buildMockProxyResponse({
      method: "DELETE",
      url: "http://localhost:3000/api/v1/state"
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(501);
  });
});
