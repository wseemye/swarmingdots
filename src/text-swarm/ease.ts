// Quintic ease-in-out: the dots leave quickly and settle slowly enough that the
// eye can read the silhouette they land on.
export function ease(t: number): number {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}
