/**
 * The mark: a small solid globe beside the name (Mark.tsx), the intro's globe in miniature: the
 * same five bands cut by blank gaps along the same waves, wrapped around a sphere.
 */
/** The spin axis leans this far (radians) from upright, as the big globe's does. */
export const TILT = 0.35;

export type Vec3 = [number, number, number];
/** A rotation, row-major: view = M · body. */
export type Mat3 = number[];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** The rotation by `a` radians about the unit axis `k` (Rodrigues). */
export function rotation([kx, ky, kz]: Vec3, a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = 1 - c;
  return [
    c + kx * kx * t, kx * ky * t - kz * s, kx * kz * t + ky * s,
    ky * kx * t + kz * s, c + ky * ky * t, ky * kz * t - kx * s,
    kz * kx * t - ky * s, kz * ky * t + kx * s, c + kz * kz * t,
  ];
}

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  }
  return out;
}

/** The point on the globe's own surface under the view direction `v` (M is a rotation, so its inverse is its transpose). */
export function toBody(m: Mat3, [x, y, z]: Vec3): Vec3 {
  return [m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z];
}

/** Whether a point on the globe's own surface (unit vector, y down) is in one of its blank gaps: the big globe's own bands (DotText.tsx). */
export function inGap([x, y, z]: Vec3): boolean {
  const f = -y + 0.32 * Math.sin(2.6 * x + 1.7 * z + 0.6) + 0.12 * x;
  const level = (1.25 - f) / 0.5;
  return level > 1 && level < 5 && level - Math.floor(level) < 0.16;
}
