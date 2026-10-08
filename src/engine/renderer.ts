// WebGL2 renderer: procedural terrain shader, instanced sprite batches, shadow + light buffers.
import { Atlas, Sprite } from './atlas';
import { makeNoiseTexture } from './noise';

const SPRITE_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_rect;
layout(location=2) in vec4 a_uv;
layout(location=3) in vec4 a_color;
layout(location=4) in vec2 a_rl;
uniform vec2 u_cam; uniform vec2 u_scale;
out vec2 v_uv; out vec4 v_color; flat out float v_layer;
void main(){
  vec2 p = a_corner * a_rect.zw;
  float c = cos(a_rl.x), s = sin(a_rl.x);
  p = vec2(p.x*c - p.y*s, p.x*s + p.y*c);
  vec2 w = a_rect.xy + p;
  vec2 ndc = (w - u_cam) * u_scale; ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_uv = mix(a_uv.xy, a_uv.zw, a_corner + 0.5);
  v_color = a_color; v_layer = a_rl.y;
}`;
const SPRITE_FS = `#version 300 es
precision mediump float;
precision mediump sampler2DArray;
uniform sampler2DArray u_tex;
uniform float u_mode; // 0 normal, 1 shadow (alpha only), 2 ghost
in vec2 v_uv; in vec4 v_color; flat in float v_layer;
out vec4 o;
void main(){
  vec4 t = texture(u_tex, vec3(v_uv, v_layer));
  if (u_mode == 1.0) { o = vec4(t.a * v_color.a); return; }
  o = t * v_color;
}`;

const FS_QUAD_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
uniform vec2 u_cam; uniform vec2 u_half; // half view in world units
out vec2 v_world; out vec2 v_uv;
void main(){
  vec2 c = a_corner * 2.0;
  gl_Position = vec4(c, 0.0, 1.0);
  v_uv = a_corner + 0.5;
  v_world = u_cam + vec2(c.x, -c.y) * u_half;
}`;

const TERRAIN_FS = `#version 300 es
precision highp float;
precision highp usampler2D;
uniform usampler2D u_tiles;
uniform sampler2D u_noise;
uniform vec2 u_origin;
uniform vec2 u_tsize;
uniform float u_time;
uniform float u_pxPerTile;
uniform vec3 u_pal[48];
uniform vec3 u_pal2[48];
uniform vec2 u_style[48];
in vec2 v_world;
out vec4 o;

uint tileAt(vec2 p) {
  ivec2 t = ivec2(floor(p - u_origin));
  if (t.x < 0 || t.y < 0 || t.x >= int(u_tsize.x) || t.y >= int(u_tsize.y)) return 0u;
  return texelFetch(u_tiles, t, 0).r;
}
bool isWater(uint t) { return t >= 20u && t <= 25u; }
bool isPlayer(uint t) { return t >= 30u; }
float N(vec2 p, int c) { vec4 v = texture(u_noise, p); return c==0?v.r:c==1?v.g:c==2?v.b:v.a; }
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }

vec3 natural(uint t, vec2 p) {
  vec3 a = u_pal[t], b = u_pal2[t];
  vec2 st = u_style[t];
  float n1 = N(p*0.011, 0);
  float n2 = N(p*0.045, 1);
  float n3 = N(p*0.19, 2);
  float n4 = N(p*0.83, 3);
  float n5 = N(p*2.9, 2);
  float m = smoothstep(0.2, 0.8, n1*0.55 + n2*0.45);
  vec3 c = mix(a, b, m);
  c *= (1.0 - st.x*0.5) + st.x*n3;
  c *= 0.9 + 0.2*n4;
  c *= (1.0 - st.y*0.5) + st.y*n5;
  return c;
}

vec3 waterColor(uint t, vec2 p, float shore) {
  vec3 deep = u_pal[t];
  vec3 sh = u_pal2[t];
  float w1 = N(p*0.09 + vec2(u_time*0.004, u_time*0.0025), 1);
  float w2 = N(p*0.23 - vec2(u_time*0.006, -u_time*0.004), 2);
  float w3 = N(p*0.6 + vec2(u_time*0.01, u_time*0.007), 3);
  vec3 c = mix(sh, deep, smoothstep(0.0, 1.3, shore));
  c *= 0.88 + 0.18*w1 + 0.1*(w2-0.5);
  float spark = smoothstep(0.78, 0.9, w3*0.6 + w2*0.4);
  c += vec3(0.05, 0.07, 0.08) * spark;
  // foam line near shore
  float foam = (1.0 - smoothstep(0.0, 0.12, shore)) * (0.5 + 0.5*w2);
  c = mix(c, vec3(0.45,0.5,0.45), foam*0.35);
  return c;
}

vec3 playerTile(uint t, vec2 p) {
  vec2 f = fract(p);
  vec2 cell = floor(p);
  float n3 = N(p*0.37, 2), n4 = N(p*1.7, 3);
  if (t == 30u) { // landfill
    return u_pal[t] * (0.85 + 0.2*n3) * (0.9 + 0.2*n4);
  }
  if (t == 31u) { // stone path: irregular bricks
    vec2 q = p * vec2(2.0, 3.0);
    float row = floor(q.y);
    q.x += h21(vec2(row, 3.1)) * 1.0 + row*0.5;
    vec2 b = floor(q); vec2 bf = fract(q);
    float hv = h21(b);
    vec3 c = mix(u_pal[t], u_pal2[t], hv);
    float edge = min(min(bf.x, 1.0-bf.x)*0.5, min(bf.y, 1.0-bf.y)*0.33);
    float mortar = smoothstep(0.0, 0.035, edge);
    c *= 0.8 + 0.3*n4;
    c = mix(u_pal[t]*0.45, c, mortar);
    return c;
  }
  bool hazard = (t == 33u || t == 34u || t == 36u || t == 37u);
  bool refined = (t >= 35u && t <= 37u);
  vec3 base = refined ? vec3(0.36,0.36,0.35) : vec3(0.47,0.46,0.43);
  vec3 c = base * (0.9 + 0.15*n3) * (0.93 + 0.12*n4);
  if (hazard) {
    float dir = (t == 33u || t == 36u) ? 1.0 : -1.0;
    float s = fract((p.x*dir + p.y) * 1.0);
    vec3 y = vec3(0.75, 0.6, 0.12) * (0.9 + 0.15*n4);
    c = s < 0.5 ? y : vec3(0.12,0.12,0.11)*(0.9+0.2*n4);
  }
  // slab seams
  vec2 slab = refined ? fract(p*0.5) : fract(p*0.5);
  float e = min(min(slab.x, 1.0-slab.x), min(slab.y, 1.0-slab.y));
  float seam = smoothstep(0.0, 0.02, e);
  c *= 0.72 + 0.28*seam;
  // small pits
  float pit = step(0.93, h21(floor(p*8.0)));
  c *= 1.0 - pit*0.15;
  return c;
}

void main() {
  vec2 p = v_world;
  uint t0 = tileAt(p);
  if (t0 == 0u) { o = vec4(0.0,0.0,0.0,1.0); return; }
  if (isPlayer(t0)) { o = vec4(playerTile(t0, p), 1.0); return; }
  // large-scale wobble of boundaries
  vec2 warp = (vec2(N(p*0.045, 0), N(p*0.045+0.37, 1)) - 0.5) * 0.9;
  vec2 q = p + warp - 0.5;
  vec2 ci = floor(q); vec2 f = fract(q);
  // cubic B-spline weights over a 4x4 tile neighbourhood: removes tile-grid staircase artifacts
  vec4 wx, wy;
  { vec2 f2 = f*f, f3 = f2*f, g = 1.0 - f;
    vec2 a0 = g*g*g/6.0, a1 = (3.0*f3 - 6.0*f2 + 4.0)/6.0, a2 = (-3.0*f3 + 3.0*f2 + 3.0*f + 1.0)/6.0, a3 = f3/6.0;
    wx = vec4(a0.x, a1.x, a2.x, a3.x); wy = vec4(a0.y, a1.y, a2.y, a3.y); }
  uint ut[6]; float uw[6]; int nu = 0;
  float waterW = 0.0, landW = 0.0;
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    uint t = tileAt(ci + vec2(float(i) - 0.5, float(j) - 0.5));
    if (isPlayer(t) || t == 0u) t = t0;
    float w = wx[i] * wy[j];
    if (isWater(t)) waterW += w; else landW += w;
    bool found = false;
    for (int u = 0; u < 6; u++) { if (u >= nu) break; if (ut[u] == t) { uw[u] += w; found = true; break; } }
    if (!found && nu < 6) { ut[nu] = t; uw[nu] = w; nu++; }
  }
  float nA = (N(p*0.55, 1) - 0.5) * 0.55 + (N(p*1.9, 2) - 0.5) * 0.22 + (N(p*5.3, 3) - 0.5) * 0.08;
  uint best = ut[0]; float bw = -9.0; float second = -9.0; uint rt = ut[0];
  for (int u = 0; u < 6; u++) {
    if (u >= nu) break;
    uint t = ut[u];
    float ft = float(t);
    float jitter = (N(p * 0.42 + vec2(ft * 0.137, ft * 0.291), 1) - 0.5) * 0.55 + (N(p * 1.6 + vec2(ft * 0.53, ft * 0.17), 2) - 0.5) * 0.22 + (N(p * 4.1 + ft * 0.31, 3) - 0.5) * 0.07;
    float wn = uw[u] + jitter;
    if (isWater(t)) wn -= 0.04;
    if (wn > bw) { second = bw; rt = best; bw = wn; best = t; } else if (wn > second) { second = wn; rt = t; }
  }
  vec3 col;
  if (isWater(best)) {
    // shoreline distance approximation from blend weights
    float shore = clamp((waterW - landW) * 1.6 + 0.15 + nA * 0.3, 0.0, 1.4);
    if (landW < 0.001) {
      // deep inside water: distance to nearest land tile
      vec2 cell = floor(p); vec2 fr = p - cell; float d = 2.0;
      for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
        if (dx == 0 && dy == 0) continue;
        uint nt = tileAt(cell + vec2(float(dx), float(dy)) + 0.5);
        if (!isWater(nt)) {
          vec2 qq = vec2(dx == 0 ? 0.0 : (dx < 0 ? fr.x : 1.0 - fr.x), dy == 0 ? 0.0 : (dy < 0 ? fr.y : 1.0 - fr.y));
          d = min(d, (dx != 0 && dy != 0) ? length(qq) : max(qq.x, qq.y));
        }
      }
      shore = clamp(0.45 + d, 0.0, 1.4);
    }
    col = waterColor(best, p, shore);
  } else {
    // soft cross-fade between the two strongest land types
    vec3 cb = natural(best, p);
    col = cb;
    float edge = clamp((bw - second) * 3.0, 0.0, 1.0);
    if (edge < 1.0 && rt != best && !isWater(rt)) col = mix(natural(rt, p), cb, 0.5 + 0.5 * edge);
    // wet, darker ground near water
    if (waterW > 0.0) col *= 1.0 - smoothstep(0.0, 0.5, waterW) * 0.3;
  }
  o = vec4(col, 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_src;
uniform float u_mode; // 0 shadow, 1 light multiply
uniform float u_strength;
in vec2 v_uv; in vec2 v_world;
out vec4 o;
void main(){
  vec4 s = texture(u_src, v_uv);
  if (u_mode == 0.0) { o = vec4(0.0, 0.0, 0.0, s.a * u_strength); }
  else { o = vec4(s.rgb, 1.0); }
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader error: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link error: ' + gl.getProgramInfoLog(p));
  return p;
}

const FLOATS = 11; // per instance: rect4 uv4 color(1 as u32) rot1 layer1

export class Batch {
  data: Float32Array;
  u32: Uint32Array;
  n = 0;
  keys: Float32Array | null;
  constructor(cap: number, sortable = false) {
    this.data = new Float32Array(cap * FLOATS);
    this.u32 = new Uint32Array(this.data.buffer);
    this.keys = sortable ? new Float32Array(cap) : null;
  }
  grow() {
    const nd = new Float32Array(this.data.length * 2);
    nd.set(this.data); this.data = nd; this.u32 = new Uint32Array(nd.buffer);
    if (this.keys) { const nk = new Float32Array(this.keys.length * 2); nk.set(this.keys); this.keys = nk; }
  }
  push(s: Sprite, x: number, y: number, w: number, h: number, rot: number, color: number, key = 0) {
    if ((this.n + 1) * FLOATS > this.data.length) this.grow();
    const o = this.n * FLOATS, d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = w; d[o + 3] = h;
    d[o + 4] = s.u0; d[o + 5] = s.v0; d[o + 6] = s.u1; d[o + 7] = s.v1;
    this.u32[o + 8] = color;
    d[o + 9] = rot; d[o + 10] = s.layer;
    if (this.keys) this.keys[this.n] = key;
    this.n++;
  }
  sorted(tmp: Float32Array): Float32Array {
    const n = this.n;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    const k = this.keys!;
    idx.sort((a, b) => k[a] - k[b]);
    for (let i = 0; i < n; i++) tmp.set(this.data.subarray(idx[i] * FLOATS, idx[i] * FLOATS + FLOATS), i * FLOATS);
    return tmp;
  }
}

// RGBA (0..1) -> packed u32 (little endian ABGR)
export function rgba(r: number, g: number, b: number, a = 1): number {
  // premultiplied
  const R = Math.max(0, Math.min(255, Math.round(r * a * 255)));
  const G = Math.max(0, Math.min(255, Math.round(g * a * 255)));
  const B = Math.max(0, Math.min(255, Math.round(b * a * 255)));
  const A = Math.max(0, Math.min(255, Math.round(a * 255)));
  return ((A << 24) | (B << 16) | (G << 8) | R) >>> 0;
}
// Additive color (alpha 0 in premultiplied space = pure add)
export function additive(r: number, g: number, b: number, k = 1): number {
  const R = Math.max(0, Math.min(255, Math.round(r * k * 255)));
  const G = Math.max(0, Math.min(255, Math.round(g * k * 255)));
  const B = Math.max(0, Math.min(255, Math.round(b * k * 255)));
  return ((B << 16) | (G << 8) | R) >>> 0;
}
export const WHITE = rgba(1, 1, 1, 1);

export type BatchName = 'ground' | 'ground2' | 'beltItems' | 'shadow' | 'objects' | 'high' | 'air' | 'airShadow' | 'wires' | 'overlay' | 'light' | 'top';

export class Renderer {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  atlas = new Atlas();
  spriteProg!: WebGLProgram; terrainProg!: WebGLProgram; compProg!: WebGLProgram;
  quadVBO!: WebGLBuffer; instVBO!: WebGLBuffer; vao!: WebGLVertexArrayObject; fsVao!: WebGLVertexArrayObject;
  noiseTex!: WebGLTexture; tileTex!: WebGLTexture;
  tileData: Uint8Array; tileW = 256; tileH = 256; tileOX = 0; tileOY = 0; tilesDirty = true;
  shadowFB!: WebGLFramebuffer; shadowTex!: WebGLTexture;
  lightFB!: WebGLFramebuffer; lightTex!: WebGLTexture;
  fbW = 0; fbH = 0;
  camX = 0; camY = 0; zoom = 64; // device px per tile
  vw = 1; vh = 1; dpr = 1;
  batches: Record<BatchName, Batch>;
  tmp = new Float32Array(1024 * FLOATS);
  time = 0;
  darkness = 0; ambient: [number, number, number] = [1, 1, 1];
  palette = new Float32Array(48 * 3); palette2 = new Float32Array(48 * 3); style = new Float32Array(48 * 2);
  redirect: BatchName | null = null; tint = 0;
  uniforms: Record<string, WebGLUniformLocation> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.tileData = new Uint8Array(this.tileW * this.tileH);
    this.batches = {
      ground: new Batch(8192), ground2: new Batch(8192), beltItems: new Batch(8192), shadow: new Batch(8192), objects: new Batch(16384, true),
      high: new Batch(4096, true), air: new Batch(2048, true), airShadow: new Batch(1024), wires: new Batch(4096), overlay: new Batch(4096), light: new Batch(2048), top: new Batch(1024),
    };
    this.init();
  }

  init() {
    const gl = this.gl;
    this.spriteProg = compile(gl, SPRITE_VS, SPRITE_FS);
    this.terrainProg = compile(gl, FS_QUAD_VS, TERRAIN_FS);
    this.compProg = compile(gl, FS_QUAD_VS, COMPOSITE_FS);
    this.quadVBO = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    // sprite VAO
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.instVBO = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVBO);
    const stride = FLOATS * 4;
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, stride, 32); gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 36); gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);
    this.fsVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.fsVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // noise texture
    const N = 256;
    this.noiseTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, makeNoiseTexture(N, 1234));
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    // tile texture
    this.tileTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tileTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, this.tileW, this.tileH, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, this.tileData);

    for (const p of [this.spriteProg, this.terrainProg, this.compProg]) {
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i)!;
        const name = info.name.replace('[0]', '');
        const key = (p === this.spriteProg ? 's.' : p === this.terrainProg ? 't.' : 'c.') + name;
        this.uniforms[key] = gl.getUniformLocation(p, info.name)!;
      }
    }
    this.shadowFB = gl.createFramebuffer()!; this.shadowTex = gl.createTexture()!;
    this.lightFB = gl.createFramebuffer()!; this.lightTex = gl.createTexture()!;
  }

  setPalette(idx: number, a: [number, number, number], b: [number, number, number], style: [number, number]) {
    this.palette.set(a, idx * 3); this.palette2.set(b, idx * 3); this.style.set(style, idx * 2);
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr;
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.vw = w; this.vh = h;
    if (this.fbW !== w || this.fbH !== h) {
      const gl = this.gl;
      for (const [fb, tex] of [[this.shadowFB, this.shadowTex], [this.lightFB, this.lightTex]] as [WebGLFramebuffer, WebGLTexture][]) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.fbW = w; this.fbH = h;
    }
  }

  // visible world rect
  get viewW() { return this.vw / this.zoom; }
  get viewH() { return this.vh / this.zoom; }
  get left() { return this.camX - this.viewW / 2; }
  get top() { return this.camY - this.viewH / 2; }
  screenToWorld(sx: number, sy: number): [number, number] { // sx, sy in device px
    return [this.camX + (sx - this.vw / 2) / this.zoom, this.camY + (sy - this.vh / 2) / this.zoom];
  }
  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.camX) * this.zoom + this.vw / 2, (wy - this.camY) * this.zoom + this.vh / 2];
  }

  begin() { for (const b of Object.values(this.batches)) b.n = 0; }

  // Draw a sprite anchored at (x,y) world. Sprite offset ox/oy are applied (rotated if rot).
  draw(batch: BatchName, s: Sprite | undefined, x: number, y: number, color = WHITE, rot = 0, scale = 1, key?: number, flipX = false) {
    if (!s) return;
    if (this.redirect) { if (batch === 'shadow' || batch === 'light' || batch === 'airShadow') return; batch = this.redirect; color = this.tint; }
    let ox = s.ox * scale, oy = s.oy * scale;
    if (rot) { const c = Math.cos(rot), si = Math.sin(rot); const tx = ox * c - oy * si; oy = ox * si + oy * c; ox = tx; }
    const w = s.w * scale * (flipX ? -1 : 1);
    this.batches[batch].push(s, x + (flipX ? -ox : ox), y + oy, w, s.h * scale, rot, color, key ?? y);
  }
  // Draw sprite stretched to explicit world size centered at x,y
  drawRect(batch: BatchName, s: Sprite | undefined, x: number, y: number, w: number, h: number, color = WHITE, rot = 0, key?: number) {
    if (!s) return;
    if (this.redirect) { if (batch === 'shadow' || batch === 'light') return; batch = this.redirect; color = this.tint; }
    this.batches[batch].push(s, x, y, w, h, rot, color, key ?? y);
  }
  line(batch: BatchName, s: Sprite | undefined, x1: number, y1: number, x2: number, y2: number, width: number, color = WHITE, key = 0) {
    if (!s) return;
    if (this.redirect) { if (batch === 'shadow' || batch === 'light') return; batch = this.redirect; color = this.tint; }
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return;
    this.batches[batch].push(s, (x1 + x2) / 2, (y1 + y2) / 2, len, width, Math.atan2(dy, dx), color, key);
  }

  uploadTiles() {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tileTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, this.tileW, this.tileH, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, this.tileData);
    this.tilesDirty = false;
  }

  private drawBatch(b: Batch, sorted = false) {
    if (b.n === 0) return;
    const gl = this.gl;
    let data = b.data;
    if (sorted && b.keys) {
      if (this.tmp.length < b.n * FLOATS) this.tmp = new Float32Array(b.data.length);
      data = b.sorted(this.tmp);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVBO);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, b.n * FLOATS), gl.STREAM_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, b.n);
  }

  end() {
    const gl = this.gl;
    if (this.tilesDirty) this.uploadTiles();
    gl.viewport(0, 0, this.vw, this.vh);
    gl.disable(gl.DEPTH_TEST);
    const halfW = this.viewW / 2, halfH = this.viewH / 2;
    // Terrain
    gl.disable(gl.BLEND);
    gl.useProgram(this.terrainProg);
    const U = this.uniforms;
    gl.uniform2f(U['t.u_cam'], this.camX, this.camY);
    gl.uniform2f(U['t.u_half'], halfW, halfH);
    gl.uniform2f(U['t.u_origin'], this.tileOX, this.tileOY);
    gl.uniform2f(U['t.u_tsize'], this.tileW, this.tileH);
    gl.uniform1f(U['t.u_time'], this.time);
    gl.uniform1f(U['t.u_pxPerTile'], this.zoom);
    gl.uniform3fv(U['t.u_pal'], this.palette);
    gl.uniform3fv(U['t.u_pal2'], this.palette2);
    gl.uniform2fv(U['t.u_style'], this.style);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tileTex);
    gl.uniform1i(U['t.u_tiles'], 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.uniform1i(U['t.u_noise'], 1);
    gl.bindVertexArray(this.fsVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Sprites
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.spriteProg);
    gl.uniform2f(U['s.u_cam'], this.camX, this.camY);
    gl.uniform2f(U['s.u_scale'], 1 / halfW, 1 / halfH);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas.tex);
    gl.uniform1i(U['s.u_tex'], 0);
    gl.uniform1f(U['s.u_mode'], 0);
    gl.bindVertexArray(this.vao);
    const B = this.batches;
    this.drawBatch(B.ground);
    this.drawBatch(B.ground2);
    this.drawBatch(B.beltItems);
    // Shadows into FBO with MAX blending, then composite
    if (B.shadow.n > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform1f(U['s.u_mode'], 1);
      this.drawBatch(B.shadow);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.composite(this.shadowTex, 0, 0.62);
      gl.useProgram(this.spriteProg); gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas.tex);
      gl.uniform1f(U['s.u_mode'], 0);
    }
    this.drawBatch(B.objects, true);
    this.drawBatch(B.high, true);
    if (B.airShadow.n > 0) this.drawBatch(B.airShadow);
    this.drawBatch(B.air, true);
    this.drawBatch(B.wires);
    // Lighting
    if (this.darkness > 0.01) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightFB);
      const a = this.ambient;
      gl.clearColor(a[0], a[1], a[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendFunc(gl.ONE, gl.ONE);
      this.drawBatch(B.light);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.blendFunc(gl.DST_COLOR, gl.ZERO);
      this.composite(this.lightTex, 1, 1);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.spriteProg); gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas.tex);
      gl.uniform1f(U['s.u_mode'], 0);
    }
    this.drawBatch(B.overlay);
    this.drawBatch(B.top);
    gl.bindVertexArray(null);
  }

  private composite(tex: WebGLTexture, mode: number, strength: number) {
    const gl = this.gl, U = this.uniforms;
    gl.useProgram(this.compProg);
    gl.uniform2f(U['c.u_cam'], this.camX, this.camY);
    gl.uniform2f(U['c.u_half'], 1, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(U['c.u_src'], 0);
    gl.uniform1f(U['c.u_mode'], mode);
    gl.uniform1f(U['c.u_strength'], strength);
    gl.bindVertexArray(this.fsVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
