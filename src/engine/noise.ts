// Deterministic noise utilities (seeded simplex + value noise, hashing).

export function hash2(x: number, y: number, seed = 0): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
export function hashInt(x: number, y: number, seed = 0): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + seed * 1442695041;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

export class RNG {
  s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 1; }
  next(): number { // mulberry32
    let t = (this.s += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
}

const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
export class Simplex {
  perm = new Uint8Array(512);
  constructor(seed: number) {
    const r = new RNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  noise(xin: number, yin: number): number {
    const F2 = 0.3660254037844386, G2 = 0.21132486540518713;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255, p = this.perm;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = GRAD[p[ii + p[jj]] & 7]; t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = GRAD[p[ii + i1 + p[jj + j1]] & 7]; t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = GRAD[p[ii + 1 + p[jj + 1]] & 7]; t2 *= t2; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * (n0 + n1 + n2); // [-1,1]
  }
  fbm(x: number, y: number, oct: number, lac = 2, gain = 0.5): number {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * this.noise(x * f, y * f); n += a; a *= gain; f *= lac; }
    return s / n;
  }
}

// Tileable value noise texture data for the GPU (RGBA channels at different frequencies)
export function makeNoiseTexture(size: number, seed: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const freqs = [4, 16, 64, 8];
  for (let c = 0; c < 4; c++) {
    const f = freqs[c];
    const grid: number[] = [];
    const r = new RNG(seed + c * 977);
    for (let i = 0; i < f * f; i++) grid.push(r.next());
    const g2: number[] = [];
    const f2 = f * 2;
    for (let i = 0; i < f2 * f2; i++) g2.push(r.next());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const sample = (gr: number[], ff: number) => {
        const fx = x / size * ff, fy = y / size * ff;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const v = (xx: number, yy: number) => gr[((yy % ff + ff) % ff) * ff + ((xx % ff + ff) % ff)];
        const a = v(x0, y0), b = v(x0 + 1, y0), cc = v(x0, y0 + 1), d = v(x0 + 1, y0 + 1);
        return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
      };
      const val = sample(grid, f) * 0.7 + sample(g2, f2) * 0.3;
      out[(y * size + x) * 4 + c] = Math.max(0, Math.min(255, Math.round(val * 255)));
    }
  }
  return out;
}
