import { createMemorySymphonyTracker } from "@symphony/tracker";
import type { SymphonyResolvedRuntimePolicy } from "@symphony/runtime-policy";
import type {
  SymphonyGitHubIssueCommentPayload,
  SymphonyGitHubWebhookHeaders
} from "@symphony/contracts";
import {
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "./core-builders.js";
import {
  buildSymphonyGitHubIssueCommentPayload,
  buildSymphonyGitHubWebhookHeaders,
  signSymphonyGitHubWebhook
} from "./github-builders.js";

export type SymphonyGitHubIngressRequestFixture = {
  headers: SymphonyGitHubWebhookHeaders;
  body: SymphonyGitHubIssueCommentPayload;
  rawBody: string;
};

export type SymphonyManualReworkIngressFixture = {
  issue: ReturnType<typeof buildSymphonyTrackerIssue>;
  runtimePolicy: SymphonyResolvedRuntimePolicy;
  tracker: ReturnType<typeof createMemorySymphonyTracker>;
  firstRequest: SymphonyGitHubIngressRequestFixture;
  duplicateRequest: SymphonyGitHubIngressRequestFixture;
};

export function buildSymphonyManualReworkIngressFixture(input: {
  issueOverrides?: Partial<ReturnType<typeof buildSymphonyTrackerIssue>>;
  runtimePolicyOverrides?: Partial<SymphonyResolvedRuntimePolicy>;
} = {}): SymphonyManualReworkIngressFixture {
  const issue = buildSymphonyTrackerIssue({
    state: "In Review",
    branchName: "symphony/COL-123",
    ...input.issueOverrides
  });
  const baseRuntimePolicy = buildSymphonyRuntimePolicy();
  const runtimePolicy: SymphonyResolvedRuntimePolicy = {
    ...baseRuntimePolicy,
    ...input.runtimePolicyOverrides,
    github: {
      ...baseRuntimePolicy.github,
      repo: "openai/symphony",
      webhookSecret: "secret",
      allowedReworkCommentLogins: ["reviewer"],
      ...input.runtimePolicyOverrides?.github
    }
  };
  const tracker = createMemorySymphonyTracker([issue]);
  const rawBody = JSON.stringify(buildSymphonyGitHubIssueCommentPayload());
  const signature = signSymphonyGitHubWebhook(
    rawBody,
    runtimePolicy.github.webhookSecret ?? "secret"
  );

  return {
    issue,
    runtimePolicy,
    tracker,
    firstRequest: {
      headers: buildSymphonyGitHubWebhookHeaders({
        xGitHubDelivery: "delivery-1",
        xGitHubEvent: "issue_comment",
        xHubSignature256: signature
      }),
      body: JSON.parse(rawBody) as SymphonyGitHubIssueCommentPayload,
      rawBody
    },
    duplicateRequest: {
      headers: buildSymphonyGitHubWebhookHeaders({
        xGitHubDelivery: "delivery-2",
        xGitHubEvent: "issue_comment",
        xHubSignature256: signature
      }),
      body: JSON.parse(rawBody) as SymphonyGitHubIssueCommentPayload,
      rawBody
    }
  };
}
