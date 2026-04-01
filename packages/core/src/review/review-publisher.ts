export interface ReviewPublisher<Review = unknown, ReviewResult = unknown> {
  publish(review: Review): Promise<ReviewResult>;
}

export type ReviewPublisherFactoryInput<Review, ReviewResult> =
  | ReviewPublisher<Review, ReviewResult>
  | ((review: Review) => Promise<ReviewResult> | ReviewResult);

export function createGitHubReviewPublisher<Review, ReviewResult>(
  input: ReviewPublisherFactoryInput<Review, ReviewResult>
): ReviewPublisher<Review, ReviewResult> {
  const publish =
    typeof input === "function" ? input : (review: Review) => input.publish(review);

  return {
    async publish(review) {
      return await publish(review);
    }
  };
}
