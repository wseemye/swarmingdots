// Draws the flag's dots: one instanced WebGL draw for all of them, each with its own colour, as
// rounded squares antialiased in the shader. Without WebGL (or once its context is lost) it falls
// back to Canvas 2D.

// Per dot: [x, y, w, h] in device pixels, [r, g, b] in 0..1, and a corner radius as a fraction of
// the dot's shorter side.
export const STRIDE = 8;

const VERTEX = `#version 300 es
in vec2 corner;
in vec4 rect;
in vec3 rgb;
in float roundness;
uniform vec2 size;
out vec2 local;
out vec2 extent;
out vec3 colour;
out float radius;
void main() {
  extent = rect.zw;
  local = corner * extent;
  colour = rgb;
  radius = roundness * min(rect.z, rect.w);
  vec2 p = rect.xy + local;
  gl_Position = vec4(p / size * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 local;
in vec2 extent;
in vec3 colour;
in float radius;
out vec4 outColor;
void main() {
  vec2 q = abs(local - extent * 0.5) - (extent * 0.5 - radius);
  float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
  float a = clamp(0.5 - dist / max(fwidth(dist), 1e-4), 0.0, 1.0);
  outColor = vec4(colour * a, a);
}`;

type Gl = { gl: WebGL2RenderingContext; buffer: WebGLBuffer; size: WebGLUniformLocation | null; capacity: number };

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
  return shader;
}

function setUp(canvas: HTMLCanvasElement): Gl | null {
  try {
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
    const attrib = (name: string, n: number, offset: number) => {
      const loc = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, STRIDE * 4, offset * 4);
      gl.vertexAttribDivisor(loc, 1);
    };
    attrib('rect', 4, 0);
    attrib('rgb', 3, 4);
    attrib('roundness', 1, 7);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return { gl, buffer, size: gl.getUniformLocation(program, 'size'), capacity: 0 };
  } catch {
    return null;
  }
}

export type DotPainter = (data: Float32Array, n: number) => void;

/** A painter for this canvas, whose backing store must already be sized in device pixels. */
export function painter(canvas: HTMLCanvasElement): DotPainter {
  const g = setUp(canvas);
  if (g) {
    let lost = false;
    canvas.addEventListener('webglcontextlost', () => {
      lost = true;
    });
    return (data, n) => {
      if (lost) return;
      const { gl } = g;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.buffer);
      if (g.capacity < n) {
        g.capacity = Math.max(n, g.capacity * 2, 1024);
        gl.bufferData(gl.ARRAY_BUFFER, g.capacity * STRIDE * 4, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * STRIDE);
      gl.uniform2f(g.size, canvas.width, canvas.height);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    };
  }

  const ctx = canvas.getContext('2d');
  return (data, n) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      const w = data[o + 2], h = data[o + 3];
      if (w <= 0 || h <= 0) continue;
      ctx.fillStyle = `rgb(${data[o + 4] * 255},${data[o + 5] * 255},${data[o + 6] * 255})`;
      ctx.beginPath();
      ctx.roundRect(data[o], data[o + 1], w, h, data[o + 7] * Math.min(w, h));
      ctx.fill();
    }
  };
}
