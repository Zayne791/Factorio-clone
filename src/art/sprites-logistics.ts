// Logistics entity sprites: chests, belts, undergrounds, splitters, inserters, poles, pipes, pumps.
import { mkc, hex, css, sh, shade, mix, rrect, vgrad, hgrad, lgrad, rgrad, box, rivet, gear, grain, ellipse, poly, glow, cylinder, vents, RGB, Ctx, YELLOW, RED, BLUE, GREEN, METAL } from './draw';
import { frame, add, addRaw, PX, A } from './sprites-common';
import { RNG } from '../engine/noise';

export const BELT_RAIL: Record<number, RGB> = { 1: [214, 160, 36], 2: [200, 56, 40], 3: [56, 140, 200] };
export const BELT_FRAMES = 16;

function rubber(ctx: Ctx, w: number, h: number) {
  ctx.fillStyle = '#2d2c29'; ctx.fillRect(0, 0, w, h);
}
// Straight belt pointing north, frame f (pattern moves toward -y)
function beltStraight(tier: number, f: number, half: 'full' | 'top' | 'bottom' = 'full'): HTMLCanvasElement {
  const [c, ctx] = mkc(PX, PX);
  const rail = BELT_RAIL[tier];
  const y0 = half === 'bottom' ? 32 : 0, y1 = half === 'top' ? 32 : 64;
  ctx.save(); ctx.beginPath(); ctx.rect(0, y0, 64, y1 - y0); ctx.clip();
  ctx.fillStyle = '#262522'; ctx.fillRect(8, 0, 48, 64);
  for (let k = -1; k < 6; k++) {
    const y = ((k * 16 - f) % 64 + 64) % 64;
    ctx.fillStyle = '#45433e'; ctx.fillRect(9, y, 46, 7);
    ctx.fillStyle = '#58554e'; ctx.fillRect(9, y, 46, 2);
    ctx.fillStyle = '#1a1917'; ctx.fillRect(9, y + 7, 46, 2);
  }
  // side shadows on rubber
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(9, 0, 4, 64); ctx.fillRect(51, 0, 4, 64);
  for (const x of [2, 55]) {
    ctx.fillStyle = hgrad(ctx, x, x + 7, [[0, sh(rail, 0.45)], [0.3, sh(rail, 1.25)], [0.6, sh(rail, 0.95)], [1, sh(rail, 0.4)]]);
    ctx.fillRect(x, 0, 7, 64);
    ctx.fillStyle = sh(rail, 0.3);
    for (let y = 0; y < 64; y += 16) ctx.fillRect(x, (y + 8) % 64, 7, 1);
  }
  ctx.restore();
  return c;
}
// Curve: enters from west edge, exits north edge (left turn). Center of curvature = top-left corner.
function beltCurve(tier: number, f: number): HTMLCanvasElement {
  const [c, ctx] = mkc(PX, PX);
  const rail = BELT_RAIL[tier];
  const ann = (r0: number, r1: number) => { ctx.beginPath(); ctx.arc(0, 0, r1, 0, Math.PI / 2); ctx.arc(0, 0, r0, Math.PI / 2, 0, true); ctx.closePath(); };
  ctx.fillStyle = '#262522'; ann(9, 55); ctx.fill();
  ctx.save(); ann(10, 54); ctx.clip();
  const period = (Math.PI / 2) / 4;
  const phase = (f / BELT_FRAMES) * period;
  for (let k = -1; k < 6; k++) {
    const a = k * period + phase;
    for (const [da, col] of [[0, '#45433e'], [0.04, '#58554e']] as [number, string][]) {
      ctx.strokeStyle = col; ctx.lineWidth = da ? 2 : 7;
      const aa = a + da * 0.5;
      ctx.beginPath(); ctx.moveTo(Math.cos(aa) * 9, Math.sin(aa) * 9); ctx.lineTo(Math.cos(aa) * 56, Math.sin(aa) * 56); ctx.stroke();
    }
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ann(10, 14); ctx.fill(); ann(50, 54); ctx.fill();
  for (const [r0, r1] of [[2, 9], [55, 62]]) {
    ctx.fillStyle = rgrad(ctx, 0, 0, r0, r1, [[0, sh(rail, 0.45)], [0.35, sh(rail, 1.2)], [0.7, sh(rail, 0.9)], [1, sh(rail, 0.4)]]);
    ann(r0, r1); ctx.fill();
  }
  return c;
}

export function buildBelts() {
  for (const tier of [1, 2, 3]) {
    for (let f = 0; f < BELT_FRAMES; f++) {
      addRaw(`belt-${tier}-s-${f}`, beltStraight(tier, f));
      addRaw(`belt-${tier}-c-${f}`, beltCurve(tier, f));
      addRaw(`belt-${tier}-h-${f}`, beltStraight(tier, f, 'bottom'), 0, 0);
    }
    buildUnderground(tier);
    buildSplitter(tier);
  }
  // belt end caps (pointing north = end at the north edge)
  for (const tier of [1, 2, 3]) {
    const rail = BELT_RAIL[tier];
    const [c, ctx] = mkc(PX, 24);
    ctx.fillStyle = sh(rail, 0.5); rrect(ctx, 2, 2, 60, 12, 5); ctx.fill();
    ctx.fillStyle = vgrad(ctx, 2, 12, [[0, sh(rail, 1.2)], [1, sh(rail, 0.6)]]); rrect(ctx, 2, 0, 60, 10, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; rrect(ctx, 2.5, 0.5, 59, 12, 5); ctx.stroke();
    addRaw(`belt-${tier}-cap`, c, 0, 0);
  }
}

function buildUnderground(tier: number) {
  const rail = BELT_RAIL[tier];
  for (const kind of ['in', 'out'] as const) {
    for (let d = 0; d < 4; d++) {
      const f = frame(1, 1, 0.5, 0.2, 0.15);
      const { ctx, x0, y0 } = f;
      ctx.save();
      ctx.translate(x0 + 32, y0 + 32); ctx.rotate(d * Math.PI / 2); ctx.translate(-32, -32);
      // hood covers the side where belt dives: 'in' facing north dives at north half.
      const hoodNorth = kind === 'in';
      const hy = hoodNorth ? -6 : 22, hh = 48;
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; rrect(ctx, 0, hy + 4, 64, hh, 6); ctx.fill();
      ctx.fillStyle = lgrad(ctx, 0, hy, 0, hy + hh, [[0, sh(rail, 1.25)], [0.5, sh(rail, 0.95)], [1, sh(rail, 0.55)]]);
      rrect(ctx, 1, hy, 62, hh, 6); ctx.fill();
      // dark mouth toward the visible belt
      ctx.fillStyle = '#121110';
      if (hoodNorth) rrect(ctx, 9, hy + hh - 16, 46, 14, 3); else rrect(ctx, 9, hy + 2, 46, 14, 3);
      ctx.fill();
      ctx.fillStyle = sh(rail, 0.6); ctx.fillRect(4, hy + 8, 56, 3);
      ctx.fillStyle = '#3a3a36'; rrect(ctx, 20, hoodNorth ? hy + 14 : hy + 26, 24, 12, 3); ctx.fill();
      // arrow indicator
      ctx.fillStyle = sh(rail, 0.35);
      const ay = hoodNorth ? hy + 20 : hy + 32;
      poly(ctx, [[32, ay - 5], [38, ay + 3], [26, ay + 3]]); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; rrect(ctx, 1.5, hy + 0.5, 61, hh - 1, 6); ctx.stroke();
      ctx.restore();
      add(`ug-${tier}-${kind}-${d}`, f, { dx: 6, dy: 2 });
    }
  }
}

function buildSplitter(tier: number) {
  const rail = BELT_RAIL[tier];
  for (let d = 0; d < 4; d++) {
    const horiz = d % 2 === 1;
    const f = horiz ? frame(1, 2, 0.5, 0.2, 0.2) : frame(2, 1, 0.5, 0.2, 0.2);
    const { ctx, x0, y0 } = f;
    ctx.save();
    const cw = horiz ? 64 : 128, ch = horiz ? 128 : 64;
    ctx.translate(x0 + cw / 2, y0 + ch / 2); ctx.rotate(d * Math.PI / 2);
    // local: width 128 (x), height 64 (y), facing north
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; rrect(ctx, -62, -14, 128, 34, 6); ctx.fill();
    ctx.fillStyle = vgrad(ctx, -18, 18, [[0, sh(rail, 1.3)], [0.5, sh(rail, 0.95)], [1, sh(rail, 0.5)]]);
    rrect(ctx, -64, -18, 128, 32, 6); ctx.fill();
    ctx.fillStyle = sh(rail, 0.45); rrect(ctx, -8, -14, 16, 24, 3); ctx.fill();
    ctx.fillStyle = '#2a2a28';
    rrect(ctx, -54, -10, 40, 14, 3); ctx.fill(); rrect(ctx, 14, -10, 40, 14, 3); ctx.fill();
    gear(ctx, 0, -2, 7, 8, [110, 110, 105]);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; rrect(ctx, -63.5, -17.5, 127, 31, 6); ctx.stroke();
    ctx.restore();
    add(`splitter-${tier}-${d}`, f, { dx: 5, dy: 2 });
  }
}

// ---------- Chests ----------
function chest(id: string, draw: (ctx: Ctx, x: number, y: number) => void) {
  const f = frame(1, 1, 0.35, 0.15, 0.15);
  draw(f.ctx, f.x0, f.y0);
  grain(f.ctx, f.W, f.H, 0.06, id.length);
  add(id, f, { dx: 8, dy: 3 });
}
export function buildChests() {
  chest('wooden-chest', (ctx, x, y) => {
    const base: RGB = [150, 104, 56];
    box(ctx, x + 6, y - 6, 52, 42, 22, base, { r: 3 });
    ctx.strokeStyle = 'rgba(40,20,5,0.6)'; ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + 8, y - 6 + i * 10.5); ctx.lineTo(x + 56, y - 6 + i * 10.5); ctx.stroke(); }
    for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + 8, y + 36 + i * 7); ctx.lineTo(x + 56, y + 36 + i * 7); ctx.stroke(); }
    ctx.fillStyle = '#5a5a56';
    for (const [cx, cy] of [[8, -4], [50, -4], [8, 30], [50, 30]]) ctx.fillRect(x + cx, y + cy, 6, 6);
    ctx.fillStyle = '#3a3a36'; ctx.fillRect(x + 28, y + 34, 8, 8);
  });
  chest('iron-chest', (ctx, x, y) => {
    const base: RGB = [140, 142, 140];
    box(ctx, x + 6, y - 6, 52, 42, 22, base, { r: 3 });
    ctx.strokeStyle = sh(base, 0.6); ctx.lineWidth = 2;
    rrect(ctx, x + 11, y - 1, 42, 32, 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 11, y + 15); ctx.lineTo(x + 53, y + 15); ctx.stroke();
    for (const [cx, cy] of [[10, -2], [54, -2], [10, 32], [54, 32]]) rivet(ctx, x + cx, y + cy, 2, base);
    ctx.fillStyle = '#4a4a46'; ctx.fillRect(x + 28, y + 40, 8, 8);
  });
  chest('steel-chest', (ctx, x, y) => {
    const base: RGB = [96, 100, 108];
    box(ctx, x + 6, y - 6, 52, 42, 22, base, { r: 3 });
    ctx.fillStyle = sh(base, 1.25);
    for (const [cx, cy, w, h] of [[6, -6, 10, 10], [48, -6, 10, 10], [6, 26, 10, 10], [48, 26, 10, 10]]) { ctx.fillRect(x + cx, y + cy, w, h); }
    ctx.strokeStyle = sh(base, 0.55); ctx.lineWidth = 2; rrect(ctx, x + 14, y + 2, 36, 26, 2); ctx.stroke();
    ctx.fillStyle = '#c8a040'; ctx.fillRect(x + 28, y + 40, 8, 8);
  });
  const logi: [string, RGB][] = [['active-provider-chest', [160, 60, 170]], ['passive-provider-chest', [200, 60, 50]], ['storage-chest', [210, 170, 50]], ['buffer-chest', [70, 170, 70]], ['requester-chest', [60, 120, 200]]];
  for (const [id, col] of logi) chest(id, (ctx, x, y) => {
    const base: RGB = [96, 100, 108];
    box(ctx, x + 6, y - 6, 52, 42, 22, base, { r: 3 });
    ctx.fillStyle = lgrad(ctx, x + 10, y - 2, x + 54, y + 32, [[0, sh(col, 1.25)], [1, sh(col, 0.7)]]);
    rrect(ctx, x + 11, y - 1, 42, 32, 2); ctx.fill();
    ctx.fillStyle = sh(col, 0.5); ctx.fillRect(x + 6, y + 38, 52, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; rrect(ctx, x + 22, y + 6, 20, 18, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; rrect(ctx, x + 11, y - 1, 42, 32, 2); ctx.stroke();
  });
}

// ---------- Inserters ----------
export const INSERTER_COLOR: Record<string, RGB> = {
  'burner-inserter': [96, 86, 72], 'inserter': [214, 166, 40], 'long-handed-inserter': [196, 56, 40], 'fast-inserter': [60, 130, 200], 'bulk-inserter': [80, 160, 60],
};
export function buildInserters() {
  for (const [id, col] of Object.entries(INSERTER_COLOR)) {
    // base platform
    const f = frame(1, 1, 0.2, 0.1, 0.1);
    const { ctx, x0, y0 } = f;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, x0 + 14, y0 + 18, 38, 36, 6); ctx.fill();
    ctx.fillStyle = vgrad(ctx, y0 + 12, y0 + 50, [[0, '#8a8a84'], [1, '#4a4a46']]);
    rrect(ctx, x0 + 12, y0 + 14, 40, 36, 6); ctx.fill();
    ctx.fillStyle = vgrad(ctx, y0 + 14, y0 + 44, [[0, sh(col, 1.2)], [1, sh(col, 0.65)]]);
    rrect(ctx, x0 + 15, y0 + 17, 34, 28, 5); ctx.fill();
    ctx.fillStyle = sh(col, 0.4); ctx.fillRect(x0 + 15, y0 + 44, 34, 4);
    if (id === 'burner-inserter') { glow(ctx, x0 + 32, y0 + 36, 6, [255, 120, 40], 0.5); }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; rrect(ctx, x0 + 12.5, y0 + 14.5, 39, 35, 6); ctx.stroke();
    rivet(ctx, x0 + 32, y0 + 30, 7, [110, 110, 104]);
    add(`${id}-base`, f, { dx: 4, dy: 2 });
    // arm segment (horizontal bar, 64px long = 1 tile at scale)
    const [ac, actx] = mkc(64, 12);
    actx.fillStyle = sh(col, 0.35); rrect(actx, 0, 1, 64, 10, 4); actx.fill();
    actx.fillStyle = vgrad(actx, 1, 10, [[0, sh(col, 1.45)], [0.5, css(col)], [1, sh(col, 0.55)]]); rrect(actx, 1, 2, 62, 7, 3.5); actx.fill();
    addRaw(`${id}-arm`, ac);
    // hand / claw (pointing +x)
    const [hc, hctx] = mkc(28, 28);
    hctx.strokeStyle = '#3a3a38'; hctx.lineWidth = 5;
    hctx.beginPath(); hctx.moveTo(4, 14); hctx.lineTo(16, 14); hctx.lineTo(24, 6); hctx.moveTo(16, 14); hctx.lineTo(24, 22); hctx.stroke();
    hctx.strokeStyle = '#8a8a84'; hctx.lineWidth = 2.5;
    hctx.beginPath(); hctx.moveTo(4, 14); hctx.lineTo(16, 14); hctx.lineTo(24, 6); hctx.moveTo(16, 14); hctx.lineTo(24, 22); hctx.stroke();
    rivet(hctx, 6, 14, 4, shade(col, 0.9));
    addRaw(`${id}-hand`, hc);
    const [arms] = mkc(1, 1);
    void arms;
  }
  // generic joint
  const [jc, jctx] = mkc(16, 16); rivet(jctx, 8, 8, 6, [120, 120, 114]); addRaw('inserter-joint', jc);
}

// ---------- Electric poles ----------
export const POLE_WIRE: Record<string, { copper: [number, number]; red: [number, number]; green: [number, number] }> = {
  'small-electric-pole': { copper: [0, -2.15], red: [-0.32, -2.0], green: [0.32, -2.0] },
  'medium-electric-pole': { copper: [0, -2.6], red: [-0.35, -2.4], green: [0.35, -2.4] },
  'big-electric-pole': { copper: [0, -3.75], red: [-0.7, -3.55], green: [0.7, -3.55] },
  'substation': { copper: [0, -1.55], red: [-0.55, -1.35], green: [0.55, -1.35] },
};
export function buildPoles() {
  // small wooden pole
  {
    const f = frame(1, 1, 2.0, 0.15, 0.3);
    const { ctx, x0, y0 } = f;
    const cx = x0 + 32, base = y0 + 40;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ellipse(ctx, cx, base, 10, 4); ctx.fill();
    ctx.fillStyle = hgrad(ctx, cx - 5, cx + 5, [[0, '#4a3018'], [0.35, '#9a6c3c'], [1, '#3a2410']]);
    ctx.fillRect(cx - 5, y0 - 104, 10, base - (y0 - 104));
    // crossbar
    ctx.fillStyle = vgrad(ctx, y0 - 100, y0 - 92, [[0, '#a87848'], [1, '#4e3218']]);
    ctx.fillRect(cx - 26, y0 - 100, 52, 8);
    for (const dx of [-21, 21, 0]) {
      const yy = dx === 0 ? y0 - 112 : y0 - 108;
      ctx.fillStyle = vgrad(ctx, yy, yy + 10, [[0, '#d8d8d0'], [1, '#707068']]); rrect(ctx, cx + dx - 4, yy, 8, 10, 3); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(cx - 5, y0 - 104, 10, base - (y0 - 104));
    add('small-electric-pole', f, { k: 0.75, alpha: 0.9 });
  }
  // medium pole (metal)
  {
    const f = frame(1, 1, 2.5, 0.15, 0.3);
    const { ctx, x0, y0 } = f;
    const cx = x0 + 32, base = y0 + 40;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ellipse(ctx, cx, base, 12, 5); ctx.fill();
    ctx.fillStyle = '#5a4a3a'; rrect(ctx, cx - 10, base - 10, 20, 12, 3); ctx.fill();
    ctx.fillStyle = hgrad(ctx, cx - 5, cx + 5, [[0, '#5a2e22'], [0.35, '#b06a4e'], [1, '#4a2418']]);
    ctx.fillRect(cx - 5, y0 - 136, 10, base - (y0 - 136));
    ctx.strokeStyle = '#7a3e2c'; ctx.lineWidth = 2;
    for (let yy = y0 - 130; yy < base - 10; yy += 14) { ctx.beginPath(); ctx.moveTo(cx - 5, yy); ctx.lineTo(cx + 5, yy + 7); ctx.stroke(); }
    ctx.fillStyle = vgrad(ctx, y0 - 132, y0 - 124, [[0, '#c07a5a'], [1, '#5a2e22']]); ctx.fillRect(cx - 26, y0 - 132, 52, 7);
    for (const dx of [-22, 22, 0]) { const yy = dx === 0 ? y0 - 144 : y0 - 140; ctx.fillStyle = vgrad(ctx, yy, yy + 10, [[0, '#e0e0d8'], [1, '#707068']]); rrect(ctx, cx + dx - 4, yy, 8, 10, 3); ctx.fill(); }
    add('medium-electric-pole', f, { k: 0.75, alpha: 0.9 });
  }
  // big pole (2x2 lattice tower)
  {
    const f = frame(2, 2, 3.4, 0.15, 0.6);
    const { ctx, x0, y0 } = f;
    const cx = x0 + 64, base = y0 + 100, top = y0 - 200;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ellipse(ctx, cx, base, 40, 12); ctx.fill();
    const legs = [[-34, base], [34, base]];
    ctx.strokeStyle = '#5a5e5a'; ctx.lineWidth = 6;
    for (const [lx, ly] of legs) { ctx.beginPath(); ctx.moveTo(cx + lx, ly); ctx.lineTo(cx + lx * 0.25, top + 20); ctx.stroke(); }
    ctx.strokeStyle = '#8a8e88'; ctx.lineWidth = 3;
    for (const [lx, ly] of legs) { ctx.beginPath(); ctx.moveTo(cx + lx, ly); ctx.lineTo(cx + lx * 0.25, top + 20); ctx.stroke(); }
    ctx.strokeStyle = '#6a6e68'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const t0 = i / 8, t1 = (i + 1) / 8;
      const y_a = base + (top + 20 - base) * t0, y_b = base + (top + 20 - base) * t1;
      const w_a = 34 * (1 - 0.75 * t0), w_b = 34 * (1 - 0.75 * t1);
      ctx.beginPath(); ctx.moveTo(cx - w_a, y_a); ctx.lineTo(cx + w_b, y_b); ctx.moveTo(cx + w_a, y_a); ctx.lineTo(cx - w_b, y_b); ctx.stroke();
    }
    ctx.fillStyle = vgrad(ctx, top + 8, top + 22, [[0, '#a0a49e'], [1, '#4a4e48']]); ctx.fillRect(cx - 52, top + 10, 104, 12);
    for (const dx of [-46, 46, 0]) { const yy = dx === 0 ? top - 6 : top - 2; ctx.fillStyle = vgrad(ctx, yy, yy + 14, [[0, '#e0e0d8'], [1, '#707068']]); rrect(ctx, cx + dx - 5, yy, 10, 14, 3); ctx.fill(); }
    add('big-electric-pole', f, { k: 0.7, alpha: 0.8 });
  }
  // substation
  {
    const f = frame(2, 2, 1.5, 0.15, 0.25);
    const { ctx, x0, y0 } = f;
    const base: RGB = [110, 112, 108];
    box(ctx, x0 + 8, y0 + 4, 112, 80, 36, base, { r: 6 });
    vents(ctx, x0 + 20, y0 + 92, 88, 22, 4, base);
    ctx.fillStyle = '#3a3a38'; rrect(ctx, x0 + 30, y0 - 40, 68, 50, 6); ctx.fill();
    box(ctx, x0 + 30, y0 - 70, 68, 40, 30, [130, 132, 126], { r: 5 });
    for (const dx of [-36, 36, 0]) { const yy = dx === 0 ? y0 - 96 : y0 - 88; ctx.fillStyle = vgrad(ctx, yy, yy + 16, [[0, '#e0e0d8'], [1, '#707068']]); rrect(ctx, x0 + 64 + dx - 5, yy, 10, 16, 3); ctx.fill(); }
    grain(ctx, f.W, f.H, 0.05, 7);
    add('substation', f, { dx: 14, dy: 3, k: 0.35 });
  }
  // wire sprite (thin soft line)
  const [wc, wctx] = mkc(16, 8);
  wctx.fillStyle = vgrad(wctx, 0, 8, [[0, 'rgba(255,255,255,0)'], [0.35, 'rgba(255,255,255,1)'], [0.65, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
  wctx.fillRect(0, 0, 16, 8);
  addRaw('wire', wc);
}

// ---------- Pipes ----------
const PIPE: RGB = [102, 118, 128];
function drawPipeMask(ctx: Ctx, mask: number, cx: number, cy: number) {
  const w = 30;
  const N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
  const vert = (y0: number, y1: number) => {
    ctx.fillStyle = hgrad(ctx, cx - w / 2, cx + w / 2, [[0, sh(PIPE, 0.55)], [0.25, sh(PIPE, 1.3)], [0.5, sh(PIPE, 1.0)], [1, sh(PIPE, 0.4)]]);
    ctx.fillRect(cx - w / 2, y0, w, y1 - y0);
  };
  const horz = (x0: number, x1: number) => {
    ctx.fillStyle = vgrad(ctx, cy - w / 2, cy + w / 2, [[0, sh(PIPE, 1.35)], [0.35, sh(PIPE, 1.05)], [0.75, sh(PIPE, 0.6)], [1, sh(PIPE, 0.35)]]);
    ctx.fillRect(x0, cy - w / 2, x1 - x0, w);
  };
  const cnt = (N ? 1 : 0) + (E ? 1 : 0) + (S ? 1 : 0) + (W ? 1 : 0);
  const straightV = mask === 5, straightH = mask === 10;
  if (mask === 0) { horz(cx - 26, cx + 26); }
  if (N) vert(cy - 32, cy); if (S) vert(cy, cy + 32); if (E) horz(cx, cx + 32); if (W) horz(cx - 32, cx);
  if (cnt === 1) { if (N || S) vert(cy - 8, cy + 8); else horz(cx - 8, cx + 8); }
  if (!straightV && !straightH && mask !== 0) {
    // junction body
    ctx.fillStyle = rgrad(ctx, cx - 6, cy - 6, 2, w * 0.8, [[0, sh(PIPE, 1.3)], [1, sh(PIPE, 0.5)]]);
    rrect(ctx, cx - w / 2 - 2, cy - w / 2 - 2, w + 4, w + 4, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; rrect(ctx, cx - w / 2 - 2, cy - w / 2 - 2, w + 4, w + 4, 6); ctx.stroke();
  }
  // flanges at tile edges and on dead ends
  const flange = (x: number, y: number, horizontal: boolean) => {
    ctx.fillStyle = horizontal ? hgrad(ctx, x - 3, x + 3, [[0, sh(PIPE, 0.6)], [0.5, sh(PIPE, 1.25)], [1, sh(PIPE, 0.5)]]) : vgrad(ctx, y - 3, y + 3, [[0, sh(PIPE, 1.3)], [1, sh(PIPE, 0.5)]]);
    if (horizontal) ctx.fillRect(x - 3, cy - w / 2 - 3, 6, w + 6); else ctx.fillRect(cx - w / 2 - 3, y - 3, w + 6, 6);
  };
  if (straightV) { flange(0, cy - 8, false); flange(0, cy + 8, false); }
  if (straightH) { flange(cx - 8, 0, true); flange(cx + 8, 0, true); }
  if (cnt === 1) { if (N) flange(0, cy + 8, false); if (S) flange(0, cy - 8, false); if (E) flange(cx - 8, 0, true); if (W) flange(cx + 8, 0, true); }
  if (mask === 0) { flange(cx - 24, 0, true); flange(cx + 24, 0, true); }
  // outline
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
}
export function buildPipes() {
  for (let mask = 0; mask < 16; mask++) {
    const f = frame(1, 1, 0.15, 0.15, 0.15);
    drawPipeMask(f.ctx, mask, f.x0 + 32, f.y0 + 32);
    grain(f.ctx, f.W, f.H, 0.05, mask + 3);
    add(`pipe-${mask}`, f, { dx: 5, dy: 3 });
  }
  // pipe to ground: connection on 'dir' side, dives underground toward opposite side
  for (let d = 0; d < 4; d++) {
    const f = frame(1, 1, 0.2, 0.15, 0.15);
    const { ctx, x0, y0 } = f;
    ctx.save(); ctx.translate(x0 + 32, y0 + 32); ctx.rotate(d * Math.PI / 2); ctx.translate(-32, -32);
    drawPipeMask(ctx, 1, 32, 32);
    // ground plate
    ctx.fillStyle = vgrad(ctx, 34, 60, [[0, '#7a7a74'], [1, '#3a3a36']]); rrect(ctx, 10, 34, 44, 24, 4); ctx.fill();
    ctx.fillStyle = '#1e1e1c'; ellipse(ctx, 32, 42, 15, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; rrect(ctx, 10.5, 34.5, 43, 23, 4); ctx.stroke();
    ctx.restore();
    add(`pipe-to-ground-${d}`, f, { dx: 5, dy: 3 });
  }
  // pump (1x2, facing north = output north)
  for (let d = 0; d < 4; d++) {
    const horiz = d % 2 === 1;
    const f = horiz ? frame(2, 1, 0.6, 0.2, 0.2) : frame(1, 2, 0.6, 0.2, 0.2);
    const { ctx, x0, y0 } = f;
    const cw = horiz ? 128 : 64, ch = horiz ? 64 : 128;
    ctx.save(); ctx.translate(x0 + cw / 2, y0 + ch / 2); ctx.rotate(d * Math.PI / 2); ctx.translate(-32, -64);
    drawPipeMask(ctx, 5, 32, 32); drawPipeMask(ctx, 5, 32, 96);
    ctx.restore();
    const bx = x0 + cw / 2 - 26, by = y0 + ch / 2 - 30;
    box(ctx, bx, by - 8, 52, 36, 24, [96, 110, 120], { r: 5 });
    cylinder(ctx, x0 + cw / 2, by - 18, 12, 6, 18, [70, 80, 90]);
    ctx.fillStyle = '#d0a030';
    ctx.save(); ctx.translate(x0 + cw / 2, by + 16); ctx.rotate(d * Math.PI / 2);
    poly(ctx, [[0, -9], [7, 3], [-7, 3]]); ctx.fill(); ctx.restore();
    add(`pump-${d}`, f, { dx: 8, dy: 3 });
  }
}

// Fluid window (white, tinted at draw time)
export function buildMisc() {
  const [c, ctx] = mkc(16, 16); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 16, 16); addRaw('white', c);
  const [c2, ctx2] = mkc(64, 64); ctx2.fillStyle = rgrad(ctx2, 32, 32, 0, 32, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]); ctx2.fillRect(0, 0, 64, 64); addRaw('light', c2);
  const [c3, ctx3] = mkc(64, 64); ctx3.fillStyle = rgrad(ctx3, 32, 32, 0, 32, [[0, 'rgba(255,255,255,1)'], [0.7, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); ctx3.fillRect(0, 0, 64, 64); addRaw('disc', c3);
  const [c4, ctx4] = mkc(64, 64); ctx4.strokeStyle = '#fff'; ctx4.lineWidth = 3; ctx4.beginPath(); ctx4.arc(32, 32, 30, 0, 6.3); ctx4.stroke(); addRaw('ring', c4);
}
