// Cubic ease-out: a typed character grows quickly, then settles.
export function easeOut(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, t), 3);
}
