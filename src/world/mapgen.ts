// Procedural map generation (deterministic per seed).
import { Simplex, RNG, hash2, hashInt } from '../engine/noise';

export const CHUNK = 32;
export const RES_INDEX: Record<string, number> = { 'iron-ore': 1, 'copper-ore': 2, 'coal': 3, 'stone': 4, 'uranium-ore': 5, 'crude-oil': 6 };
export const RES_NAMES = ['', 'iron-ore', 'copper-ore', 'coal', 'stone', 'uranium-ore', 'crude-oil'];

export interface MapSettings {
  seed: number;
  resFreq: number; resSize: number; resRich: number;
  enemyFreq: number; enemySize: number; peaceful: boolean; noEnemies: boolean;
  water: number; trees: number; startArea: number;
}
export const DEFAULT_SETTINGS: MapSettings = {
  seed: 12345, resFreq: 1, resSize: 1, resRich: 1, enemyFreq: 1, enemySize: 1, peaceful: false, noEnemies: false, water: 1, trees: 1, startArea: 1,
};

export interface GenEntity { kind: 'tree' | 'rock' | 'spawner' | 'worm' | 'fish'; x: number; y: number; variant: number; sub?: string; }
export interface GenChunk { tiles: Uint8Array; resType: Uint8Array; resAmount: Uint32Array; ents: GenEntity[]; }

interface Patch { x: number; y: number; r: number; res: number; rich: number; oil?: boolean; }
const REGION = 160;

export class MapGen {
  s: MapSettings;
  elev: Simplex; moist: Simplex; aux: Simplex; forest: Simplex; detail: Simplex; shape: Simplex; enemy: Simplex;
  regionCache = new Map<number, Patch[]>();
  startPatches: Patch[] = [];
  spawn: [number, number] = [0, 0];

  constructor(s: MapSettings) {
    this.s = s;
    const seed = s.seed;
    this.elev = new Simplex(seed); this.moist = new Simplex(seed + 1); this.aux = new Simplex(seed + 2);
    this.forest = new Simplex(seed + 3); this.detail = new Simplex(seed + 4); this.shape = new Simplex(seed + 5); this.enemy = new Simplex(seed + 6);
    this.makeStartArea();
  }

  private makeStartArea() {
    const r = new RNG(this.s.seed * 7 + 3);
    const base = r.next() * Math.PI * 2;
    const order = [1, 2, 3, 4];
    const sz = this.s.resSize;
    const dists = [34, 40, 30, 44];
    for (let i = 0; i < 4; i++) {
      const a = base + i * Math.PI / 2 + r.range(-0.35, 0.35);
      const d = dists[i] * this.s.startArea + r.range(-4, 6);
      this.startPatches.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: (order[i] === 4 ? 9 : order[i] === 3 ? 12 : 15) * Math.sqrt(sz), res: order[i], rich: 1.2 * this.s.resRich });
    }
    // guaranteed oil field
    const oa = base + Math.PI / 4 + r.range(-0.3, 0.3);
    const od = 150 + r.range(0, 40);
    this.startPatches.push({ x: Math.cos(oa) * od, y: Math.sin(oa) * od, r: 9, res: 6, rich: 1, oil: true });
    // ensure a pond near spawn: handled in water function via startPond
    const pa = base + Math.PI * 1.25 + r.range(-0.3, 0.3);
    this.pond = [Math.cos(pa) * 26, Math.sin(pa) * 26];
  }
  pond: [number, number] = [20, 20];

  private regionPatches(rx: number, ry: number): Patch[] {
    const key = (rx + 4096) * 8192 + (ry + 4096);
    let p = this.regionCache.get(key);
    if (p) return p;
    p = [];
    const r = new RNG(hashInt(rx, ry, this.s.seed + 99));
    const cx = (rx + 0.5) * REGION, cy = (ry + 0.5) * REGION;
    const dist = Math.hypot(cx, cy);
    if (dist > 120 * this.s.startArea) {
      const n = Math.floor((r.next() * 2.2 + 0.8) * this.s.resFreq);
      for (let i = 0; i < n; i++) {
        const x = (rx + 0.15 + r.next() * 0.7) * REGION, y = (ry + 0.15 + r.next() * 0.7) * REGION;
        const d = Math.hypot(x, y);
        let res: number;
        const roll = r.next();
        if (d > 350 && roll < 0.08) res = 5;
        else if (roll < 0.2) res = 6;
        else if (roll < 0.47) res = 1;
        else if (roll < 0.7) res = 2;
        else if (roll < 0.87) res = 3;
        else res = 4;
        const grow = Math.min(2.2, 1 + d / 900);
        const rad = (res === 6 ? 8 : res === 5 ? 9 : 11 + r.next() * 9) * grow * Math.sqrt(this.s.resSize);
        p.push({ x, y, r: rad, res, rich: (1 + d / 400) * this.s.resRich, oil: res === 6 });
      }
    }
    this.regionCache.set(key, p);
    return p;
  }

  height(x: number, y: number): number {
    let e = this.elev.fbm(x / 340, y / 340, 4) * 0.9 + this.elev.noise(x / 90, y / 90) * 0.15;
    e += 0.18 / this.s.water - 0.18;
    // keep spawn dry, add a guaranteed pond
    const ds = Math.hypot(x, y);
    if (ds < 60) e = e * (ds / 60) + 0.35 * (1 - ds / 60);
    const dp = Math.hypot(x - this.pond[0], y - this.pond[1]);
    if (dp < 12) e = Math.min(e, -0.5 + dp / 12 * 0.4 + this.detail.noise(x / 6, y / 6) * 0.1);
    return e;
  }

  generate(cx: number, cy: number): GenChunk {
    const tiles = new Uint8Array(CHUNK * CHUNK);
    const resType = new Uint8Array(CHUNK * CHUNK);
    const resAmount = new Uint32Array(CHUNK * CHUNK);
    const ents: GenEntity[] = [];
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    // gather patches affecting this chunk
    const rx0 = Math.floor((x0 - 64) / REGION), rx1 = Math.floor((x0 + CHUNK + 64) / REGION);
    const ry0 = Math.floor((y0 - 64) / REGION), ry1 = Math.floor((y0 + CHUNK + 64) / REGION);
    const patches: Patch[] = [];
    for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) patches.push(...this.regionPatches(rx, ry));
    for (const p of this.startPatches) patches.push(p);
    const near = patches.filter(p => p.x + p.r * 1.6 > x0 && p.x - p.r * 1.6 < x0 + CHUNK && p.y + p.r * 1.6 > y0 && p.y - p.r * 1.6 < y0 + CHUNK);

    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      const x = x0 + lx, y = y0 + ly, i = ly * CHUNK + lx;
      const h = this.height(x, y);
      let t: number;
      if (h < -0.22) t = 21; else if (h < -0.05) t = 20;
      else {
        const m = this.moist.fbm(x / 420, y / 420, 3) + this.moist.noise(x / 60, y / 60) * 0.12;
        const a = this.aux.fbm(x / 500, y / 500, 3);
        const v1 = this.detail.fbm(x / 70, y / 70, 2);     // smooth variant selector
        const v2 = this.detail.noise(x / 26 + 100, y / 26);
        if (m > 0.08) {
          t = v1 > 0.25 ? 2 : v1 > -0.1 ? 1 : v1 > -0.4 ? 3 : 4;
          if (m < 0.16 && v2 > 0.35) t = 4;
        } else if (m > -0.12) {
          if (a > 0.15) t = v1 > 0.1 ? 17 : 16;
          else t = v1 > 0.3 ? 5 : v1 > 0.0 ? 6 : v1 > -0.3 ? 8 : 10;
          if (m > 0.02 && v2 > 0.45) t = 4;
        } else {
          if (a > 0.05) t = v1 > 0.15 ? 17 : v1 > -0.2 ? 18 : 19;
          else t = v1 > 0.15 ? 13 : v1 > -0.2 ? 14 : 15;
        }
        if (h < 0.0 && h >= -0.05) t = t; // shore
      }
      tiles[i] = t;
      const water = t === 20 || t === 21;
      // resources
      if (!water && near.length) {
        for (const p of near) {
          const dx = x - p.x, dy = y - p.y;
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd > p.r * 1.6) continue;
          if (p.oil) {
            // oil wells placed sparsely
            if (dd < p.r && (hashInt(x, y, this.s.seed + 7) % 1000) < 22) {
              // keep spacing: only if neighbours don't also qualify via coarse grid
              if ((x & 1) === 0 && (y & 1) === 0) {
                resType[i] = 6;
                resAmount[i] = Math.floor((45000 + hash2(x, y, 3) * 150000) * p.rich);
              }
            }
            continue;
          }
          const n = this.shape.noise(x / 9 + p.res * 13, y / 9) * 0.35 + this.shape.noise(x / 3.5, y / 3.5 + p.res * 7) * 0.12;
          const k = dd / p.r + n;
          if (k < 1) {
            const amt = Math.floor((1 - k * k) * (p.res === 5 ? 700 : 1100) * p.rich * (0.7 + hash2(x, y, 11) * 0.6) + 40);
            if (amt > resAmount[i]) { resType[i] = p.res; resAmount[i] = amt; }
          }
        }
      }
      // trees
      if (!water && resType[i] === 0 && t < 20) {
        const ds = Math.hypot(x, y);
        const f = this.forest.fbm(x / 110, y / 110, 3) + this.forest.noise(x / 25, y / 25) * 0.25;
        const m = this.moist.fbm(x / 420, y / 420, 3);
        let dens = 0;
        if (t <= 4) dens = Math.max(0, f + 0.05) * 0.9 + 0.012;
        else if (t <= 12) dens = Math.max(0, f - 0.1) * 0.5 + 0.004;
        else dens = Math.max(0, f - 0.3) * 0.15 + 0.0015;
        dens *= this.s.trees;
        if (ds < 12) dens = 0;
        const hv = hash2(x, y, this.s.seed + 21);
        if (hv < dens) {
          const v = hashInt(x, y, 5) % 1000;
          let variant: number;
          if (t <= 2) variant = [0, 1, 5, 8][v % 4];
          else if (t <= 4) variant = [2, 3, 4][v % 3];
          else if (t <= 12) variant = [3, 4, 6, 7][v % 4];
          else variant = -1; // dead tree
          if (m < -0.15 && v % 3 === 0) variant = -1;
          ents.push({ kind: 'tree', x: x + 0.5 + (hash2(x, y, 31) - 0.5) * 0.6, y: y + 0.5 + (hash2(x, y, 32) - 0.5) * 0.6, variant });
        } else if (hv > 0.9985 - (t >= 13 ? 0.0015 : 0)) {
          if (ds > 8) ents.push({ kind: 'rock', x: x + 1, y: y + 1, variant: hashInt(x, y, 9) % 9, sub: t >= 13 ? 'big-sand-rock' : (hashInt(x, y, 10) % 3 === 0 ? 'huge-rock' : 'big-rock') });
        }
      }
      if (water && t === 20 && hash2(x, y, 77) < 0.0035) ents.push({ kind: 'fish', x: x + 0.5, y: y + 0.5, variant: 0 });
    }
    // enemy bases: one candidate per 4x4 chunk block, placed when this chunk holds the base center
    if (!this.s.noEnemies) this.genEnemies(cx, cy, tiles, ents);
    return { tiles, resType, resAmount, ents };
  }

  private genEnemies(cx: number, cy: number, tiles: Uint8Array, ents: GenEntity[]) {
    const bx = Math.floor(cx / 3), by = Math.floor(cy / 3);
    const r = new RNG(hashInt(bx, by, this.s.seed + 555));
    const centerX = (bx * 3 + r.next() * 3) * CHUNK, centerY = (by * 3 + r.next() * 3) * CHUNK;
    const dist = Math.hypot(centerX, centerY);
    const startR = 260 * this.s.startArea;
    if (dist < startR) return;
    const chance = Math.min(0.55, 0.22 + (dist - startR) / 2500) * this.s.enemyFreq;
    if (r.next() > chance) return;
    if (Math.floor(centerX / CHUNK) !== cx || Math.floor(centerY / CHUNK) !== cy) return;
    const lx = Math.floor(centerX - cx * CHUNK), ly = Math.floor(centerY - cy * CHUNK);
    if (tiles[ly * CHUNK + lx] >= 20) return;
    const size = Math.min(10, 2 + Math.floor(dist / 350 + r.next() * 3)) * this.s.enemySize;
    const nSp = Math.max(1, Math.round(size));
    for (let i = 0; i < nSp; i++) {
      const a = r.next() * Math.PI * 2, d = Math.sqrt(r.next()) * (5 + size * 2.2);
      ents.push({ kind: 'spawner', x: centerX + Math.cos(a) * d, y: centerY + Math.sin(a) * d, variant: r.next() < 0.35 && dist > 300 ? 1 : 0 });
    }
    const nW = Math.round(size * 0.8);
    for (let i = 0; i < nW; i++) {
      const a = r.next() * Math.PI * 2, d = 6 + Math.sqrt(r.next()) * (8 + size * 2.5);
      const tier = dist > 1400 ? 3 : dist > 900 ? 2 : dist > 500 ? 1 : 0;
      ents.push({ kind: 'worm', x: centerX + Math.cos(a) * d, y: centerY + Math.sin(a) * d, variant: Math.max(0, tier - (r.next() < 0.5 ? 1 : 0)) });
    }
  }
}
