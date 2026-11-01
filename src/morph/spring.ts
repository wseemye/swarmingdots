// A critically damped spring: the fastest motion toward a target that never
// overshoots it, and that keeps its speed when the target moves mid-flight.

/**
 * Moves every value in `now` toward the same index in `to` for `dt` ms,
 * updating `velocity` (per ms) as it goes. `omega` is the spring's angular
 * frequency per ms. Long steps are taken in pieces of at most 32ms, so the
 * motion is the same however the frames fall.
 */
export function springStep(now: Float32Array, velocity: Float32Array, to: Float32Array, omega: number, dt: number) {
  while (dt > 0) {
    const h = Math.min(dt, 32);
    dt -= h;
    const decay = Math.exp(-omega * h);
    for (let i = 0; i < now.length; i++) {
      // The exact critically damped solution over h, for offset y and speed v.
      const y = now[i] - to[i];
      const v = velocity[i];
      const c = v + omega * y;
      now[i] = to[i] + (y + c * h) * decay;
      velocity[i] = (v - omega * c * h) * decay;
    }
  }
}

/** Whether the spring has come to rest: every value within a hair of its target, and barely moving. */
export function atRest(now: Float32Array, velocity: Float32Array, to: Float32Array): boolean {
  for (let i = 0; i < now.length; i++) {
    if (Math.abs(now[i] - to[i]) > 1e-4 || Math.abs(velocity[i]) > 1e-6) return false;
  }
  return true;
}
