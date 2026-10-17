// Draws a word's dots with WebGL: one instanced draw call however many dots,
// with the round dots' edges antialiased in the shader. Every word shares one
// hidden WebGL canvas (browsers allow only a few contexts per page); each
// word's dots are drawn there and copied straight into the word's own canvas,
// so the layout and the real text are untouched. Without WebGL, or once its
// context is lost, glDots returns false and the caller draws with Canvas 2D.

// Per dot: x, y (cells) and 1 if it is at rest (the variant's own pixel) or 0
// if it is in flight (a plain square: in motion its shape cannot be seen).
const VERTEX = `#version 300 es
in vec2 corner;
in vec3 dot;
uniform vec4 box;
uniform float radius;
uniform float cell;
uniform vec2 size;
out vec2 local;
out vec2 extent;
out float round_;
void main() {
  vec4 b = dot.z > 0.5 ? box : vec4(0.0, 0.0, 1.0, 1.0);
  round_ = dot.z > 0.5 ? radius : 0.0;
  extent = b.zw * cell;
  local = corner * extent;
  vec2 p = (dot.xy + b.xy + corner * b.zw) * cell;
  gl_Position = vec4(p / size * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 local;
in vec2 extent;
in float round_;
uniform vec4 color;
uniform float cell;
uniform float opaque;
out vec4 outColor;
void main() {
  float a = 1.0;
  if (round_ > 0.0) {
    // Signed distance to the rounded rectangle, antialiased over one device pixel.
    float r = round_ * cell;
    vec2 q = abs(local - extent * 0.5) - (extent * 0.5 - r);
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    a = clamp(0.5 - dist / max(fwidth(dist), 1e-4), 0.0, 1.0);
  }
  outColor = opaque > 0.5 ? vec4(color.rgb, a) : vec4(color.rgb * color.a * a, color.a * a);
}`;

type Renderer = {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  uniforms: Record<'box' | 'radius' | 'cell' | 'size' | 'color' | 'opaque', WebGLUniformLocation | null>;
  buffer: WebGLBuffer;
  capacity: number;
  data: Float32Array;
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

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, 'corner');
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const dot = gl.getAttribLocation(program, 'dot');
    gl.enableVertexAttribArray(dot);
    gl.vertexAttribPointer(dot, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(dot, 1);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const r: Renderer = {
      canvas,
      gl,
      uniforms: { box: uniform('box'), radius: uniform('radius'), cell: uniform('cell'), size: uniform('size'), color: uniform('color'), opaque: uniform('opaque') },
      buffer,
      capacity: 0,
      data: new Float32Array(0),
    };
    canvas.addEventListener('webglcontextlost', () => {
      renderer = null;
    });
    return r;
  } catch {
    return null;
  }
}

// CSS colour -> premultiplied-ready [r, g, b, a] in 0..1, read back from a 1px canvas once per colour.
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

export type GlDots = {
  /** How many dots, and their [x, y, atRest] in cells. */
  n: number;
  dots: Float32Array;
  /** The variant's pixel: [left, top, width, height, radius] in fractions of a cell. */
  box: readonly [number, number, number, number, number];
  /** One cell in device pixels. */
  cell: number;
  color: string;
};

/**
 * Draws the dots into `target` (cleared first), whose backing store is
 * bw x bh device pixels. Returns false if WebGL is not available, so the
 * caller can draw them another way.
 */
export function glDots(target: CanvasRenderingContext2D, bw: number, bh: number, { n, dots, box, cell, color }: GlDots): boolean {
  if (renderer === undefined) renderer = create();
  const r = renderer;
  if (!r || r.gl.isContextLost()) return false;
  const { gl, canvas, uniforms: u } = r;

  // The shared canvas only ever grows, so words of different sizes do not keep reallocating it.
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

  gl.bindBuffer(gl.ARRAY_BUFFER, r.buffer);
  if (r.capacity < n) {
    r.capacity = Math.max(n, r.capacity * 2, 256);
    gl.bufferData(gl.ARRAY_BUFFER, r.capacity * 3 * 4, gl.DYNAMIC_DRAW);
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, dots, 0, n * 3);

  gl.uniform4f(u.box, box[0], box[1], box[2], box[3]);
  gl.uniform1f(u.radius, box[4]);
  gl.uniform1f(u.cell, cell);
  gl.uniform2f(u.size, bw, bh);
  const c = rgba(color);
  gl.uniform4f(u.color, ...c);
  // An opaque colour lets the multisampled edges decide coverage on their own
  // (alpha to coverage): dots that touch then meet without a lighter seam,
  // as they do in one Canvas 2D path. A see-through colour has to blend.
  const opaque = c[3] >= 1;
  if (opaque) {
    gl.disable(gl.BLEND);
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  } else {
    gl.enable(gl.BLEND);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  }
  gl.uniform1f(u.opaque, opaque ? 1 : 0);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);

  target.setTransform(1, 0, 0, 1, 0, 0);
  target.clearRect(0, 0, bw, bh);
  target.drawImage(canvas, 0, 0, bw, bh, 0, 0, bw, bh);
  return true;
}
