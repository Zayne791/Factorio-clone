// World sprites: trees, rocks, ores, decoratives, character, enemies, military, vehicles, effects.
import { mkc, css, sh, shade, mix, rrect, vgrad, hgrad, lgrad, rgrad, box, rivet, gear, grain, ellipse, poly, glow, cylinder, vents, stripes, makeShadowAt, RGB, Ctx } from './draw';
import { frame, add, addRaw, PX, A } from './sprites-common';
import { RNG } from '../engine/noise';

// ---------- Trees ----------
const TREE_PALETTES: [RGB, RGB, RGB][] = [
  [[52, 78, 30], [90, 120, 46], [30, 46, 18]],
  [[44, 70, 34], [80, 112, 56], [24, 40, 20]],
  [[66, 82, 30], [116, 130, 52], [36, 46, 16]],
  [[58, 74, 40], [104, 120, 66], [30, 40, 22]],
  [[86, 90, 34], [140, 140, 56], [46, 50, 18]],
  [[40, 62, 40], [70, 100, 68], [20, 34, 22]],
  [[110, 70, 30], [170, 112, 46], [60, 36, 14]],
  [[96, 96, 40], [150, 146, 64], [52, 52, 20]],
  [[50, 86, 44], [96, 136, 70], [26, 48, 24]],
];
export const TREE_VARIANTS = TREE_PALETTES.length;
function drawTree(seed: number, pal: [RGB, RGB, RGB]) {
  const f = frame(1, 1, 3.0, 0.3, 1.0);
  const { ctx, x0, y0 } = f;
  const R = new RNG(seed);
  const bx = x0 + 32, by = y0 + 44;
  // trunk
  ctx.fillStyle = hgrad(ctx, bx - 6, bx + 6, [[0, '#2e2014'], [0.4, '#6a4a2c'], [1, '#22160c']]);
  poly(ctx, [[bx - 7, by], [bx - 4, by - 70], [bx + 4, by - 70], [bx + 7, by]]); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ellipse(ctx, bx, by, 12, 4); ctx.fill();
  // canopy clumps
  const cy = by - 110, cx = bx + R.range(-4, 4);
  const clumps: [number, number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const a = R.next() * Math.PI * 2, d = Math.sqrt(R.next()) * 46;
    clumps.push([cx + Math.cos(a) * d * 1.05, cy + Math.sin(a) * d * 0.85, R.range(14, 24)]);
  }
  clumps.sort((p, q) => p[1] - q[1]);
  // dark base layer
  for (const [x, y, r] of clumps) { ctx.fillStyle = css(pal[2]); ctx.beginPath(); ctx.arc(x + 3, y + 5, r, 0, 6.3); ctx.fill(); }
  for (const [x, y, r] of clumps) {
    ctx.fillStyle = rgrad(ctx, x - r * 0.4, y - r * 0.5, 1, r * 1.2, [[0, css(pal[1])], [0.55, css(pal[0])], [1, css(pal[2])]]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
  }
  // leaf speckles
  for (let i = 0; i < 260; i++) {
    const a = R.next() * Math.PI * 2, d = Math.sqrt(R.next()) * 58;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.85;
    const lit = (cx - x) * 0.5 + (cy - y) * 0.7;
    ctx.fillStyle = css(lit > 0 ? shade(pal[1], 1.1 + R.next() * 0.2) : shade(pal[2], 0.9 + R.next() * 0.3), 0.8);
    ctx.fillRect(x, y, 2 + R.next() * 2, 2 + R.next() * 2);
  }
  // clip anything outside a soft canopy boundary isn't needed; add grain
  grain(ctx, f.W, f.H, 0.08, seed);
  return f;
}
function drawDeadTree(seed: number) {
  const f = frame(1, 1, 2.4, 0.3, 0.9);
  const { ctx, x0, y0 } = f;
  const R = new RNG(seed);
  const bx = x0 + 32, by = y0 + 44;
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    ctx.strokeStyle = '#3a2e22'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = '#7a6a54'; ctx.lineWidth = w * 0.4; ctx.beginPath(); ctx.moveTo(x - 1, y); ctx.lineTo(x2 - 1, y2); ctx.stroke();
    if (depth > 0) {
      const n = 2 + (R.next() > 0.6 ? 1 : 0);
      for (let i = 0; i < n; i++) branch(x2, y2, a + R.range(-0.8, 0.8), len * R.range(0.55, 0.8), w * 0.65, depth - 1);
    }
  };
  branch(bx, by, -Math.PI / 2 + R.range(-0.15, 0.15), 50, 9, 4);
  return f;
}
export function buildTrees() {
  for (let i = 0; i < TREE_PALETTES.length; i++) {
    const f = drawTree(1000 + i * 17, TREE_PALETTES[i]);
    add(`tree-${i}`, f, { k: 0.6, dy: 0, alpha: 0.9 });
  }
  for (let i = 0; i < 3; i++) add(`dead-tree-${i}`, drawDeadTree(2000 + i * 31), { k: 0.6, alpha: 0.8 });
  // stump
  const f = frame(1, 1, 0.3, 0.2, 0.2);
  cylinder(f.ctx, f.x0 + 32, f.y0 + 28, 8, 4, 10, [100, 72, 44]);
  f.ctx.fillStyle = '#b08a5a'; ellipse(f.ctx, f.x0 + 32, f.y0 + 28, 7, 3.4); f.ctx.fill();
  add('tree-stump', f);
}

// ---------- Rocks ----------
function drawRock(f: ReturnType<typeof frame>, cx: number, cy: number, rx: number, ry: number, base: RGB, seed: number) {
  const { ctx } = f;
  const R = new RNG(seed);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(ctx, cx + 4, cy + ry * 0.7, rx * 1.05, ry * 0.5); ctx.fill();
  for (let k = 0; k < 3; k++) {
    const ox = R.range(-rx * 0.35, rx * 0.35), oy = R.range(-ry * 0.25, ry * 0.1);
    const r1 = rx * R.range(0.5, 0.8), r2 = ry * R.range(0.55, 0.85);
    const pts: number[][] = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const rr = R.range(0.8, 1.1);
      pts.push([cx + ox + Math.cos(a) * r1 * rr, cy + oy + Math.sin(a) * r2 * rr - (Math.sin(a) < 0 ? r2 * 0.3 : 0)]);
    }
    poly(ctx, pts);
    ctx.fillStyle = rgrad(ctx, cx + ox - r1 * 0.4, cy + oy - r2 * 0.6, 1, r1 * 1.4, [[0, sh(base, 1.35)], [0.5, sh(base, 0.95)], [1, sh(base, 0.45)]]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = sh(base, 1.5, 0.3);
    ctx.beginPath(); ctx.moveTo(pts[5][0], pts[5][1]); ctx.lineTo(cx + ox, cy + oy - r2 * 0.2); ctx.lineTo(pts[7][0], pts[7][1]); ctx.stroke();
  }
  grain(ctx, f.W, f.H, 0.1, seed);
}
export function buildRocks() {
  for (let i = 0; i < 3; i++) {
    const f = frame(2, 2, 0.8, 0.3, 0.3);
    drawRock(f, f.x0 + 64, f.y0 + 60, 66, 52, [120, 116, 108], 3000 + i);
    add(`huge-rock-${i}`, f, { dx: 10, dy: 2, k: 0.3, alpha: 0.6 });
    const g = frame(2, 2, 0.5, 0.3, 0.3);
    drawRock(g, g.x0 + 64, g.y0 + 70, 46, 36, [124, 118, 108], 3100 + i);
    add(`big-rock-${i}`, g, { dx: 8, dy: 2, k: 0.3, alpha: 0.6 });
    const h = frame(2, 2, 0.5, 0.3, 0.3);
    drawRock(h, h.x0 + 64, h.y0 + 70, 50, 36, [160, 128, 88], 3200 + i);
    add(`big-sand-rock-${i}`, h, { dx: 8, dy: 2, k: 0.3, alpha: 0.6 });
  }
}

// ---------- Ores ----------
const ORE_COLORS: Record<string, [RGB, number, RGB?]> = {
  'iron-ore': [[90, 120, 140], 0.35],
  'copper-ore': [[180, 92, 54], 0.3, [70, 160, 120]],
  'coal': [[34, 34, 36], 0.7],
  'stone': [[168, 146, 108], 0.2],
  'uranium-ore': [[66, 150, 40], 0.6, [170, 255, 90]],
};
export function buildOres() {
  for (const [id, [base, spec, fleck]] of Object.entries(ORE_COLORS)) {
    for (let v = 0; v < 6; v++) for (let lvl = 0; lvl < 4; lvl++) {
      const [c, ctx] = mkc(84, 84);
      const R = new RNG(v * 101 + lvl * 7 + id.length * 13);
      const n = [7, 12, 18, 26][lvl];
      const pieces: [number, number, number][] = [];
      for (let i = 0; i < n; i++) pieces.push([R.range(10, 74), R.range(10, 74), R.range(4, 6.5 + lvl * 2.0)]);
      pieces.sort((a, b) => a[1] - b[1]);
      for (const [x, y, r] of pieces) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ellipse(ctx, x + 2, y + r * 0.5, r * 1.1, r * 0.55); ctx.fill();
        const pts: number[][] = [];
        for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + R.next() * 0.5; const rr = r * R.range(0.75, 1.1); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8]); }
        poly(ctx, pts);
        const b = shade(base, R.range(0.8, 1.15));
        ctx.fillStyle = rgrad(ctx, x - r * 0.4, y - r * 0.5, 0, r * 1.5, [[0, sh(b, 1 + spec)], [0.5, css(b)], [1, sh(b, 0.45)]]);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.8; ctx.stroke();
        if (fleck && R.next() > 0.4) { ctx.fillStyle = css(fleck, 0.9); ctx.fillRect(x - 1, y - 1, 2, 2); }
      }
      addRaw(`ore-${id}-${v}-${lvl}`, c);
    }
  }
  // crude oil seep
  for (let v = 0; v < 3; v++) {
    const [c, ctx] = mkc(140, 110);
    const R = new RNG(4000 + v);
    ctx.fillStyle = 'rgba(30,22,18,0.55)'; ellipse(ctx, 70, 55, 62, 44); ctx.fill();
    for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(14,10,8,${0.5 + R.next() * 0.3})`; ellipse(ctx, 70 + R.range(-30, 30), 55 + R.range(-18, 18), R.range(12, 28), R.range(8, 18)); ctx.fill(); }
    ctx.fillStyle = '#0a0806'; ellipse(ctx, 70, 52, 22, 15); ctx.fill();
    ctx.strokeStyle = 'rgba(120,90,160,0.35)'; ctx.lineWidth = 2; ellipse(ctx, 66, 50, 14, 9); ctx.stroke();
    ctx.strokeStyle = 'rgba(90,160,140,0.25)'; ellipse(ctx, 72, 54, 18, 12); ctx.stroke();
    addRaw(`crude-oil-${v}`, c);
  }
}

// ---------- Decoratives ----------
export const DECOR_COUNT = 14;
export function buildDecoratives() {
  for (let i = 0; i < DECOR_COUNT; i++) {
    const [c, ctx] = mkc(48, 48);
    const R = new RNG(5000 + i);
    if (i < 5) { // grass tufts
      const col: RGB = [[70, 96, 34], [90, 110, 40], [110, 116, 50], [60, 84, 30], [130, 120, 60]][i] as RGB;
      for (let k = 0; k < 14; k++) {
        const x = 24 + R.range(-10, 10), y = 40;
        ctx.strokeStyle = sh(col, R.range(0.7, 1.35)); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + R.range(-6, 6), y - 12, x + R.range(-12, 12), y - R.range(12, 26)); ctx.stroke();
      }
    } else if (i < 8) { // flowers
      const fc: RGB = [[220, 60, 50], [230, 200, 60], [170, 90, 200]][i - 5] as RGB;
      for (let k = 0; k < 6; k++) {
        const x = R.range(10, 38), y = R.range(14, 40);
        ctx.strokeStyle = '#4a6a24'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 6); ctx.stroke();
        ctx.fillStyle = css(fc); ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 6.3); ctx.fill();
      }
    } else if (i < 11) { // pebbles
      for (let k = 0; k < 5; k++) {
        const x = R.range(10, 38), y = R.range(16, 40), r = R.range(2, 5);
        const b: RGB = i === 10 ? [160, 130, 90] : [120, 116, 108];
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(ctx, x + 1, y + 1.5, r, r * 0.6); ctx.fill();
        ctx.fillStyle = rgrad(ctx, x - 1, y - 1, 0, r * 1.3, [[0, sh(b, 1.3)], [1, sh(b, 0.6)]]); ellipse(ctx, x, y, r, r * 0.75); ctx.fill();
      }
    } else { // dry bushes
      const col: RGB = [[110, 90, 50], [90, 80, 46], [70, 90, 40]][i - 11] as RGB;
      for (let k = 0; k < 20; k++) {
        const a = -Math.PI / 2 + R.range(-1.2, 1.2);
        ctx.strokeStyle = sh(col, R.range(0.7, 1.3)); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(24, 40); ctx.lineTo(24 + Math.cos(a) * R.range(8, 18), 40 + Math.sin(a) * R.range(8, 18)); ctx.stroke();
      }
    }
    addRaw(`decor-${i}`, c);
  }
}

// ---------- Character (3D puppet projection) ----------
type V3 = [number, number, number];
function proj(p: V3, yaw: number, s: number, ox: number, oy: number): [number, number, number] {
  // yaw: facing angle (0 = north/up the screen). x right, y forward, z up.
  const c = Math.cos(yaw), si = Math.sin(yaw);
  const x = p[0] * c - p[1] * si, y = p[0] * si + p[1] * c;
  // screen: x right; forward in world = -screenY. 3/4 view squashes depth.
  return [ox + x * s, oy - y * s * 0.62 - p[2] * s * 0.82, y];
}
const SUIT: RGB = [196, 132, 62];
const SUIT_DARK: RGB = [100, 70, 40];
function limb(ctx: Ctx, a: [number, number], b: [number, number], w: number, col: RGB) {
  ctx.strokeStyle = sh(col, 0.45); ctx.lineWidth = w + 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  ctx.strokeStyle = css(col); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  ctx.strokeStyle = sh(col, 1.35, 0.6); ctx.lineWidth = w * 0.35; ctx.beginPath(); ctx.moveTo(a[0] - 1, a[1] - 1); ctx.lineTo(b[0] - 1, b[1] - 1); ctx.stroke();
}
function drawCharacter(dir: number, phase: number, mode: 'run' | 'idle' | 'mine' | 'shoot', armor: RGB): HTMLCanvasElement {
  const [c, ctx] = mkc(128, 168);
  const yaw = -dir / 8 * Math.PI * 2; // dir 0 = north, clockwise
  const s = 46, ox = 64, oy = 136;
  const t = phase * Math.PI * 2;
  const run = mode === 'run' ? 1 : 0;
  const legSwing = Math.sin(t) * 0.5 * run;
  const bob = run ? Math.abs(Math.sin(t)) * 0.06 : 0;
  const P = (v: V3) => proj(v, yaw, s, ox, oy);
  const hip: V3 = [0, 0, 0.95 + bob];
  const footL: V3 = [-0.18, Math.sin(t) * 0.45 * run, Math.max(0, Math.cos(t)) * 0.15 * run];
  const footR: V3 = [0.18, -Math.sin(t) * 0.45 * run, Math.max(0, -Math.cos(t)) * 0.15 * run];
  const kneeL: V3 = [-0.17, footL[1] * 0.5 + 0.08, 0.5 + bob * 0.5 + footL[2] * 0.6];
  const kneeR: V3 = [0.17, footR[1] * 0.5 + 0.08, 0.5 + bob * 0.5 + footR[2] * 0.6];
  const chest: V3 = [0, 0.04, 1.5 + bob];
  const head: V3 = [0, 0.06, 1.88 + bob];
  const shL: V3 = [-0.3, 0, 1.55 + bob], shR: V3 = [0.3, 0, 1.55 + bob];
  let handL: V3 = [-0.36, -legSwing * 0.8, 1.0 + bob], handR: V3 = [0.36, legSwing * 0.8, 1.0 + bob];
  if (mode === 'mine') { const sw = Math.sin(t); handR = [0.2, 0.45 + sw * 0.15, 1.35 + sw * 0.35]; handL = [-0.1, 0.45 + sw * 0.15, 1.3 + sw * 0.35]; }
  if (mode === 'shoot') { handR = [0.15, 0.6, 1.35 + bob]; handL = [-0.05, 0.55, 1.35 + bob]; }
  const elL: V3 = [(shL[0] + handL[0]) / 2 - 0.08, (shL[1] + handL[1]) / 2, (shL[2] + handL[2]) / 2];
  const elR: V3 = [(shR[0] + handR[0]) / 2 + 0.08, (shR[1] + handR[1]) / 2, (shR[2] + handR[2]) / 2];
  // shadow ellipse
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(ctx, ox + 6, oy + 3, 26, 10); ctx.fill();
  const parts: { z: number; draw: () => void }[] = [];
  const add2 = (z: number, draw: () => void) => parts.push({ z, draw });
  const pp = (v: V3) => { const r = P(v); return [r[0], r[1]] as [number, number]; };
  const depth = (v: V3) => P(v)[2];
  add2(depth(kneeL), () => { limb(ctx, pp(hip), pp(kneeL), 12, SUIT_DARK); limb(ctx, pp(kneeL), pp(footL), 11, SUIT_DARK); });
  add2(depth(kneeR), () => { limb(ctx, pp(hip), pp(kneeR), 12, SUIT_DARK); limb(ctx, pp(kneeR), pp(footR), 11, SUIT_DARK); });
  // backpack (behind = negative y)
  const pack: V3 = [0, -0.22, 1.35 + bob];
  add2(depth(pack), () => {
    const p = pp(pack);
    ctx.fillStyle = lgrad(ctx, p[0] - 10, p[1] - 12, p[0] + 10, p[1] + 12, [[0, '#7a7a70'], [1, '#3a3a34']]);
    rrect(ctx, p[0] - 15, p[1] - 17, 30, 32, 6); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
  });
  add2(depth(chest), () => {
    const h = pp(hip), ch = pp(chest);
    const a = pp(shL), b = pp(shR);
    ctx.fillStyle = lgrad(ctx, a[0], a[1], b[0], h[1], [[0, sh(armor, 1.25)], [1, sh(armor, 0.6)]]);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(h[0] + (b[0] - a[0]) * 0.32, h[1]); ctx.lineTo(h[0] - (b[0] - a[0]) * 0.32, h[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = sh(armor, 0.5); ctx.fillRect(ch[0] - 7, ch[1] + 2, 14, 3);
  });
  add2(depth(elL) + 0.05, () => { limb(ctx, pp(shL), pp(elL), 10, armor); limb(ctx, pp(elL), pp(handL), 8, armor); });
  add2(depth(elR) + 0.05, () => {
    limb(ctx, pp(shR), pp(elR), 10, armor); limb(ctx, pp(elR), pp(handR), 8, armor);
    if (mode === 'mine') { const hr = pp(handR); const tip = pp([handR[0] + 0.05, handR[1] + 0.35, handR[2] + 0.3]); ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hr[0], hr[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke(); ctx.strokeStyle = '#999'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(tip[0] - 6, tip[1] + 2); ctx.lineTo(tip[0] + 6, tip[1] - 2); ctx.stroke(); }
    if (mode === 'shoot') { const hr = pp(handR); const tip = pp([handR[0], handR[1] + 0.5, handR[2]]); ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(hr[0], hr[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke(); }
  });
  add2(depth(head) + 0.1, () => {
    const h = pp(head);
    ctx.fillStyle = rgrad(ctx, h[0] - 3, h[1] - 4, 1, 11, [[0, '#d0d0c8'], [0.6, '#8a8a84'], [1, '#3a3a36']]);
    ctx.beginPath(); ctx.arc(h[0], h[1], 12, 0, 6.3); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    // visor in facing direction
    const v = P([0, 0.12, head[2]]);
    if (v[2] > depth(head)) { ctx.fillStyle = '#1a2a3a'; ellipse(ctx, (v[0] + h[0] * 2) / 3, h[1] + 1, 8, 4.5); ctx.fill(); ctx.fillStyle = 'rgba(160,220,255,0.6)'; ellipse(ctx, (v[0] + h[0] * 2) / 3 - 3, h[1], 3, 1.5); ctx.fill(); }
  });
  parts.sort((a, b) => a.z - b.z);
  for (const p of parts) p.draw();
  return c;
}
export const CHAR_FRAMES = 8;
export function buildCharacter() {
  const armors: [string, RGB][] = [['', SUIT], ['-heavy', [130, 130, 125]], ['-power', [90, 110, 130]]];
  for (const [suffix, col] of armors) {
    for (let d = 0; d < 8; d++) {
      for (let f = 0; f < CHAR_FRAMES; f++) {
        const c = drawCharacter(d, f / CHAR_FRAMES, 'run', col);
        addRaw(`char${suffix}-run-${d}-${f}`, c, 0, -0.875);
      }
      addRaw(`char${suffix}-idle-${d}`, drawCharacter(d, 0, 'idle', col), 0, -0.875);
      for (let f = 0; f < 4; f++) addRaw(`char${suffix}-mine-${d}-${f}`, drawCharacter(d, f / 4, 'mine', col), 0, -0.875);
      addRaw(`char${suffix}-shoot-${d}`, drawCharacter(d, 0, 'shoot', col), 0, -0.875);
    }
  }
  // corpse marker
  const [c, ctx] = mkc(64, 40);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(ctx, 34, 26, 26, 10); ctx.fill();
  ctx.fillStyle = css(SUIT_DARK); ellipse(ctx, 32, 22, 22, 9); ctx.fill();
  ctx.fillStyle = '#7a7a70'; rrect(ctx, 24, 14, 16, 12, 3); ctx.fill();
  addRaw('character-corpse', c);
}

// ---------- Biters / spitters (3D-ish bugs) ----------
function drawBug(dir: number, phase: number, spitter: boolean, attack: boolean): HTMLCanvasElement {
  const [c, ctx] = mkc(112, 112);
  const yaw = -dir / 16 * Math.PI * 2;
  const s = 30, ox = 56, oy = 66;
  const t = phase * Math.PI * 2;
  const P = (v: V3) => proj(v, yaw, s, ox, oy);
  const pp = (v: V3) => { const r = P(v); return [r[0], r[1]] as [number, number]; };
  const body: RGB = [210, 200, 190];
  const lunge = attack ? Math.max(0, Math.sin(t)) * 0.35 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(ctx, ox + 4, oy + 4, 30, 12); ctx.fill();
  const parts: { z: number; draw: () => void }[] = [];
  // legs
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const k = i % 3;
    const ph = t + (k + (side > 0 ? 0.5 : 0)) * Math.PI * 0.66;
    const baseY = 0.3 - k * 0.3;
    const root: V3 = [side * 0.15, baseY, 0.42];
    const knee: V3 = [side * 0.62, baseY + Math.sin(ph) * 0.18, 0.62 + Math.max(0, Math.cos(ph)) * 0.12];
    const foot: V3 = [side * 0.85, baseY + Math.sin(ph) * 0.35 + (k - 1) * 0.15, Math.max(0, Math.cos(ph)) * 0.12];
    parts.push({ z: P(knee)[2] - 0.5, draw: () => { limb(ctx, pp(root), pp(knee), 4, shade(body, 0.55)); limb(ctx, pp(knee), pp(foot), 3, shade(body, 0.5)); } });
  }
  const segs: [V3, number, number][] = spitter
    ? [[[0, -0.55, 0.6], 0.36, 0.95], [[0, -0.05, 0.62], 0.3, 1.0], [[0, 0.42 + lunge, 0.7], 0.26, 1.05]]
    : [[[0, -0.6, 0.55], 0.42, 0.9], [[0, -0.05, 0.6], 0.3, 1.0], [[0, 0.45 + lunge, 0.62], 0.27, 1.1]];
  segs.forEach(([p, r, k], i) => {
    parts.push({ z: P(p)[2], draw: () => {
      const q = pp(p);
      const rr = r * s;
      ctx.fillStyle = rgrad(ctx, q[0] - rr * 0.35, q[1] - rr * 0.45, 1, rr * 1.2, [[0, sh(body, 1.15 * k)], [0.6, sh(body, 0.8 * k)], [1, sh(body, 0.35)]]);
      ellipse(ctx, q[0], q[1], rr, rr * 0.82); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      if (i === 0) { ctx.strokeStyle = sh(body, 0.5, 0.6); for (let j = 1; j < 4; j++) { ellipse(ctx, q[0], q[1], rr * j / 4, rr * 0.82 * j / 4); ctx.stroke(); } }
      if (i === 2) {
        // mandibles / spitting snout
        const m1 = pp([p[0] - 0.12, p[1] + 0.3, p[2] - 0.05]), m2 = pp([p[0] + 0.12, p[1] + 0.3, p[2] - 0.05]);
        ctx.strokeStyle = spitter ? '#7a9a30' : '#3a2a20'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(q[0] - 4, q[1]); ctx.lineTo(m1[0], m1[1]); ctx.moveTo(q[0] + 4, q[1]); ctx.lineTo(m2[0], m2[1]); ctx.stroke();
      }
    } });
  });
  parts.sort((a, b) => a.z - b.z);
  for (const p of parts) p.draw();
  return c;
}
export const BUG_DIRS = 16, BUG_FRAMES = 8;
export function buildEnemies() {
  for (const kind of ['biter', 'spitter']) {
    for (let d = 0; d < BUG_DIRS; d++) {
      for (let f = 0; f < BUG_FRAMES; f++) addRaw(`${kind}-run-${d}-${f}`, drawBug(d, f / BUG_FRAMES, kind === 'spitter', false));
      for (let f = 0; f < 4; f++) addRaw(`${kind}-attack-${d}-${f}`, drawBug(d, f / 4, kind === 'spitter', true));
    }
    // corpse
    const [c, ctx] = mkc(96, 64);
    ctx.fillStyle = 'rgba(40,60,20,0.5)'; ellipse(ctx, 48, 34, 40, 20); ctx.fill();
    ctx.fillStyle = '#6a6058'; ellipse(ctx, 48, 30, 28, 12); ctx.fill();
    ctx.strokeStyle = '#3a3430'; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(48, 30); ctx.lineTo(48 + Math.cos(i) * 36, 30 + Math.sin(i) * 16); ctx.stroke(); }
    addRaw(`${kind}-corpse`, c);
  }
  // spawner (5x5-ish visual)
  for (const kind of ['biter-spawner', 'spitter-spawner']) {
    for (let v = 0; v < 2; v++) {
      const f = frame(5, 5, 0.6, 0.3, 0.3);
      const { ctx, x0, y0 } = f;
      const R = new RNG(6000 + v + (kind.length * 3));
      const cx = x0 + 160, cy = y0 + 160;
      const flesh: RGB = kind === 'biter-spawner' ? [150, 110, 90] : [140, 120, 80];
      ctx.fillStyle = 'rgba(30,20,10,0.4)'; ellipse(ctx, cx, cy + 20, 150, 110); ctx.fill();
      for (let i = 0; i < 12; i++) {
        const a = R.next() * 6.3, d = R.range(10, 90);
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.7;
        const r = R.range(40, 70);
        ctx.fillStyle = rgrad(ctx, x - r * 0.3, y - r * 0.4, 2, r, [[0, sh(flesh, 1.2)], [0.6, sh(flesh, 0.75)], [1, sh(flesh, 0.35)]]);
        ellipse(ctx, x, y, r, r * 0.75); ctx.fill();
      }
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * 6.3 + R.next(), d = R.range(40, 90);
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.7;
        ctx.fillStyle = '#1a0e08'; ellipse(ctx, x, y, R.range(14, 24), R.range(10, 16)); ctx.fill();
        ctx.fillStyle = 'rgba(200,120,60,0.25)'; ellipse(ctx, x, y - 3, 10, 5); ctx.fill();
      }
      // tentacle spikes
      for (let i = 0; i < 9; i++) {
        const a = R.next() * 6.3, d = R.range(60, 120);
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.7;
        ctx.strokeStyle = sh(flesh, 0.6); ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + R.range(-20, 20), y - 30, x + R.range(-30, 30), y - R.range(40, 70)); ctx.stroke();
      }
      grain(ctx, f.W, f.H, 0.1, 6000 + v);
      add(`${kind}-${v}`, f, { dx: 12, dy: 4, alpha: 0.6 });
    }
  }
  // worm
  for (let f = 0; f < 8; f++) {
    const [c, ctx] = mkc(96, 160);
    const sway = Math.sin(f / 8 * 6.3) * 8;
    ctx.fillStyle = 'rgba(30,20,10,0.4)'; ellipse(ctx, 48, 140, 36, 14); ctx.fill();
    ctx.fillStyle = '#4a3a2a'; ellipse(ctx, 48, 136, 30, 12); ctx.fill();
    for (let i = 0; i < 10; i++) {
      const tt = i / 10;
      const x = 48 + Math.sin(tt * 3 + f) * 4 + sway * tt, y = 134 - tt * 100;
      const r = 18 - tt * 6;
      ctx.fillStyle = rgrad(ctx, x - r * 0.3, y - r * 0.3, 1, r, [[0, '#e8d8c8'], [1, '#6a5a4a']]);
      ellipse(ctx, x, y, r, r * 0.8); ctx.fill();
    }
    const hx = 48 + sway, hy = 30;
    ctx.fillStyle = '#5a2a20'; ellipse(ctx, hx, hy, 16, 10); ctx.fill();
    ctx.fillStyle = '#c87050'; for (let i = 0; i < 5; i++) { const a = i / 5 * 6.3; poly(ctx, [[hx + Math.cos(a) * 10, hy + Math.sin(a) * 6], [hx + Math.cos(a) * 22, hy + Math.sin(a) * 14 - 6], [hx + Math.cos(a + 0.3) * 10, hy + Math.sin(a + 0.3) * 6]]); ctx.fill(); }
    addRaw(`worm-${f}`, c, 0, -0.75);
  }
}

// ---------- Military structures ----------
export function buildMilitary() {
  // walls (mask: N1 E2 S4 W8)
  for (let mask = 0; mask < 16; mask++) {
    const f = frame(1, 1, 0.6, 0.15, 0.1);
    const { ctx, x0, y0 } = f;
    const col: RGB = [170, 168, 160];
    const ext = (m: number, a: number, b: number) => (mask & m ? a : b);
    const l = x0 + ext(8, 0, 6), r = x0 + ext(2, 64, 58), t = y0 + ext(1, -10, 0), btm = y0 + ext(4, 64, 50);
    box(ctx, l, t - 20, r - l, btm - t, 24, col, { r: 3, outline: false });
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
    for (let yy = t - 14; yy < btm - 20; yy += 12) { ctx.beginPath(); ctx.moveTo(l + 2, yy); ctx.lineTo(r - 2, yy); ctx.stroke(); }
    grain(ctx, f.W, f.H, 0.08, 7000 + mask);
    add(`wall-${mask}`, f, { dx: 10, dy: 2, k: 0.25 });
  }
  for (const v of ['h', 'v']) for (const open of [0, 1]) {
    const f = frame(1, 1, 0.6, 0.15, 0.1);
    const { ctx, x0, y0 } = f;
    const col: RGB = [150, 150, 146];
    if (!open) {
      box(ctx, x0, y0 - 20, 64, 54, 24, col, { r: 3 });
      stripes(ctx, x0 + 4, y0 + 36, 56, 8, 6, '#d0a020', '#222');
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x0 + 2, y0 + 10, 60, 44);
      if (v === 'h') { box(ctx, x0, y0 - 6, 10, 54, 12, col, { r: 2 }); box(ctx, x0 + 54, y0 - 6, 10, 54, 12, col, { r: 2 }); }
      else { box(ctx, x0 + 4, y0 - 6, 56, 10, 12, col, { r: 2 }); box(ctx, x0 + 4, y0 + 46, 56, 10, 12, col, { r: 2 }); }
    }
    add(`gate-${v}-${open}`, f, { dx: 8, dy: 2 });
  }
  // gun turret base + head
  {
    const f = frame(2, 2, 0.5, 0.25, 0.25);
    const { ctx, x0, y0 } = f;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(ctx, x0 + 66, y0 + 76, 60, 44); ctx.fill();
    ctx.fillStyle = vgrad(ctx, y0 + 20, y0 + 120, [[0, '#9a9a90'], [1, '#4a4a44']]);
    poly(ctx, [[x0 + 20, y0 + 30], [x0 + 108, y0 + 30], [x0 + 124, y0 + 70], [x0 + 108, y0 + 118], [x0 + 20, y0 + 118], [x0 + 4, y0 + 70]]); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#3a3a36'; ellipse(ctx, x0 + 64, y0 + 64, 40, 30); ctx.fill();
    add('gun-turret-base', f, { dx: 10, dy: 3 });
    const [c, h] = mkc(128, 96);
    h.fillStyle = 'rgba(0,0,0,0)';
    h.fillStyle = rgrad(h, 54, 40, 4, 40, [[0, '#d8b860'], [0.6, '#a08030'], [1, '#4a3a10']]);
    rrect(h, 26, 18, 56, 60, 14); h.fill(); h.strokeStyle = 'rgba(0,0,0,0.6)'; h.lineWidth = 1.5; h.stroke();
    for (const yy of [36, 48, 60]) { h.fillStyle = vgrad(h, yy - 3, yy + 3, [[0, '#9a9a94'], [1, '#3a3a36']]); h.fillRect(78, yy - 3, 46, 6); }
    h.fillStyle = '#5a4a20'; h.fillRect(32, 28, 30, 6);
    addRaw('gun-turret-head', c, 0.35, 0);
  }
  // laser turret
  {
    const f = frame(2, 2, 0.5, 0.25, 0.25);
    const { ctx, x0, y0 } = f;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(ctx, x0 + 66, y0 + 76, 60, 44); ctx.fill();
    box(ctx, x0 + 10, y0 + 22, 108, 80, 18, [100, 100, 104], { r: 16 });
    ctx.fillStyle = '#2a2a2e'; ellipse(ctx, x0 + 64, y0 + 60, 36, 26); ctx.fill();
    add('laser-turret-base', f, { dx: 10, dy: 3 });
    const [c, h] = mkc(128, 96);
    h.fillStyle = rgrad(h, 50, 40, 4, 40, [[0, '#c8c8d0'], [0.6, '#7a7a84'], [1, '#2a2a30']]);
    rrect(h, 24, 20, 60, 56, 20); h.fill(); h.strokeStyle = 'rgba(0,0,0,0.6)'; h.stroke();
    h.fillStyle = vgrad(h, 42, 54, [[0, '#9a9aa4'], [1, '#3a3a40']]); h.fillRect(80, 42, 40, 12);
    h.fillStyle = '#ff3030'; h.beginPath(); h.arc(118, 48, 4, 0, 6.3); h.fill();
    addRaw('laser-turret-head', c, 0.35, 0);
  }
  // flamethrower turret (2x3)
  for (let d = 0; d < 4; d++) {
    const horiz = d % 2 === 1;
    const f = horiz ? frame(3, 2, 0.5, 0.25, 0.25) : frame(2, 3, 0.5, 0.25, 0.25);
    const { ctx, x0, y0 } = f;
    const W = horiz ? 192 : 128, H = horiz ? 128 : 192;
    box(ctx, x0 + 10, y0 + 14, W - 20, H - 36, 18, [110, 100, 92], { r: 12 });
    cylinder(ctx, x0 + W / 2, y0 + H / 2 - 30, 26, 12, 24, [150, 60, 40]);
    add(`flamethrower-turret-${d}`, f, { dx: 10, dy: 3 });
  }
  {
    const [c, h] = mkc(112, 64);
    h.fillStyle = vgrad(h, 20, 44, [[0, '#9a9a94'], [1, '#3a3a36']]); h.fillRect(40, 24, 66, 14);
    h.fillStyle = rgrad(h, 36, 30, 2, 28, [[0, '#c87050'], [1, '#5a2010']]); h.beginPath(); h.arc(36, 32, 24, 0, 6.3); h.fill();
    addRaw('flamethrower-turret-head', c, 0.25, 0);
  }
  // artillery turret
  {
    const f = frame(3, 3, 0.5, 0.3, 0.3);
    box(f.ctx, f.x0 + 10, f.y0 + 14, 172, 150, 24, [100, 104, 96], { r: 20 });
    f.ctx.fillStyle = '#3a3a36'; f.ctx.beginPath(); f.ctx.arc(f.x0 + 96, f.y0 + 80, 50, 0, 6.3); f.ctx.fill();
    add('artillery-turret-base', f, { dx: 14, dy: 4 });
    const [c, h] = mkc(256, 96);
    h.fillStyle = vgrad(h, 36, 60, [[0, '#a0a49a'], [1, '#3a3e36']]); h.fillRect(80, 38, 170, 20);
    h.fillStyle = rgrad(h, 70, 44, 4, 50, [[0, '#a8ac9e'], [1, '#3a3e34']]); rrect(h, 30, 16, 90, 64, 18); h.fill();
    addRaw('artillery-turret-head', c, 0.9, 0);
  }
  // land mine
  {
    const [c, ctx] = mkc(40, 30);
    ctx.fillStyle = rgrad(ctx, 18, 12, 2, 18, [[0, '#7a7a70'], [1, '#2a2a26']]); ellipse(ctx, 20, 15, 16, 10); ctx.fill();
    ctx.fillStyle = '#c03020'; ctx.beginPath(); ctx.arc(20, 13, 3, 0, 6.3); ctx.fill();
    addRaw('land-mine', c);
  }
}

// ---------- Vehicles (top-down, pointing north) ----------
export function buildVehicles() {
  const car = (w: number, h: number, col: RGB, name: string, extra?: (ctx: Ctx) => void) => {
    const [c, ctx] = mkc(w + 16, h + 16);
    ctx.translate(8, 8);
    ctx.fillStyle = '#1a1a18';
    for (const [x, y] of [[0, h * 0.14], [w - 10, h * 0.14], [0, h * 0.68], [w - 10, h * 0.68]]) rrect(ctx, x - 2, y, 12, h * 0.2, 3), ctx.fill();
    ctx.fillStyle = lgrad(ctx, 0, 0, w, h, [[0, sh(col, 1.3)], [0.5, css(col)], [1, sh(col, 0.55)]]);
    rrect(ctx, 4, 0, w - 8, h, 12); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(30,40,50,0.85)'; rrect(ctx, 10, h * 0.25, w - 20, h * 0.18, 5); ctx.fill();
    ctx.fillStyle = sh(col, 0.7); rrect(ctx, 10, h * 0.48, w - 20, h * 0.36, 6); ctx.fill();
    ctx.fillStyle = '#ffe8a0'; ctx.fillRect(10, 2, 8, 4); ctx.fillRect(w - 18, 2, 8, 4);
    if (extra) extra(ctx);
    addRaw(name, c);
    A.add(name + '-shadow', makeShadowAt(c, 10, 6, 0, 0, 0.8), 0, 0);
  };
  car(80, 128, [180, 60, 40], 'car');
  car(140, 190, [110, 120, 80], 'tank', ctx => { ctx.fillStyle = '#2a2a24'; ctx.fillRect(0, 0, 14, 190); ctx.fillRect(126, 0, 14, 190); });
  const [tc, t] = mkc(100, 200);
  t.fillStyle = vgrad(t, 0, 200, [[0, '#8a9468'], [1, '#4a5432']]); t.fillRect(44, 0, 12, 110);
  t.fillStyle = rgrad(t, 46, 130, 4, 50, [[0, '#9aa478'], [1, '#3a4426']]); t.beginPath(); t.arc(50, 140, 42, 0, 6.3); t.fill(); t.strokeStyle = 'rgba(0,0,0,0.6)'; t.stroke();
  addRaw('tank-turret', tc, 0, -0.62);
  // trains (2x6 tiles; length 7 tiles visual), pointing north
  const train = (name: string, col: RGB, draw: (ctx: Ctx, w: number, h: number) => void) => {
    const w = 120, h = 420;
    const [c, ctx] = mkc(w + 20, h + 20);
    ctx.translate(10, 10);
    ctx.fillStyle = '#1a1a18'; for (const y of [30, 70, 330, 370]) { ctx.fillRect(10, y, 14, 30); ctx.fillRect(96, y, 14, 30); }
    draw(ctx, w, h);
    addRaw(name, c);
    A.add(name + '-shadow', makeShadowAt(c, 12, 8, 0, 0, 0.8), 0, 0);
  };
  train('locomotive', [190, 50, 40], (ctx, w, h) => {
    ctx.fillStyle = lgrad(ctx, 0, 0, w, 0, [[0, '#7a2a20'], [0.4, '#d85a46'], [1, '#6a2018']]);
    poly(ctx, [[20, 30], [100, 30], [110, 60], [110, 400], [10, 400], [10, 60]]); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#3a3a36'; rrect(ctx, 22, 70, 76, 80, 6); ctx.fill();
    ctx.fillStyle = 'rgba(40,60,80,0.9)'; rrect(ctx, 28, 76, 64, 26, 4); ctx.fill();
    vents(ctx, 24, 180, 72, 180, 12, [120, 40, 30]);
    ctx.fillStyle = '#ffe8a0'; ctx.fillRect(30, 30, 14, 6); ctx.fillRect(76, 30, 14, 6);
  });
  train('cargo-wagon', [140, 110, 70], (ctx, w, h) => {
    ctx.fillStyle = lgrad(ctx, 0, 0, w, 0, [[0, '#5a4a30'], [0.4, '#a08860'], [1, '#4a3a22']]);
    rrect(ctx, 10, 20, 100, 380, 8); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; for (let y = 50; y < 400; y += 40) { ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(108, y); ctx.stroke(); }
  });
  train('fluid-wagon', [120, 130, 140], (ctx, w, h) => {
    ctx.fillStyle = '#4a4a46'; rrect(ctx, 10, 20, 100, 380, 8); ctx.fill();
    for (let i = 0; i < 3; i++) { ctx.fillStyle = lgrad(ctx, 0, 0, w, 0, [[0, '#5a6a74'], [0.4, '#b0c0c8'], [1, '#4a5a64']]); rrect(ctx, 14, 30 + i * 124, 92, 112, 40); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke(); }
  });
  train('artillery-wagon', [110, 120, 90], (ctx, w, h) => {
    ctx.fillStyle = lgrad(ctx, 0, 0, w, 0, [[0, '#4a5432'], [0.4, '#8a9468'], [1, '#3a4426']]); rrect(ctx, 10, 20, 100, 380, 8); ctx.fill();
    ctx.fillStyle = '#3a3e34'; ctx.beginPath(); ctx.arc(60, 210, 46, 0, 6.3); ctx.fill();
  });
}

// ---------- Rails / train stop / signals ----------
export function buildRailParts() {
  const [tc, t] = mkc(80, 14);
  t.fillStyle = vgrad(t, 0, 14, [[0, '#7a6a58'], [1, '#3a2e22']]); rrect(t, 0, 2, 80, 10, 2); t.fill();
  t.strokeStyle = 'rgba(0,0,0,0.5)'; t.lineWidth = 1; t.stroke();
  addRaw('rail-tie', tc);
  const [rc, r] = mkc(16, 8);
  r.fillStyle = vgrad(r, 0, 8, [[0, '#d8dcdc'], [0.4, '#8a9090'], [1, '#3a3e3e']]); r.fillRect(0, 0, 16, 8);
  addRaw('rail-steel', rc);
  const [bc, b] = mkc(32, 32);
  const R = new RNG(77);
  b.fillStyle = '#5a5650'; b.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 120; i++) { b.fillStyle = `rgba(${140 + R.next() * 60 | 0},${130 + R.next() * 50 | 0},${110 + R.next() * 40 | 0},0.7)`; b.fillRect(R.next() * 32, R.next() * 32, 2, 2); }
  addRaw('rail-bed', bc);
  // train stop
  for (let d = 0; d < 4; d++) {
    const f = frame(2, 2, 1.6, 0.2, 0.3);
    const { ctx, x0, y0 } = f;
    box(ctx, x0 + 8, y0 + 40, 112, 70, 12, [130, 126, 118], { r: 6 });
    cylinder(ctx, x0 + 30, y0 - 70, 6, 3, 120, [90, 90, 88]);
    ctx.fillStyle = '#c03020'; rrect(ctx, x0 + 10, y0 - 90, 70, 26, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('STOP', x0 + 24, y0 - 72);
    add(`train-stop-${d}`, f, { k: 0.5, alpha: 0.7 });
  }
  for (const kind of ['rail-signal', 'rail-chain-signal']) {
    const f = frame(1, 1, 0.9, 0.15, 0.15);
    const { ctx, x0, y0 } = f;
    cylinder(ctx, x0 + 32, y0 - 20, 4, 2, 56, [80, 80, 78]);
    ctx.fillStyle = '#1a1a18'; rrect(ctx, x0 + 22, y0 - 52, 20, kind === 'rail-signal' ? 40 : 52, 5); ctx.fill();
    add(kind, f, { k: 0.5, alpha: 0.7 });
  }
}

// ---------- Effects ----------
export function buildEffects() {
  for (let i = 0; i < 12; i++) {
    const [c, ctx] = mkc(128, 128);
    const t = i / 12;
    const R = new RNG(8000 + i);
    for (let k = 0; k < 14; k++) {
      const a = R.next() * 6.3, d = t * 40 * R.next();
      const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d * 0.8;
      const r = 14 + t * 30 * R.range(0.6, 1.2);
      const fire = 1 - t;
      ctx.fillStyle = rgrad(ctx, x, y, 0, r, [[0, `rgba(${255},${200 * fire + 40 | 0},${80 * fire | 0},${0.9 * (1 - t * 0.6)})`], [0.6, `rgba(${180 * fire + 50 | 0},${80 * fire + 40 | 0},${30},${0.6 * (1 - t * 0.5)})`], [1, 'rgba(40,30,20,0)']]);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
    }
    addRaw(`explosion-${i}`, c);
  }
  const [sc, s] = mkc(64, 64); s.fillStyle = rgrad(s, 32, 32, 2, 32, [[0, 'rgba(200,200,200,0.7)'], [1, 'rgba(160,160,160,0)']]); s.fillRect(0, 0, 64, 64); addRaw('smoke', sc);
  const [ac, a] = mkc(64, 64); a.fillStyle = rgrad(a, 32, 32, 2, 32, [[0, 'rgba(160,230,60,0.85)'], [1, 'rgba(80,160,20,0)']]); a.fillRect(0, 0, 64, 64); addRaw('acid', ac);
  const [bc, b] = mkc(40, 20); b.fillStyle = 'rgba(40,80,20,0.7)'; ellipse(b, 20, 10, 18, 8); b.fill(); addRaw('blood', bc);
  const [rc, r] = mkc(256, 192);
  const RR = new RNG(9000);
  for (let i = 0; i < 40; i++) { const x = RR.range(30, 226), y = RR.range(30, 162); r.fillStyle = `rgba(${60 + RR.next() * 50 | 0},${55 + RR.next() * 40 | 0},${50 + RR.next() * 30 | 0},0.9)`; poly(r, [[x, y], [x + RR.range(4, 16), y + RR.range(-6, 6)], [x + RR.range(0, 12), y + RR.range(4, 14)]]); r.fill(); }
  r.fillStyle = 'rgba(20,16,12,0.35)'; ellipse(r, 128, 96, 110, 80); r.fill();
  addRaw('remnants', rc);
  const [fc, f] = mkc(32, 8); f.fillStyle = hgrad(f, 0, 32, [[0, 'rgba(255,230,140,0)'], [1, 'rgba(255,240,180,1)']]); f.fillRect(0, 2, 32, 4); addRaw('tracer', fc);
  const [lc, l] = mkc(32, 12); l.fillStyle = vgrad(l, 0, 12, [[0, 'rgba(255,60,40,0)'], [0.5, 'rgba(255,200,180,1)'], [1, 'rgba(255,60,40,0)']]); l.fillRect(0, 0, 32, 12); addRaw('laser-beam', lc);
  const [pc, p] = mkc(24, 10); p.fillStyle = '#ddd'; rrect(p, 0, 2, 20, 6, 3); p.fill(); p.fillStyle = '#f80'; p.fillRect(20, 3, 4, 4); addRaw('rocket-projectile', pc);
  const [gc, g] = mkc(16, 16); g.fillStyle = '#3a4a2a'; g.beginPath(); g.arc(8, 8, 6, 0, 6.3); g.fill(); addRaw('grenade-projectile', gc);
  const [mc, m] = mkc(24, 24); m.fillStyle = rgrad(m, 12, 12, 1, 12, [[0, 'rgba(255,255,200,1)'], [1, 'rgba(255,160,40,0)']]); m.fillRect(0, 0, 24, 24); addRaw('muzzle', mc);
  // flying robots
  for (const [name, col] of [['logistic-robot', [200, 160, 60]], ['construction-robot', [220, 140, 40]], ['defender', [200, 160, 40]], ['distractor', [200, 80, 40]], ['destroyer', [150, 50, 160]]] as [string, RGB][]) {
    const [c, ctx] = mkc(48, 40);
    ctx.fillStyle = rgrad(ctx, 20, 16, 1, 20, [[0, sh(col, 1.4)], [1, sh(col, 0.5)]]); rrect(ctx, 12, 10, 24, 18, 6); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
    ctx.fillStyle = '#ccc'; ellipse(ctx, 8, 14, 7, 2); ctx.fill(); ellipse(ctx, 40, 14, 7, 2); ctx.fill();
    ctx.fillStyle = '#222'; rrect(ctx, 18, 14, 12, 5, 2); ctx.fill();
    addRaw(name + '-fly', c);
  }
}

// ---------- UI-in-world overlays ----------
export function buildOverlays() {
  const [cc, c] = mkc(24, 24);
  c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 6; c.lineCap = 'square';
  c.beginPath(); c.moveTo(3, 20); c.lineTo(3, 3); c.lineTo(20, 3); c.stroke();
  c.strokeStyle = '#ffe24a'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(3, 20); c.lineTo(3, 3); c.lineTo(20, 3); c.stroke();
  addRaw('select-corner', cc);
  const [ar, a] = mkc(64, 64);
  a.fillStyle = 'rgba(255,255,255,0.9)'; poly(a, [[32, 6], [54, 32], [40, 32], [40, 58], [24, 58], [24, 32], [10, 32]]); a.fill();
  a.strokeStyle = 'rgba(0,0,0,0.5)'; a.lineWidth = 2; a.stroke();
  addRaw('arrow', ar);
  const [sa, s] = mkc(32, 32);
  s.fillStyle = 'rgba(255,255,255,0.95)'; poly(s, [[16, 2], [30, 18], [21, 18], [21, 30], [11, 30], [11, 18], [2, 18]]); s.fill();
  addRaw('arrow-small', sa);
  const [bg, b] = mkc(64, 64); b.fillStyle = 'rgba(20,20,20,0.75)'; b.beginPath(); b.arc(32, 32, 30, 0, 6.3); b.fill(); addRaw('alt-bg', bg);
  const icon = (name: string, draw: (ctx: Ctx) => void) => { const [ic, ctx] = mkc(64, 64); draw(ctx); addRaw(name, ic); };
  const bolt = (col: string) => (ctx: Ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(32, 32, 30, 0, 6.3); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(32, 32, 27, 0, 6.3); ctx.stroke();
    ctx.fillStyle = col; poly(ctx, [[36, 8], [18, 36], [30, 36], [26, 56], [46, 26], [34, 26]]); ctx.fill();
  };
  icon('warn-no-power', bolt('#ff3a2a'));
  icon('warn-low-power', bolt('#ffd02a'));
  icon('warn-no-fuel', ctx => {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(32, 32, 30, 0, 6.3); ctx.fill();
    ctx.strokeStyle = '#ff3a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(32, 32, 27, 0, 6.3); ctx.stroke();
    ctx.fillStyle = '#ff9a2a'; ctx.beginPath(); ctx.moveTo(32, 10); ctx.quadraticCurveTo(48, 30, 42, 46); ctx.quadraticCurveTo(32, 56, 22, 46); ctx.quadraticCurveTo(16, 30, 32, 10); ctx.fill();
  });
  icon('warn-generic', ctx => {
    ctx.fillStyle = '#ffd02a'; poly(ctx, [[32, 6], [60, 56], [4, 56]]); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#000'; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 32, 52);
  });
  icon('warn-no-ammo', ctx => {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(32, 32, 30, 0, 6.3); ctx.fill();
    ctx.strokeStyle = '#ff3a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(32, 32, 27, 0, 6.3); ctx.stroke();
    ctx.fillStyle = '#e8c070'; for (let i = 0; i < 3; i++) rrect(ctx, 20 + i * 9, 16, 7, 30, 3), ctx.fill();
  });
  icon('warn-no-recipe', ctx => {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(32, 32, 30, 0, 6.3); ctx.fill();
    ctx.strokeStyle = '#ffd02a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(32, 32, 27, 0, 6.3); ctx.stroke();
    ctx.fillStyle = '#ffd02a'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', 32, 45);
  });
  icon('warn-destroyed', ctx => { ctx.fillStyle = '#ff3a2a'; poly(ctx, [[32, 6], [60, 56], [4, 56]]); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 32, 52); });
  // ghost hatching / range tile
  const [rt, r] = mkc(16, 16); r.fillStyle = '#fff'; r.fillRect(0, 0, 16, 16); addRaw('tile-fill', rt);
  const [cc2, c2] = mkc(64, 64); c2.strokeStyle = '#fff'; c2.lineWidth = 2; c2.setLineDash([6, 6]); c2.strokeRect(2, 2, 60, 60); addRaw('dashed-box', cc2);
}
