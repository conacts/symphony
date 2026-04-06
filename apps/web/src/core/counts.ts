export function sortCounts(counts: Map<string, number>) {
  return Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return 0;
  });
}
