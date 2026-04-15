import { describe, expect, it } from "vitest";
import {
  inferSymphonyTicketIntakeReasonFromMessage,
  readSymphonyTicketIntakeDisposition,
  renderSymphonyOperatorStateDirectiveComment
} from "./symphony-ticket-intake-contract.js";

describe("Symphony ticket intake contract", () => {
  it("maps intake decisions to the canonical workflow and tracker states", () => {
    expect(readSymphonyTicketIntakeDisposition("ready")).toEqual({
      decision: "ready",
      workflowLifecycleAction: "continue",
      trackerState: null,
      requeueToState: null
    });
    expect(readSymphonyTicketIntakeDisposition("needs_clarification")).toEqual({
      decision: "needs_clarification",
      workflowLifecycleAction: "awaiting_input",
      trackerState: "Paused",
      requeueToState: "Todo"
    });
    expect(readSymphonyTicketIntakeDisposition("invalid_directive")).toEqual({
      decision: "invalid_directive",
      workflowLifecycleAction: "failed",
      trackerState: "Failed",
      requeueToState: "Todo"
    });
  });

  it("infers structured reasons from known directive validation errors", () => {
    expect(
      inferSymphonyTicketIntakeReasonFromMessage(
        'Invalid max retry count "1.5". Expected a non-negative integer.'
      )
    ).toEqual({
      code: "invalid_max_retry_count",
      message: 'Invalid max retry count "1.5". Expected a non-negative integer.',
      severity: "error",
      field: "routingDirectives.maxRetryCount"
    });
  });

  it("renders paused and failed operator comments with explicit requeue guidance", () => {
    const comment = renderSymphonyOperatorStateDirectiveComment({
      title: "Symphony capability routing failed before execution.",
      state: "Failed",
      whatChanged:
        "Symphony stopped before starting implementation because the ticket body or routing directives could not be normalized into a valid execution contract.",
      reasons: [
        inferSymphonyTicketIntakeReasonFromMessage(
          'Invalid max retry count "1.5". Expected a non-negative integer.'
        )
      ],
      nextAction:
        "Update the ticket body or routing directives so Symphony can derive a valid execution contract.",
      requeueToState: "Todo"
    });

    expect(comment).toContain("State: `Failed`");
    expect(comment).toContain(
      'What changed: Symphony stopped before starting implementation because the ticket body or routing directives could not be normalized into a valid execution contract.'
    );
    expect(comment).toContain(
      '- Invalid max retry count "1.5". Expected a non-negative integer.'
    );
    expect(comment).toContain(
      "The issue is currently in `Failed`. After completing the next step, move it to `Todo` to requeue."
    );
  });
});
