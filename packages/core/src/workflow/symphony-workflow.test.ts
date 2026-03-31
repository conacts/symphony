import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultSymphonyPromptTemplate,
  parseSymphonyWorkflow,
  SymphonyWorkflowError
} from "./symphony-workflow.js";

describe("symphony workflow", () => {
  it("parses front matter, resolves env indirection, and applies defaults", () => {
    const workflow = parseSymphonyWorkflow(
      `---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  team_key: COL
  claim_transition_to_state: In Progress
  claim_transition_from_states:
    - Todo
    - Rework
polling:
  interval_ms: 5000
workspace:
  root: $SYMPHONY_ROOT
github:
  allowed_review_logins:
    - conor
---
Prompt body
`,
      {
        env: {
          LINEAR_API_KEY: "token",
          SYMPHONY_ROOT: "/tmp/symphony"
        }
      }
    );

    expect(workflow.prompt).toBe("Prompt body");
    expect(workflow.config.tracker.apiKey).toBe("token");
    expect(workflow.config.tracker.teamKey).toBe("COL");
    expect(workflow.config.polling.intervalMs).toBe(5_000);
    expect(workflow.config.workspace.root).toBe("/tmp/symphony");
    expect(workflow.config.github.allowedReviewLogins).toEqual(["conor"]);
  });

  it("accepts prompt-only files and falls back to the default prompt template", () => {
    const workflow = parseSymphonyWorkflow("Prompt only");

    expect(workflow.rawConfig).toEqual({});
    expect(workflow.prompt).toBe("Prompt only");
    expect(workflow.promptTemplate).toBe("Prompt only");

    const emptyPromptWorkflow = parseSymphonyWorkflow(`---
tracker:
  kind: memory
---
`);

    expect(emptyPromptWorkflow.promptTemplate).toBe(defaultSymphonyPromptTemplate);
  });

  it("accepts unterminated front matter with an empty prompt", () => {
    const workflow = parseSymphonyWorkflow(`---
tracker:
  kind: memory
`);

    expect(workflow.prompt).toBe("");
    expect(workflow.config.tracker.kind).toBe("memory");
  });

  it("rejects invalid workflow shapes and semantic conflicts", () => {
    expect(() =>
      parseSymphonyWorkflow(`---
- not-a-map
---
Prompt body
`)
    ).toThrowError(SymphonyWorkflowError);

    expect(() =>
      parseSymphonyWorkflow(`---
tracker:
  kind: linear
  api_key: token
---
`)
    ).toThrowError(/requires tracker.projectSlug or tracker.teamKey/i);

    expect(() =>
      parseSymphonyWorkflow(`---
tracker:
  kind: linear
  api_key: token
  project_slug: coldets
  team_key: COL
---
`)
    ).toThrowError(/either tracker.projectSlug or tracker.teamKey/i);

    expect(() =>
      parseSymphonyWorkflow(`---
tracker:
  kind: linear
  api_key: token
  project_slug: coldets
  excluded_project_ids:
    - project-1
---
`)
    ).toThrowError(/excludedProjectIds requires tracker.teamKey/i);

    expect(() =>
      parseSymphonyWorkflow(`---
tracker:
  kind: linear
  api_key: token
  project_slug: coldets
  claim_transition_from_states:
    - Todo
---
`)
    ).toThrowError(/claimTransitionToState is required/i);

    expect(() =>
      parseSymphonyWorkflow(`---
tracker:
  kind: linear
  api_key: token
  project_slug: coldets
  startup_failure_transition_to_state: Todo
---
`)
    ).toThrowError(/must not be one of tracker.dispatchableStates/i);
  });

  it("preserves the workflow source path when provided", () => {
    const workflow = parseSymphonyWorkflow(
      `---
tracker:
  kind: memory
---
Prompt
`,
      {
        sourcePath: path.join("/tmp", "WORKFLOW.md")
      }
    );

    expect(workflow.sourcePath).toBe("/tmp/WORKFLOW.md");
  });
});
