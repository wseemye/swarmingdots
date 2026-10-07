// Quintic ease-in-out: the dots leave quickly and settle slowly enough that the
// eye can read the silhouette they land on.
export function ease(t: number): number {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

export function traceDot(ctx: CanvasRenderingContext2D, size: number, r: number) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(0, 0, size, size, r);
    return;
  }
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
}
