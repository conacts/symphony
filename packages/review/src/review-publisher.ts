import type { ReviewResult } from "./review-provider.js";

export type PublishReviewInput<Input extends ReviewResult = ReviewResult> = Input;
export type PublishReviewResult<Result = unknown> = Result;

export interface ReviewPublisher<
  Input extends ReviewResult = PublishReviewInput,
  Result = PublishReviewResult
> {
  publishReview(input: Input): Promise<Result>;
}

export type ReviewPublisherFactoryInput<Input extends ReviewResult, Result> =
  | ReviewPublisher<Input, Result>
  | {
      publish(input: Input): Promise<Result> | Result;
    }
  | ((input: Input) => Promise<Result> | Result);

export function createGitHubReviewPublisher<Input extends ReviewResult, Result>(
  input: ReviewPublisherFactoryInput<Input, Result>
): ReviewPublisher<Input, Result> {
  const publishReview =
    typeof input === "function"
      ? input
      : "publishReview" in input
        ? (review: Input) => input.publishReview(review)
        : (review: Input) => input.publish(review);

  return {
    async publishReview(review) {
      return await publishReview(review);
    }
  };
}
