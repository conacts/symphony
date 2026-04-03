import { describe, expect, it, vi } from "vitest";
import { createGitHubReviewPublisher } from "./review-publisher.js";

describe("review publisher", () => {
  it("wraps function publishers behind the review publisher contract", async () => {
    const publish = vi.fn(async (input: { findings: Array<unknown> }) => ({
      delivered: input.findings.length
    }));

    const publisher = createGitHubReviewPublisher(publish);
    const result = await publisher.publishReview({
      findings: [
        {
          title: "Request changes",
          body: "Add the missing guard."
        }
      ]
    });

    expect(result).toEqual({
      delivered: 1
    });
    expect(publish).toHaveBeenCalledWith({
      findings: [
        {
          title: "Request changes",
          body: "Add the missing guard."
        }
      ]
    });
  });

  it("accepts object-shaped publishers with publishReview", async () => {
    const publishReview = vi.fn(async () => ({
      delivered: true
    }));

    const publisher = createGitHubReviewPublisher({
      publishReview
    });

    await expect(
      publisher.publishReview({
        findings: []
      })
    ).resolves.toEqual({
      delivered: true
    });
    expect(publishReview).toHaveBeenCalledTimes(1);
  });
});
