export { ease } from './text-swarm/ease';

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
