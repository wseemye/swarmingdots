import type { Shape } from './variants';

// Draws every pixel of the text with WebGL: the shape on screen is turned
// into a small triangle fan once a frame, and one instanced draw call stamps
// it at every pixel, with multisampled edges, so touching pixels meet without
// seams. All instances share one hidden WebGL canvas (browsers allow only a
// few contexts per page); the result is copied into the component's own
// canvas, so nothing about the page changes. Without WebGL 2, or once its
// context is lost, glPixels returns false and the caller draws with Canvas 2D.

// Points each quadratic side is flattened into.
const STEPS = 6;
const FAN = 8 * STEPS;

const VERTEX = `#version 300 es
in vec2 point;
in vec2 offset;
in float scale;
uniform float cell;
uniform vec2 origin;
uniform float dpr;
uniform vec2 size;
void main() {
  // Growing pixels (typed a moment ago) are smaller about their cell's middle.
  vec2 local = 0.5 + (point - 0.5) * scale;
  vec2 p = (offset + local * cell - origin) * dpr;
  gl_Position = vec4(p / size * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec4 color;
out vec4 outColor;
void main() {
  outColor = vec4(color.rgb * color.a, color.a);
}`;

type Renderer = {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  u: Record<'cell' | 'origin' | 'dpr' | 'size' | 'color', WebGLUniformLocation | null>;
  fan: WebGLBuffer;
  offsets: WebGLBuffer;
  scales: WebGLBuffer;
  scaleAttr: number;
  // The pixel positions last uploaded, so a still scene is not sent again every frame.
  uploaded: Float32Array | null;
};

let renderer: Renderer | null | undefined;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
  return shader;
}

function create(): Renderer | null {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true, alpha: true });
    if (!gl) return null;
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);

    const attribute = (name: string, buffer: WebGLBuffer, size: number, divisor: number) => {
      const at = gl.getAttribLocation(program, name);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, size, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(at, divisor);
      return at;
    };
    const fan = gl.createBuffer()!;
    const offsets = gl.createBuffer()!;
    const scales = gl.createBuffer()!;
    attribute('point', fan, 2, 0);
    attribute('offset', offsets, 2, 1);
    const scaleAttr = attribute('scale', scales, 1, 1);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const r: Renderer = {
      canvas,
      gl,
      u: { cell: uniform('cell'), origin: uniform('origin'), dpr: uniform('dpr'), size: uniform('size'), color: uniform('color') },
      fan,
      offsets,
      scales,
      scaleAttr,
      uploaded: null,
    };
    canvas.addEventListener('webglcontextlost', () => {
      renderer = null;
    });
    return r;
  } catch {
    return null;
  }
}

// CSS colour -> [r, g, b, a] in 0..1, read back from a 1px canvas once per colour.
const colours = new Map<string, [number, number, number, number]>();
let probe: CanvasRenderingContext2D | null = null;
function rgba(color: string): [number, number, number, number] {
  const hit = colours.get(color);
  if (hit) return hit;
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  let out: [number, number, number, number] = [0, 0, 0, 1];
  if (probe) {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = color;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
    out = [r / 255, g / 255, b / 255, a / 255];
  }
  colours.set(color, out);
  return out;
}

// The shape as triangles from its middle: every shape here (and every step of
// a morph between them) can be seen whole from the middle of its points.
const fanData = new Float32Array(FAN * 3 * 2);
function triangulate(s: Shape): Float32Array {
  const ring = new Float32Array(FAN * 2);
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < 8; k++) {
    cx += s[k * 4] / 8;
    cy += s[k * 4 + 1] / 8;
  }
  for (let k = 0; k < 8; k++) {
    const i = k * 4;
    const n = (i + 4) % 32;
    for (let j = 0; j < STEPS; j++) {
      const t = j / STEPS;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      ring[(k * STEPS + j) * 2] = a * s[i] + b * s[i + 2] + c * s[n];
      ring[(k * STEPS + j) * 2 + 1] = a * s[i + 1] + b * s[i + 3] + c * s[n + 1];
    }
  }
  for (let p = 0; p < FAN; p++) {
    const q = (p + 1) % FAN;
    fanData.set([cx, cy, ring[p * 2], ring[p * 2 + 1], ring[q * 2], ring[q * 2 + 1]], p * 6);
  }
  return fanData;
}

export type GlScene = {
  /** Every pixel's top-left corner, in CSS px from the block's top-left. */
  pixels: Float32Array;
  /** Each pixel's size (1 = full), or null for all full size. */
  scales: Float32Array | null;
  /** One cell in CSS px. */
  cell: number;
  shape: Shape;
  color: string;
  /** The block point at the canvas's top-left, and device pixels per CSS px. */
  left: number;
  top: number;
  dpr: number;
};

/**
 * Draws the scene into `target` (cleared first), whose backing store is
 * bw x bh device pixels. Returns false if WebGL is not available, so the
 * caller can draw it another way.
 */
export function glPixels(target: CanvasRenderingContext2D, bw: number, bh: number, scene: GlScene): boolean {
  if (renderer === undefined) renderer = create();
  const r = renderer;
  if (!r || r.gl.isContextLost()) return false;
  const { gl, canvas, u } = r;
  const n = scene.pixels.length / 2;

  // The shared canvas only ever grows, so canvases of different sizes do not keep reallocating it.
  if (canvas.width < bw || canvas.height < bh) {
    canvas.width = Math.max(canvas.width, bw);
    canvas.height = Math.max(canvas.height, bh);
  }
  // Draw into its top-left bw x bh corner (WebGL counts y from the bottom).
  gl.viewport(0, canvas.height - bh, bw, bh);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(0, canvas.height - bh, bw, bh);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.bindBuffer(gl.ARRAY_BUFFER, r.fan);
  gl.bufferData(gl.ARRAY_BUFFER, triangulate(scene.shape), gl.DYNAMIC_DRAW);
  if (r.uploaded !== scene.pixels) {
    gl.bindBuffer(gl.ARRAY_BUFFER, r.offsets);
    gl.bufferData(gl.ARRAY_BUFFER, scene.pixels, gl.DYNAMIC_DRAW);
    r.uploaded = scene.pixels;
  }
  if (scene.scales) {
    gl.enableVertexAttribArray(r.scaleAttr);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.scales);
    gl.bufferData(gl.ARRAY_BUFFER, scene.scales, gl.DYNAMIC_DRAW);
  } else {
    // Every pixel full size: one constant value instead of a buffer.
    gl.disableVertexAttribArray(r.scaleAttr);
    gl.vertexAttrib1f(r.scaleAttr, 1);
  }

  gl.uniform1f(u.cell, scene.cell);
  gl.uniform2f(u.origin, scene.left, scene.top);
  gl.uniform1f(u.dpr, scene.dpr);
  gl.uniform2f(u.size, bw, bh);
  gl.uniform4f(u.color, ...rgba(scene.color));
  gl.drawArraysInstanced(gl.TRIANGLES, 0, FAN * 3, n);

  target.setTransform(1, 0, 0, 1, 0, 0);
  target.clearRect(0, 0, bw, bh);
  target.drawImage(canvas, 0, 0, bw, bh, 0, 0, bw, bh);
  return true;
}
