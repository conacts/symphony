export interface ReviewProvider<ReviewInput = unknown, Review = unknown> {
  resolve(input: ReviewInput): Promise<Review | null> | Review | null;
}
