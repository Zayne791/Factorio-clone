// Production & energy entity sprites.
import { mkc, css, sh, shade, mix, rrect, vgrad, hgrad, lgrad, rgrad, box, rivet, gear, grain, ellipse, poly, glow, cylinder, vents, stripes, RGB, Ctx } from './draw';
import { frame, add, addRaw, PX, Frame } from './sprites-common';
import { RNG } from '../engine/noise';

const MBASE: RGB = [118, 118, 112];

// Generic square machine body with chamfered top, front face and accent trim.
function machine(f: Frame, accent: RGB | null, opts: { h?: number; inset?: number; base?: RGB; r?: number } = {}) {
  const { ctx, x0, y0, wT, hT } = f;
  const W = wT * PX, H = hT * PX;
  const inset = opts.inset ?? 4;
  const h = opts.h ?? 22;
  const base = opts.base ?? MBASE;
  const r = opts.r ?? 8;
  // ground contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, x0 + inset, y0 + inset + 6, W - inset * 2, H - inset * 2, r); ctx.fill();
  box(ctx, x0 + inset, y0 + inset - h + 8, W - inset * 2, H - inset * 2 - 8, h, base, { r });
  if (accent) {
    ctx.fillStyle = vgrad(ctx, y0 + H - inset - h + 8, y0 + H - inset, [[0, sh(accent, 0.9)], [1, sh(accent, 0.5)]]);
    ctx.fillRect(x0 + inset + 6, y0 + H - inset - 12, W - inset * 2 - 12, 5);
  }
  return { tx: x0 + inset, ty: y0 + inset - h + 8, tw: W - inset * 2, th: H - inset * 2 - 8 };
}

function outputChute(ctx: Ctx, cx: number, cy: number, d: number, len: number, col: RGB) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(d * Math.PI / 2);
  ctx.fillStyle = vgrad(ctx, -len, 0, [[0, sh(col, 1.2)], [1, sh(col, 0.6)]]);
  poly(ctx, [[-12, 0], [12, 0], [9, -len], [-9, -len]]); ctx.fill();
  ctx.fillStyle = '#1a1a18'; poly(ctx, [[-7, -4], [7, -4], [5, -len + 3], [-5, -len + 3]]); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; poly(ctx, [[-12, 0], [12, 0], [9, -len], [-9, -len]]); ctx.stroke();
  ctx.restore();
}
function pipeStub(ctx: Ctx, cx: number, cy: number, d: number, len = 20) {
  const P: RGB = [102, 118, 128];
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(d * Math.PI / 2);
  ctx.fillStyle = hgrad(ctx, -13, 13, [[0, sh(P, 0.55)], [0.3, sh(P, 1.3)], [1, sh(P, 0.4)]]);
  ctx.fillRect(-13, -len, 26, len);
  ctx.fillStyle = vgrad(ctx, -len, -len + 6, [[0, sh(P, 1.35)], [1, sh(P, 0.6)]]);
  ctx.fillRect(-16, -len, 32, 6);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(-13, -len, 26, len);
  ctx.restore();
}

// ---------- Drills ----------
function buildDrills() {
  for (let d = 0; d < 4; d++) {
    // Burner mining drill 2x2
    const f = frame(2, 2, 0.6, 0.25, 0.3);
    const { ctx, x0, y0 } = f;
    const col: RGB = [120, 104, 88];
    const cx = x0 + 64, cy = y0 + 64;
    const dirs = [[0, -60], [60, 0], [0, 60], [-60, 0]];
    if (d === 0) outputChute(ctx, cx - 32, y0 + 10, 0, 24, col);
    const t = machine(f, [150, 90, 50], { h: 26, base: col, r: 8 });
    // firebox with door
    ctx.fillStyle = '#2a2420'; rrect(ctx, x0 + 40, y0 + 92, 48, 22, 4); ctx.fill();
    ctx.fillStyle = '#5a1e08'; rrect(ctx, x0 + 46, y0 + 96, 36, 14, 3); ctx.fill();
    // drill housing on top
    cylinder(ctx, cx, y0 + 14, 26, 12, 30, [96, 96, 92]);
    gear(ctx, cx, y0 + 14, 18, 10, [140, 130, 110]);
    for (const [rx, ry] of [[t.tx + 8, t.ty + 8], [t.tx + t.tw - 8, t.ty + 8], [t.tx + 8, t.ty + t.th - 8], [t.tx + t.tw - 8, t.ty + t.th - 8]]) rivet(ctx, rx, ry, 3, col);
    if (d !== 0) {
      const ox = [0, 0, 0, 0][d];
      void ox;
      const pos = [[cx - 32, y0 + 10], [x0 + 118, cy - 32], [cx - 32, y0 + 118], [x0 + 10, cy - 32]][d];
      outputChute(ctx, pos[0], pos[1], d, 22, col);
    }
    grain(ctx, f.W, f.H, 0.07, 30 + d);
    add(`burner-mining-drill-${d}`, f, { dx: 14, dy: 4, k: 0.3 });
    void dirs;
  }
  // electric mining drill 3x3
  for (let d = 0; d < 4; d++) {
    const f = frame(3, 3, 0.5, 0.3, 0.3);
    const { ctx, x0, y0 } = f;
    const col: RGB = [96, 108, 118];
    const cx = x0 + 96, cy = y0 + 96;
    const t = machine(f, [60, 120, 180], { h: 24, base: col, r: 10 });
    // corner legs / tracks
    for (const [lx, ly] of [[x0 + 4, y0 + 4], [x0 + 164, y0 + 4], [x0 + 4, y0 + 158], [x0 + 164, y0 + 158]]) {
      ctx.fillStyle = vgrad(ctx, ly, ly + 24, [[0, '#6a6a66'], [1, '#2e2e2c']]); rrect(ctx, lx, ly, 24, 26, 4); ctx.fill();
    }
    // central pit
    ctx.fillStyle = '#1e1e1c'; ellipse(ctx, cx, cy - 10, 54, 46); ctx.fill();
    ctx.fillStyle = rgrad(ctx, cx, cy - 10, 30, 56, [[0, 'rgba(0,0,0,0)'], [1, sh(col, 0.7)]]); ellipse(ctx, cx, cy - 10, 56, 48); ctx.fill();
    // side motors
    box(ctx, t.tx + 6, t.ty + 10, 30, 40, 14, [70, 80, 90], { r: 4 });
    box(ctx, t.tx + t.tw - 36, t.ty + 10, 30, 40, 14, [70, 80, 90], { r: 4 });
    vents(ctx, t.tx + 10, t.ty + 16, 22, 26, 4, [70, 80, 90]);
    vents(ctx, t.tx + t.tw - 32, t.ty + 16, 22, 26, 4, [70, 80, 90]);
    // output
    const pos = [[cx, y0 + 6], [x0 + 186, cy], [cx, y0 + 186], [x0 + 6, cy]][d];
    outputChute(ctx, pos[0], pos[1], d, 22, [120, 130, 140]);
    grain(ctx, f.W, f.H, 0.06, 40 + d);
    add(`electric-mining-drill-${d}`, f, { dx: 16, dy: 4, k: 0.15 });
  }
  // drill head (rotating)
  {
    const [c, ctx] = mkc(112, 112);
    ctx.fillStyle = rgrad(ctx, 50, 50, 6, 56, [[0, '#9aa0a4'], [1, '#3a3e42']]);
    ctx.beginPath(); ctx.arc(56, 56, 46, 0, 6.3); ctx.fill();
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.translate(56, 56); ctx.rotate(i * Math.PI / 3);
      ctx.fillStyle = lgrad(ctx, 0, -6, 40, 6, [[0, '#d0a040'], [1, '#6a4a10']]);
      poly(ctx, [[8, -7], [44, -4], [46, 4], [8, 7]]); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    gear(ctx, 56, 56, 16, 10, [150, 150, 145]);
    addRaw('drill-head', c, 0, -0.15);
    const [c2, ctx2] = mkc(64, 64);
    gear(ctx2, 32, 32, 28, 12, [130, 120, 100]);
    addRaw('burner-drill-head', c2);
  }
}

// ---------- Furnaces ----------
function buildFurnaces() {
  // stone furnace
  {
    const f = frame(2, 2, 0.7, 0.25, 0.25);
    const { ctx, x0, y0 } = f;
    const R = new RNG(77);
    const cx = x0 + 64;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(ctx, cx, y0 + 98, 60, 26); ctx.fill();
    // stone dome built of blocks
    const stone: RGB = [150, 128, 100];
    ctx.fillStyle = vgrad(ctx, y0 - 30, y0 + 120, [[0, sh(stone, 1.15)], [1, sh(stone, 0.55)]]);
    ctx.beginPath(); ctx.moveTo(x0 + 8, y0 + 110); ctx.lineTo(x0 + 8, y0 + 30); ctx.quadraticCurveTo(x0 + 10, y0 - 34, cx, y0 - 36); ctx.quadraticCurveTo(x0 + 118, y0 - 34, x0 + 120, y0 + 30); ctx.lineTo(x0 + 120, y0 + 110); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.clip();
    for (let row = 0; row < 12; row++) {
      const yy = y0 - 40 + row * 13;
      const off = (row % 2) * 12;
      for (let col = -1; col < 6; col++) {
        const xx = x0 + col * 24 + off;
        const k = 0.8 + R.next() * 0.35;
        ctx.fillStyle = sh(stone, k * (1.1 - row * 0.035));
        rrect(ctx, xx + 1, yy + 1, 22, 11, 3); ctx.fill();
      }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0 + 8, y0 + 110); ctx.lineTo(x0 + 8, y0 + 30); ctx.quadraticCurveTo(x0 + 10, y0 - 34, cx, y0 - 36); ctx.quadraticCurveTo(x0 + 118, y0 - 34, x0 + 120, y0 + 30); ctx.lineTo(x0 + 120, y0 + 110); ctx.closePath(); ctx.stroke();
    // opening
    ctx.fillStyle = '#1a120c'; ctx.beginPath(); ctx.moveTo(cx - 24, y0 + 112); ctx.lineTo(cx - 24, y0 + 80); ctx.arc(cx, y0 + 80, 24, Math.PI, 0); ctx.lineTo(cx + 24, y0 + 112); ctx.closePath(); ctx.fill();
    // chimney top hole
    ctx.fillStyle = '#221a14'; ellipse(ctx, cx, y0 - 14, 16, 8); ctx.fill();
    grain(ctx, f.W, f.H, 0.08, 51);
    add('stone-furnace', f, { dx: 16, dy: 4, k: 0.25 });
  }
  // steel furnace
  {
    const f = frame(2, 2, 0.6, 0.25, 0.25);
    const { ctx, x0, y0 } = f;
    const col: RGB = [92, 88, 86];
    const t = machine(f, null, { h: 34, base: col, r: 10 });
    ctx.fillStyle = lgrad(ctx, t.tx, t.ty, t.tx + t.tw, t.ty + t.th, [[0, '#7a7672'], [1, '#3e3a38']]);
    rrect(ctx, t.tx + 10, t.ty + 8, t.tw - 20, t.th - 16, 8); ctx.fill();
    for (let i = 0; i < 5; i++) { ctx.fillStyle = '#2a2826'; ctx.fillRect(t.tx + 18 + i * 17, t.ty + 16, 10, t.th - 32); }
    ctx.fillStyle = '#1a120c'; rrect(ctx, x0 + 36, y0 + 88, 56, 24, 5); ctx.fill();
    for (const [rx, ry] of [[t.tx + 8, t.ty + 6], [t.tx + t.tw - 8, t.ty + 6], [t.tx + 8, t.ty + t.th - 6], [t.tx + t.tw - 8, t.ty + t.th - 6]]) rivet(ctx, rx, ry, 3.5, col);
    grain(ctx, f.W, f.H, 0.06, 52);
    add('steel-furnace', f, { dx: 16, dy: 4, k: 0.25 });
  }
  // electric furnace 3x3
  {
    const f = frame(3, 3, 0.6, 0.3, 0.3);
    const { ctx, x0, y0 } = f;
    const col: RGB = [120, 116, 110];
    const t = machine(f, [190, 110, 40], { h: 28, base: col, r: 10 });
    ctx.fillStyle = '#3a3634'; rrect(ctx, t.tx + 30, t.ty + 22, t.tw - 60, t.th - 44, 10); ctx.fill();
    ctx.fillStyle = rgrad(ctx, x0 + 96, t.ty + t.th / 2, 4, 50, [[0, '#5a3020'], [1, '#2a1a12']]);
    rrect(ctx, t.tx + 36, t.ty + 28, t.tw - 72, t.th - 56, 8); ctx.fill();
    vents(ctx, t.tx + 8, t.ty + 10, 16, t.th - 20, 6, col);
    vents(ctx, t.tx + t.tw - 24, t.ty + 10, 16, t.th - 20, 6, col);
    ctx.fillStyle = '#1a120c'; rrect(ctx, x0 + 66, y0 + 160, 60, 20, 4); ctx.fill();
    grain(ctx, f.W, f.H, 0.06, 53);
    add('electric-furnace', f, { dx: 18, dy: 4, k: 0.2 });
  }
  // fire / glow overlays
  {
    const [c, ctx] = mkc(64, 48);
    glow(ctx, 32, 30, 28, [255, 140, 40], 1);
    glow(ctx, 32, 32, 14, [255, 230, 140], 1);
    addRaw('fire-glow', c);
    const [c2, ctx2] = mkc(64, 64);
    for (let i = 0; i < 5; i++) {
      ctx2.fillStyle = rgrad(ctx2, 32, 50, 0, 30, [[0, 'rgba(255,240,160,1)'], [0.5, 'rgba(255,140,30,0.8)'], [1, 'rgba(200,40,0,0)']]);
      ctx2.beginPath(); ctx2.moveTo(20 + i * 6, 56); ctx2.quadraticCurveTo(14 + i * 7, 26, 32, 4 + i * 3); ctx2.quadraticCurveTo(50 - i * 6, 26, 44 - i * 3, 56); ctx2.closePath(); ctx2.fill();
    }
    addRaw('flame', c2);
  }
}

// ---------- Assemblers ----------
const AM_ACCENT: Record<string, RGB> = { 'assembling-machine-1': [150, 140, 110], 'assembling-machine-2': [70, 120, 170], 'assembling-machine-3': [170, 170, 60] };
function buildAssemblers() {
  for (const [id, acc] of Object.entries(AM_ACCENT)) {
    const f = frame(3, 3, 0.55, 0.3, 0.3);
    const { ctx, x0, y0 } = f;
    const col: RGB = id === 'assembling-machine-1' ? [124, 122, 112] : id === 'assembling-machine-2' ? [112, 118, 124] : [118, 120, 108];
    const t = machine(f, acc, { h: 26, base: col, r: 12 });
    // corner blocks
    for (const [bx, by] of [[t.tx + 4, t.ty + 4], [t.tx + t.tw - 40, t.ty + 4], [t.tx + 4, t.ty + t.th - 40], [t.tx + t.tw - 40, t.ty + t.th - 40]]) {
      box(ctx, bx, by, 36, 30, 8, shade(acc, 0.9), { r: 5 });
    }
    // center recess
    ctx.fillStyle = '#2a2a28'; ctx.beginPath(); ctx.arc(x0 + 96, t.ty + t.th / 2, 50, 0, 6.3); ctx.fill();
    ctx.fillStyle = rgrad(ctx, x0 + 96, t.ty + t.th / 2, 20, 52, [[0, '#1a1a18'], [1, sh(col, 0.7)]]);
    ctx.beginPath(); ctx.arc(x0 + 96, t.ty + t.th / 2, 50, 0, 6.3); ctx.fill();
    ctx.strokeStyle = sh(col, 1.3, 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x0 + 96, t.ty + t.th / 2, 50, Math.PI, Math.PI * 1.6); ctx.stroke();
    if (id !== 'assembling-machine-1') {
      for (let i = 0; i < 12; i++) { ctx.fillStyle = sh(acc, 0.8); ctx.save(); ctx.translate(x0 + 96, t.ty + t.th / 2); ctx.rotate(i * Math.PI / 6); ctx.fillRect(48, -3, 8, 6); ctx.restore(); }
    }
    grain(ctx, f.W, f.H, 0.06, id.length + 60);
    add(id, f, { dx: 18, dy: 4, k: 0.15 });
    // rotating top
    const [c, tc] = mkc(104, 104);
    tc.fillStyle = 'rgba(0,0,0,0.35)'; tc.beginPath(); tc.arc(54, 56, 44, 0, 6.3); tc.fill();
    for (let i = 0; i < 3; i++) {
      tc.save(); tc.translate(52, 52); tc.rotate(i * Math.PI * 2 / 3);
      tc.fillStyle = lgrad(tc, 0, -8, 0, 8, [[0, sh(acc, 1.35)], [1, sh(acc, 0.55)]]);
      rrect(tc, 6, -8, 40, 16, 5); tc.fill();
      tc.strokeStyle = 'rgba(0,0,0,0.55)'; tc.lineWidth = 1; tc.stroke();
      rivet(tc, 40, 0, 5, [150, 150, 140]);
      tc.restore();
    }
    gear(tc, 52, 52, 20, 12, [150, 148, 140]);
    rivet(tc, 52, 52, 7, [170, 170, 160]);
    addRaw(id + '-top', c);
  }
}

// ---------- Lab ----------
function buildLab() {
  const f = frame(3, 3, 0.7, 0.3, 0.3);
  const { ctx, x0, y0 } = f;
  const cx = x0 + 96, cy = y0 + 92;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(ctx, cx, cy + 22, 92, 70); ctx.fill();
  // base disc
  ctx.fillStyle = vgrad(ctx, cy - 70, cy + 80, [[0, '#9a9a94'], [1, '#4a4a46']]); ellipse(ctx, cx, cy + 10, 90, 72); ctx.fill();
  ctx.fillStyle = vgrad(ctx, cy - 70, cy + 60, [[0, '#b4b4ae'], [1, '#6a6a64']]); ellipse(ctx, cx, cy, 86, 66); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ellipse(ctx, cx, cy, 86, 66); ctx.stroke();
  // pillars
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.3;
    const px = cx + Math.cos(a) * 62, py = cy + Math.sin(a) * 46;
    cylinder(ctx, px, py - 26, 7, 3.5, 26, [140, 140, 134]);
  }
  // dome
  ctx.fillStyle = rgrad(ctx, cx - 18, cy - 50, 4, 70, [[0, 'rgba(220,240,255,0.95)'], [0.5, 'rgba(120,170,200,0.75)'], [1, 'rgba(40,70,100,0.8)']]);
  ctx.beginPath(); ctx.ellipse(cx, cy - 18, 48, 40, 0, Math.PI, 0); ctx.lineTo(cx + 48, cy - 10); ctx.ellipse(cx, cy - 10, 48, 16, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
  ctx.fillStyle = vgrad(ctx, cy - 14, cy + 4, [[0, '#8a8a84'], [1, '#4a4a44']]); ellipse(ctx, cx, cy - 8, 52, 16); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ellipse(ctx, cx - 18, cy - 40, 10, 6, -0.5); ctx.fill();
  grain(ctx, f.W, f.H, 0.05, 70);
  add('lab', f, { dx: 16, dy: 4, k: 0.2 });
  const [c, gctx] = mkc(110, 90);
  glow(gctx, 55, 45, 50, [120, 200, 255], 0.9);
  addRaw('lab-glow', c, 0, -0.55);
}

// ---------- Boiler / heat exchanger ----------
function buildBoilers() {
  for (const id of ['boiler', 'heat-exchanger']) {
    for (let d = 0; d < 4; d++) {
      const horiz = d % 2 === 0; // facing N/S: 3 wide x 2 tall
      const f = horiz ? frame(3, 2, 1.0, 0.3, 0.4) : frame(2, 3, 1.0, 0.3, 0.4);
      const { ctx, x0, y0 } = f;
      const W = (horiz ? 3 : 2) * PX, H = (horiz ? 2 : 3) * PX;
      const cx = x0 + W / 2, cy = y0 + H / 2;
      // water pipes on the sides
      if (horiz) { pipeStub(ctx, x0 + 14, cy + 6, 3, 14); pipeStub(ctx, x0 + W - 14, cy + 6, 1, 14); }
      else { pipeStub(ctx, cx + 6, y0 + 14, 0, 14); pipeStub(ctx, cx + 6, y0 + H - 14, 2, 14); }
      // steam output stub toward d
      const so = [[cx, y0 + 10], [x0 + W - 10, cy], [cx, y0 + H - 10], [x0 + 10, cy]][d];
      pipeStub(ctx, so[0], so[1], d, 16);
      const col: RGB = id === 'boiler' ? [128, 116, 104] : [110, 120, 128];
      // tank body (horizontal cylinder look)
      if (horiz) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, x0 + 14, y0 + 30, W - 28, H - 30, 18); ctx.fill();
        ctx.fillStyle = vgrad(ctx, y0 + 6, y0 + H - 10, [[0, sh(col, 1.3)], [0.4, sh(col, 1.0)], [1, sh(col, 0.45)]]);
        rrect(ctx, x0 + 18, y0 + 6, W - 36, H - 20, 24); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5; rrect(ctx, x0 + 18, y0 + 6, W - 36, H - 20, 24); ctx.stroke();
        for (let i = 0; i < 4; i++) { ctx.fillStyle = sh(col, 0.6); ctx.fillRect(x0 + 40 + i * 36, y0 + 6, 4, H - 20); }
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, x0 + 14, y0 + 20, W - 20, H - 20, 18); ctx.fill();
        ctx.fillStyle = hgrad(ctx, x0 + 10, x0 + W - 10, [[0, sh(col, 0.6)], [0.35, sh(col, 1.3)], [1, sh(col, 0.4)]]);
        rrect(ctx, x0 + 12, y0 + 10, W - 24, H - 22, 24); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5; rrect(ctx, x0 + 12, y0 + 10, W - 24, H - 22, 24); ctx.stroke();
        for (let i = 0; i < 4; i++) { ctx.fillStyle = sh(col, 0.6); ctx.fillRect(x0 + 12, y0 + 34 + i * 36, W - 24, 4); }
      }
      if (id === 'boiler') {
        // firebox and chimney
        const fb = [[cx, y0 + H - 16], [x0 + 16, cy], [cx, y0 + 22], [x0 + W - 16, cy]][d];
        ctx.fillStyle = '#2a2420'; rrect(ctx, fb[0] - 22, fb[1] - 12, 44, 22, 4); ctx.fill();
        ctx.fillStyle = '#4a1a08'; rrect(ctx, fb[0] - 16, fb[1] - 8, 32, 14, 3); ctx.fill();
        cylinder(ctx, horiz ? x0 + W - 46 : x0 + W / 2 + 18, horiz ? y0 - 38 : y0 - 30, 9, 4, 46, [90, 86, 82]);
        ctx.fillStyle = '#111'; ellipse(ctx, horiz ? x0 + W - 46 : x0 + W / 2 + 18, horiz ? y0 - 38 : y0 - 30, 6, 2.5); ctx.fill();
      } else {
        // heat connection plate
        const hp = [[cx, y0 + H - 14], [x0 + 14, cy], [cx, y0 + 18], [x0 + W - 14, cy]][d];
        ctx.fillStyle = vgrad(ctx, hp[1] - 10, hp[1] + 10, [[0, '#c87a40'], [1, '#6a3a18']]); rrect(ctx, hp[0] - 18, hp[1] - 10, 36, 20, 4); ctx.fill();
      }
      grain(ctx, f.W, f.H, 0.06, 80 + d);
      add(`${id}-${d}`, f, { dx: 14, dy: 4, k: 0.25 });
    }
  }
}

// ---------- Steam engine / turbine ----------
function buildGenerators() {
  for (const id of ['steam-engine', 'steam-turbine']) {
    for (const vertical of [true, false]) {
      const f = vertical ? frame(3, 5, 0.6, 0.3, 0.3) : frame(5, 3, 0.8, 0.3, 0.3);
      const { ctx, x0, y0 } = f;
      const W = (vertical ? 3 : 5) * PX, H = (vertical ? 5 : 3) * PX;
      const col: RGB = id === 'steam-engine' ? [124, 118, 108] : [140, 140, 132];
      const acc: RGB = id === 'steam-engine' ? [150, 110, 60] : [200, 170, 60];
      // pipe ends
      if (vertical) { pipeStub(ctx, x0 + W / 2, y0 + 16, 0, 16); pipeStub(ctx, x0 + W / 2, y0 + H - 16, 2, 16); }
      else { pipeStub(ctx, x0 + 16, y0 + H / 2, 3, 16); pipeStub(ctx, x0 + W - 16, y0 + H / 2, 1, 16); }
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, x0 + 12, y0 + 22, W - 24, H - 22, 14); ctx.fill();
      // main frame
      box(ctx, x0 + 14, y0 + 12, W - 28, H - 40, 18, col, { r: 12 });
      if (id === 'steam-engine') {
        // cylinder + flywheel
        if (vertical) {
          ctx.fillStyle = hgrad(ctx, x0 + 50, x0 + 142, [[0, sh(col, 0.6)], [0.4, sh(col, 1.3)], [1, sh(col, 0.5)]]);
          rrect(ctx, x0 + 56, y0 + 30, 80, 120, 30); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
          ctx.fillStyle = '#2a2a28'; rrect(ctx, x0 + 40, y0 + 176, 112, 90, 10); ctx.fill();
          ctx.fillStyle = sh(acc, 0.7); ctx.fillRect(x0 + 36, y0 + 150, 120, 8);
        } else {
          ctx.fillStyle = vgrad(ctx, y0 + 30, y0 + 130, [[0, sh(col, 1.3)], [0.5, sh(col, 1.0)], [1, sh(col, 0.5)]]);
          rrect(ctx, x0 + 30, y0 + 36, 140, 80, 30); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
          ctx.fillStyle = '#2a2a28'; rrect(ctx, x0 + 186, y0 + 22, 104, 110, 10); ctx.fill();
          ctx.fillStyle = sh(acc, 0.7); ctx.fillRect(x0 + 170, y0 + 20, 8, 112);
        }
      } else {
        if (vertical) {
          ctx.fillStyle = hgrad(ctx, x0 + 40, x0 + 152, [[0, sh(col, 0.6)], [0.35, sh(col, 1.35)], [1, sh(col, 0.5)]]);
          rrect(ctx, x0 + 40, y0 + 30, 112, 220, 50); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
          for (let i = 0; i < 6; i++) { ctx.fillStyle = sh(acc, 0.85); ctx.fillRect(x0 + 40, y0 + 60 + i * 30, 112, 5); }
        } else {
          ctx.fillStyle = vgrad(ctx, y0 + 20, y0 + 140, [[0, sh(col, 1.35)], [0.45, sh(col, 1.0)], [1, sh(col, 0.5)]]);
          rrect(ctx, x0 + 30, y0 + 24, 260, 100, 50); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
          for (let i = 0; i < 7; i++) { ctx.fillStyle = sh(acc, 0.85); ctx.fillRect(x0 + 62 + i * 30, y0 + 24, 5, 100); }
        }
      }
      grain(ctx, f.W, f.H, 0.06, 90 + (vertical ? 1 : 2));
      add(`${id}-${vertical ? 'v' : 'h'}`, f, { dx: 16, dy: 4, k: 0.15 });
    }
  }
  // flywheel (rotating) for steam engine
  const [c, ctx] = mkc(96, 96);
  ctx.strokeStyle = '#3a3a38'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(48, 48, 40, 0, 6.3); ctx.stroke();
  ctx.strokeStyle = '#8a8a84'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(48, 48, 40, 0, 6.3); ctx.stroke();
  ctx.strokeStyle = '#6a6a64'; ctx.lineWidth = 6;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(48, 48); ctx.lineTo(48 + Math.cos(i * 1.047) * 38, 48 + Math.sin(i * 1.047) * 38); ctx.stroke(); }
  rivet(ctx, 48, 48, 9, [150, 150, 145]);
  addRaw('flywheel', c);
}

// ---------- Offshore pump ----------
function buildOffshore() {
  for (let d = 0; d < 4; d++) {
    const horiz = d % 2 === 1;
    const f = horiz ? frame(2, 1, 0.6, 0.2, 0.2) : frame(1, 2, 0.6, 0.2, 0.2);
    const { ctx, x0, y0 } = f;
    const cw = horiz ? 128 : 64, ch = horiz ? 64 : 128;
    ctx.save(); ctx.translate(x0 + cw / 2, y0 + ch / 2); ctx.rotate(d * Math.PI / 2);
    // local: 64 wide, 128 tall, output north
    pipeStub(ctx, 0, -48, 0, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, -26, -44, 56, 80, 8); ctx.fill();
    ctx.fillStyle = vgrad(ctx, -46, 40, [[0, '#9aa0a0'], [1, '#4a5050']]); rrect(ctx, -28, -46, 56, 76, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#d0a030'; rrect(ctx, -20, -36, 40, 16, 3); ctx.fill();
    ctx.fillStyle = '#3a4040'; rrect(ctx, -16, 0, 32, 56, 6); ctx.fill();
    ctx.restore();
    grain(ctx, f.W, f.H, 0.06, 100 + d);
    add(`offshore-pump-${d}`, f, { dx: 8, dy: 3 });
  }
}

// ---------- Pumpjack ----------
function buildPumpjack() {
  for (let d = 0; d < 4; d++) {
    const f = frame(3, 3, 0.4, 0.3, 0.3);
    const { ctx, x0, y0 } = f;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, x0 + 10, y0 + 18, 172, 170, 10); ctx.fill();
    box(ctx, x0 + 10, y0 + 10, 172, 160, 10, [100, 96, 88], { r: 8 });
    // pipe output
    const pos = [[x0 + 160, y0 + 8], [x0 + 186, y0 + 160], [x0 + 32, y0 + 186], [x0 + 6, y0 + 32]][d];
    pipeStub(ctx, pos[0], pos[1], d, 16);
    ctx.fillStyle = '#1e1e1c'; ellipse(ctx, x0 + 60, y0 + 110, 18, 12); ctx.fill();
    grain(ctx, f.W, f.H, 0.06, 110 + d);
    add(`pumpjack-${d}`, f, { dx: 8, dy: 3 });
  }
  // rocking beam frames
  for (let i = 0; i < 16; i++) {
    const [c, ctx] = mkc(200, 200);
    const a = Math.sin(i / 16 * Math.PI * 2) * 0.32;
    // A-frame
    ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(110, 170); ctx.lineTo(120, 70); ctx.lineTo(150, 170); ctx.stroke();
    ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(110, 170); ctx.lineTo(120, 70); ctx.lineTo(150, 170); ctx.stroke();
    // beam
    ctx.save(); ctx.translate(120, 66); ctx.rotate(a);
    ctx.fillStyle = vgrad(ctx, -8, 8, [[0, '#d0a040'], [1, '#6a4a10']]); ctx.fillRect(-80, -8, 140, 14);
    // horse head
    ctx.fillStyle = vgrad(ctx, -20, 30, [[0, '#c89a40'], [1, '#5a4010']]);
    ctx.beginPath(); ctx.moveTo(-80, -14); ctx.quadraticCurveTo(-104, 0, -86, 34); ctx.lineTo(-74, 30); ctx.lineTo(-76, -8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    // counterweight
    ctx.fillStyle = '#4a4a46'; rrect(ctx, 40, 4, 30, 24, 4); ctx.fill();
    ctx.restore();
    // rod from horse head
    const hx = 120 + Math.cos(a) * -88 - Math.sin(a) * 30, hy = 66 + Math.sin(a) * -88 + Math.cos(a) * 30;
    ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(32, 150); ctx.stroke();
    rivet(ctx, 120, 66, 7, [140, 140, 134]);
    addRaw(`pumpjack-beam-${i}`, c, 0, -0.55);
  }
}

// ---------- Oil refinery (5x5) ----------
function buildRefinery() {
  for (let d = 0; d < 4; d++) {
    const f = frame(5, 5, 1.6, 0.3, 0.3);
    const { ctx, x0, y0 } = f;
    const W = 320;
    // pipe connections: inputs at south (relative), outputs north
    const rot = (lx: number, ly: number): [number, number] => {
      const c = [lx, ly];
      for (let i = 0; i < d; i++) { const t = c[0]; c[0] = -c[1]; c[1] = t; }
      return [x0 + 160 + c[0] * 64, y0 + 160 + c[1] * 64];
    };
    for (const [lx, ly, dd] of [[-1, 2.35, 2], [1, 2.35, 2], [-2, -2.35, 0], [0, -2.35, 0], [2, -2.35, 0]] as [number, number, number][]) {
      const [px, py] = rot(lx, ly); pipeStub(ctx, px, py, (dd + d) % 4, 18);
    }
    const col: RGB = [120, 112, 100];
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, x0 + 12, y0 + 22, W - 24, W - 24, 14); ctx.fill();
    box(ctx, x0 + 12, y0 + 12, W - 24, W - 40, 16, col, { r: 14 });
    // inner platform
    ctx.fillStyle = sh(col, 0.75); rrect(ctx, x0 + 36, y0 + 34, W - 72, W - 90, 10); ctx.fill();
    // towers
    const towers = [[110, 90, 30, 150], [210, 110, 24, 120], [160, 200, 34, 110], [90, 210, 20, 80]];
    for (const [tx, ty, r, h] of towers) cylinder(ctx, x0 + tx, y0 + ty - h, r, r * 0.45, h, [150, 142, 128]);
    // walkway rings
    for (const [tx, ty, r, h] of towers) { ctx.strokeStyle = '#d0a030'; ctx.lineWidth = 2; ellipse(ctx, x0 + tx, y0 + ty - h * 0.55, r + 4, (r + 4) * 0.45); ctx.stroke(); }
    // flare stack
    cylinder(ctx, x0 + 250, y0 + 40 - 90, 8, 4, 140, [110, 105, 100]);
    // pipes on deck
    ctx.strokeStyle = '#7a8890'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(x0 + 60, y0 + 240); ctx.lineTo(x0 + 260, y0 + 240); ctx.moveTo(x0 + 60, y0 + 260); ctx.lineTo(x0 + 220, y0 + 160); ctx.stroke();
    grain(ctx, f.W, f.H, 0.06, 120 + d);
    add(`oil-refinery-${d}`, f, { dx: 22, dy: 5, k: 0.3 });
  }
}

// ---------- Chemical plant ----------
function buildChemPlant() {
  for (let d = 0; d < 4; d++) {
    const f = frame(3, 3, 0.9, 0.3, 0.3);
    const { ctx, x0, y0 } = f;
    const rot = (lx: number, ly: number): [number, number] => {
      const c = [lx, ly];
      for (let i = 0; i < d; i++) { const t = c[0]; c[0] = -c[1]; c[1] = t; }
      return [x0 + 96 + c[0] * 64, y0 + 96 + c[1] * 64];
    };
    for (const [lx, ly, dd] of [[-1, 1.35, 2], [1, 1.35, 2], [-1, -1.35, 0], [1, -1.35, 0]] as [number, number, number][]) {
      const [px, py] = rot(lx, ly); pipeStub(ctx, px, py, (dd + d) % 4, 16);
    }
    const col: RGB = [118, 120, 116];
    const t = machine(f, [60, 140, 90], { h: 18, base: col, r: 10 });
    // two domes
    for (const [dx, dy] of [[-30, -6], [30, 18]]) {
      const cx = x0 + 96 + dx, cy = t.ty + t.th / 2 + dy;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(ctx, cx + 4, cy + 6, 30, 22); ctx.fill();
      ctx.fillStyle = rgrad(ctx, cx - 10, cy - 20, 4, 42, [[0, '#d8dcd8'], [0.6, '#8a908c'], [1, '#4a504c']]);
      ctx.beginPath(); ctx.ellipse(cx, cy, 30, 34, 0, Math.PI, 0); ctx.ellipse(cx, cy, 30, 12, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#50a070'; ctx.fillRect(cx - 30, cy - 4, 60, 4);
    }
    cylinder(ctx, x0 + 150, t.ty - 30, 8, 4, 50, [110, 110, 104]);
    grain(ctx, f.W, f.H, 0.06, 130 + d);
    add(`chemical-plant-${d}`, f, { dx: 16, dy: 4, k: 0.25 });
  }
}

// ---------- Centrifuge ----------
function buildCentrifuge() {
  const f = frame(3, 3, 1.2, 0.3, 0.3);
  const { ctx, x0, y0 } = f;
  const t = machine(f, [60, 160, 50], { h: 16, base: [110, 112, 108], r: 12 });
  cylinder(ctx, x0 + 96, t.ty - 50, 46, 20, 110, [150, 152, 146]);
  for (let i = 0; i < 3; i++) { ctx.fillStyle = '#204a18'; rrect(ctx, x0 + 62 + i * 26, t.ty - 10, 14, 50, 4); ctx.fill(); }
  grain(ctx, f.W, f.H, 0.05, 140);
  add('centrifuge', f, { dx: 16, dy: 4, k: 0.3 });
  const [c, g] = mkc(110, 110); glow(g, 55, 55, 50, [100, 255, 80], 0.8); addRaw('centrifuge-glow', c, 0, -0.6);
}

// ---------- Solar / accumulator ----------
function buildSolar() {
  const f = frame(3, 3, 0.25, 0.2, 0.15);
  const { ctx, x0, y0 } = f;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x0 + 6, y0 + 10, 184, 182);
  ctx.fillStyle = vgrad(ctx, y0, y0 + 192, [[0, '#c0c0bc'], [1, '#6a6a66']]); ctx.fillRect(x0 + 2, y0 + 2, 188, 184);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const px = x0 + 8 + c * 60, py = y0 + 8 + r * 58;
    ctx.fillStyle = lgrad(ctx, px, py, px + 56, py + 54, [[0, '#3a5a9a'], [0.5, '#1a2a5a'], [1, '#101a3a']]);
    ctx.fillRect(px, py, 56, 54);
    ctx.strokeStyle = 'rgba(160,190,240,0.35)'; ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px + k * 14, py); ctx.lineTo(px + k * 14, py + 54); ctx.stroke(); }
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px, py + k * 13.5); ctx.lineTo(px + 56, py + k * 13.5); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; poly(ctx, [[px, py], [px + 30, py], [px, py + 30]]); ctx.fill();
  }
  ctx.fillStyle = '#4a4a46'; ctx.fillRect(x0 + 2, y0 + 186, 188, 6);
  add('solar-panel', f, { dx: 6, dy: 3 });
  // accumulator
  const g = frame(2, 2, 0.8, 0.2, 0.2);
  const c2 = g.ctx;
  c2.fillStyle = 'rgba(0,0,0,0.3)'; rrect(c2, g.x0 + 6, g.y0 + 16, 120, 112, 8); c2.fill();
  box(c2, g.x0 + 6, g.y0 + 50, 116, 64, 12, [90, 92, 90], { r: 6 });
  for (const [px, py] of [[36, 38], [92, 38], [36, 84], [92, 84]]) cylinder(c2, g.x0 + px, g.y0 + py - 50, 22, 10, 52, [150, 152, 150]);
  for (const [px, py] of [[36, 38], [92, 38], [36, 84], [92, 84]]) { c2.fillStyle = '#c8a030'; c2.fillRect(g.x0 + px - 22, g.y0 + py - 26, 44, 4); }
  grain(c2, g.W, g.H, 0.05, 150);
  add('accumulator', g, { dx: 12, dy: 4, k: 0.3 });
  const [gc, gg] = mkc(128, 128); glow(gg, 64, 64, 60, [255, 255, 255], 0.5); addRaw('accumulator-glow', gc, 0, -0.4);
}

// ---------- Radar, lamp, beacon ----------
function buildRadarLampBeacon() {
  {
    const f = frame(3, 3, 0.5, 0.3, 0.3);
    const t = machine(f, [60, 120, 160], { h: 16, base: [112, 114, 110], r: 14 });
    cylinder(f.ctx, f.x0 + 96, t.ty + 10, 34, 16, 40, [100, 104, 104]);
    add('radar', f, { dx: 14, dy: 4, k: 0.2 });
    const [c, ctx] = mkc(160, 120);
    ctx.fillStyle = 'rgba(0,0,0,0.0)';
    ctx.fillStyle = lgrad(ctx, 10, 20, 150, 100, [[0, '#d8dcd8'], [0.5, '#9aa09c'], [1, '#4a504c']]);
    ctx.beginPath(); ctx.moveTo(10, 30); ctx.quadraticCurveTo(80, 0, 150, 30); ctx.lineTo(140, 90); ctx.quadraticCurveTo(80, 110, 20, 90); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(10 + i * 23, 18); ctx.lineTo(16 + i * 21, 98); ctx.stroke(); }
    ctx.fillStyle = '#5a5e5a'; ctx.fillRect(74, 50, 12, 40);
    addRaw('radar-dish', c, 0, -0.75);
  }
  {
    const f = frame(1, 1, 0.5, 0.15, 0.15);
    const { ctx, x0, y0 } = f;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(ctx, x0 + 33, y0 + 44, 18, 8); ctx.fill();
    cylinder(ctx, x0 + 32, y0 + 14, 14, 6, 26, [90, 92, 92]);
    ctx.fillStyle = rgrad(ctx, x0 + 28, y0 + 4, 2, 20, [[0, '#ffffff'], [0.5, '#c8d0d0'], [1, '#6a7070']]);
    ctx.beginPath(); ctx.arc(x0 + 32, y0 + 10, 14, Math.PI, 0); ctx.lineTo(x0 + 46, y0 + 14); ctx.lineTo(x0 + 18, y0 + 14); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
    add('small-lamp', f, { dx: 6, dy: 2, k: 0.3 });
    const [c, g] = mkc(48, 48); glow(g, 24, 24, 22, [255, 250, 220], 1); addRaw('lamp-glow', c, 0, -0.35);
  }
  {
    const f = frame(3, 3, 0.9, 0.3, 0.3);
    const t = machine(f, [90, 60, 160], { h: 14, base: [96, 98, 104], r: 12 });
    cylinder(f.ctx, f.x0 + 96, t.ty - 20, 18, 8, 50, [110, 112, 120]);
    add('beacon', f, { dx: 14, dy: 4, k: 0.25 });
    const [c, ctx] = mkc(96, 64);
    ctx.fillStyle = lgrad(ctx, 0, 0, 96, 64, [[0, '#c8c8d8'], [1, '#4a4a5a']]);
    ctx.beginPath(); ctx.ellipse(48, 32, 44, 18, 0, 0, 6.3); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
    ctx.fillStyle = '#7a5ad0'; ctx.beginPath(); ctx.arc(48, 30, 8, 0, 6.3); ctx.fill();
    addRaw('beacon-top', c, 0, -1.0);
  }
}

// ---------- Storage tank ----------
function buildTank() {
  for (const v of [0, 1]) {
    const f = frame(3, 3, 0.8, 0.3, 0.3);
    const { ctx, x0, y0 } = f;
    const cx = x0 + 96, cy = y0 + 96;
    // corner pipe stubs on diagonal
    const P: RGB = [102, 118, 128];
    const corners = v === 0 ? [[0, 0, 0], [0, 0, 3], [2, 2, 2], [2, 2, 1]] : [[2, 0, 0], [2, 0, 1], [0, 2, 2], [0, 2, 3]];
    for (const [tx, ty, d] of corners) {
      const px = x0 + tx * 64 + 32, py = y0 + ty * 64 + 32;
      const off = [[0, -26], [26, 0], [0, 26], [-26, 0]][d];
      pipeStub(ctx, px + off[0], py + off[1], d, 12);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(ctx, cx + 4, cy + 18, 88, 70); ctx.fill();
    cylinder(ctx, cx, cy - 34, 86, 60, 56, [140, 136, 126]);
    ctx.fillStyle = rgrad(ctx, cx - 20, cy - 54, 6, 90, [[0, '#cac6ba'], [1, '#7a766a']]);
    ellipse(ctx, cx, cy - 34, 86, 60); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ellipse(ctx, cx, cy - 34, 86, 60); ctx.stroke();
    ellipse(ctx, cx, cy - 34, 60, 42); ctx.stroke();
    ctx.fillStyle = '#5a5a54'; rrect(ctx, cx - 10, cy - 44, 20, 20, 4); ctx.fill();
    grain(ctx, f.W, f.H, 0.05, 160 + v);
    add(`storage-tank-${v}`, f, { dx: 14, dy: 4, k: 0.25 });
  }
}

// ---------- Nuclear ----------
function buildNuclear() {
  const f = frame(5, 5, 1.0, 0.3, 0.3);
  const { ctx, x0, y0 } = f;
  // heat connection points (around edges)
  for (let i = 0; i < 3; i++) for (const side of [0, 1, 2, 3]) {
    const off = (i - 1) * 2;
    const px = side === 1 ? x0 + 316 : side === 3 ? x0 + 4 : x0 + 160 + off * 64;
    const py = side === 0 ? y0 + 4 : side === 2 ? y0 + 316 : y0 + 160 + off * 64;
    ctx.fillStyle = '#9a5a30'; rrect(ctx, px - 14, py - 14, 28, 28, 4); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, x0 + 16, y0 + 26, 288, 288, 20); ctx.fill();
  box(ctx, x0 + 16, y0 + 10, 288, 264, 30, [130, 130, 124], { r: 24 });
  ctx.fillStyle = '#5a5a56'; rrect(ctx, x0 + 60, y0 + 50, 200, 184, 16); ctx.fill();
  cylinder(ctx, x0 + 160, y0 + 40, 70, 40, 70, [150, 150, 144]);
  ctx.fillStyle = '#2a3a28'; ellipse(ctx, x0 + 160, y0 + 40, 50, 28); ctx.fill();
  stripes(ctx, x0 + 30, y0 + 260, 260, 10, 10, '#d0a020', '#222');
  grain(ctx, f.W, f.H, 0.05, 170);
  add('nuclear-reactor', f, { dx: 20, dy: 5, k: 0.2 });
  const [c, g] = mkc(200, 160); glow(g, 100, 80, 90, [100, 255, 80], 0.9); addRaw('reactor-glow', c, 0, -0.7);
  // heat pipe masks
  for (let mask = 0; mask < 16; mask++) {
    const hf = frame(1, 1, 0.1, 0.1, 0.1);
    const hc = hf.ctx, cx = hf.x0 + 32, cy = hf.y0 + 32;
    const col: RGB = [150, 100, 70];
    const seg = (x1: number, y1: number) => {
      hc.strokeStyle = sh(col, 0.4); hc.lineWidth = 20; hc.beginPath(); hc.moveTo(cx, cy); hc.lineTo(x1, y1); hc.stroke();
      hc.strokeStyle = css(col); hc.lineWidth = 14; hc.beginPath(); hc.moveTo(cx, cy); hc.lineTo(x1, y1); hc.stroke();
      hc.strokeStyle = sh(col, 1.4, 0.7); hc.lineWidth = 4; hc.beginPath(); hc.moveTo(cx - 2, cy - 3); hc.lineTo(x1 - 2, y1 - 3); hc.stroke();
    };
    hc.lineCap = 'butt';
    if (mask & 1) seg(cx, cy - 32); if (mask & 2) seg(cx + 32, cy); if (mask & 4) seg(cx, cy + 32); if (mask & 8) seg(cx - 32, cy);
    hc.fillStyle = rgrad(hc, cx - 3, cy - 3, 1, 14, [[0, sh(col, 1.3)], [1, sh(col, 0.5)]]); rrect(hc, cx - 12, cy - 12, 24, 24, 6); hc.fill();
    add(`heat-pipe-${mask}`, hf, { dx: 4, dy: 2 });
  }
}

// ---------- Rocket silo ----------
function buildSilo() {
  const f = frame(9, 9, 0.5, 0.3, 0.3);
  const { ctx, x0, y0 } = f;
  const W = 576;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, x0 + 10, y0 + 20, W - 20, W - 20, 30); ctx.fill();
  box(ctx, x0 + 10, y0 + 10, W - 20, W - 50, 30, [120, 120, 114], { r: 30 });
  ctx.fillStyle = '#4a4a46'; ctx.beginPath(); ctx.arc(x0 + 288, y0 + 270, 190, 0, 6.3); ctx.fill();
  ctx.fillStyle = rgrad(ctx, x0 + 288, y0 + 270, 40, 190, [[0, '#1a1a18'], [1, '#3a3a36']]); ctx.beginPath(); ctx.arc(x0 + 288, y0 + 270, 176, 0, 6.3); ctx.fill();
  stripes(ctx, x0 + 40, y0 + 500, 496, 16, 14, '#d0a020', '#222');
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; cylinder(ctx, x0 + 288 + Math.cos(a) * 230, y0 + 270 + Math.sin(a) * 230 - 40, 20, 9, 40, [140, 140, 134]); }
  grain(ctx, f.W, f.H, 0.05, 180);
  add('rocket-silo', f, { dx: 24, dy: 5 });
  for (const side of [0, 1]) {
    const [c, d] = mkc(176, 352);
    d.fillStyle = hgrad(d, 0, 176, [[0, '#8a8a84'], [1, '#4a4a46']]); d.fillRect(0, 0, 176, 352);
    stripes(d, side ? 0 : 160, 0, 16, 352, 12, '#d0a020', '#222');
    addRaw(`silo-door-${side}`, c);
  }
  const [rc, r] = mkc(96, 320);
  r.fillStyle = hgrad(r, 20, 76, [[0, '#9a9a94'], [0.35, '#f0f0ea'], [1, '#7a7a74']]);
  r.beginPath(); r.moveTo(20, 300); r.lineTo(20, 70); r.quadraticCurveTo(48, -10, 76, 70); r.lineTo(76, 300); r.closePath(); r.fill();
  r.fillStyle = '#c03020'; r.fillRect(20, 120, 56, 10);
  r.fillStyle = '#5a5a56'; poly(r, [[20, 260], [0, 310], [20, 300]]); r.fill(); poly(r, [[76, 260], [96, 310], [76, 300]]); r.fill();
  addRaw('rocket', rc);
}

// ---------- Roboport ----------
function buildRoboport() {
  const f = frame(4, 4, 1.0, 0.3, 0.3);
  const { ctx, x0, y0 } = f;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, x0 + 10, y0 + 20, 236, 236, 16); ctx.fill();
  box(ctx, x0 + 10, y0 + 10, 236, 210, 26, [100, 100, 96], { r: 16 });
  for (const [px, py] of [[50, 46], [206, 46], [50, 190], [206, 190]]) {
    ctx.fillStyle = '#2a2a28'; rrect(ctx, x0 + px - 26, y0 + py - 22, 52, 44, 6); ctx.fill();
    ctx.fillStyle = '#c8a030'; ctx.fillRect(x0 + px - 22, y0 + py - 2, 44, 4); ctx.fillRect(x0 + px - 2, y0 + py - 18, 4, 36);
  }
  cylinder(ctx, x0 + 128, y0 + 40, 46, 22, 70, [120, 120, 116]);
  ctx.fillStyle = '#3a3a36'; ellipse(ctx, x0 + 128, y0 + 40, 30, 14); ctx.fill();
  cylinder(ctx, x0 + 170, y0 - 40, 4, 2, 80, [140, 140, 136]);
  grain(ctx, f.W, f.H, 0.05, 190);
  add('roboport', f, { dx: 18, dy: 4, k: 0.25 });
}

// ---------- Combinators etc ----------
function buildCircuit() {
  for (const id of ['arithmetic-combinator', 'decider-combinator', 'selector-combinator']) {
    for (let d = 0; d < 4; d++) {
      const horiz = d % 2 === 1;
      const f = horiz ? frame(2, 1, 0.4, 0.15, 0.15) : frame(1, 2, 0.4, 0.15, 0.15);
      const { ctx, x0, y0 } = f;
      const W = horiz ? 128 : 64, H = horiz ? 64 : 128;
      box(ctx, x0 + 8, y0 + 4, W - 16, H - 22, 14, [100, 102, 100], { r: 6 });
      ctx.fillStyle = '#121a12'; rrect(ctx, x0 + W / 2 - 18, y0 + H / 2 - 18, 36, 24, 3); ctx.fill();
      ctx.fillStyle = id === 'arithmetic-combinator' ? '#e8a030' : id === 'decider-combinator' ? '#40c0f0' : '#e050c0';
      ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(id === 'arithmetic-combinator' ? '+' : id === 'decider-combinator' ? '>' : '≡', x0 + W / 2, y0 + H / 2 - 6);
      // in/out terminals
      ctx.save(); ctx.translate(x0 + W / 2, y0 + H / 2); ctx.rotate(d * Math.PI / 2);
      ctx.fillStyle = '#c8a030'; ctx.fillRect(-14, -54, 8, 10); ctx.fillRect(6, -54, 8, 10);
      ctx.fillStyle = '#8a8a84'; ctx.fillRect(-14, 40, 8, 10); ctx.fillRect(6, 40, 8, 10);
      ctx.restore();
      add(`${id}-${d}`, f, { dx: 8, dy: 3 });
    }
  }
  {
    const f = frame(1, 1, 0.4, 0.15, 0.15);
    box(f.ctx, f.x0 + 8, f.y0 + 4, 48, 40, 14, [100, 102, 100], { r: 6 });
    f.ctx.fillStyle = '#c03030'; rrect(f.ctx, f.x0 + 18, f.y0 + 12, 28, 18, 3); f.ctx.fill();
    add('constant-combinator', f, { dx: 8, dy: 3 });
  }
  {
    const f = frame(2, 2, 0.6, 0.2, 0.2);
    box(f.ctx, f.x0 + 14, f.y0 + 16, 100, 80, 20, [110, 110, 106], { r: 8 });
    f.ctx.fillStyle = '#3a3a36'; rrect(f.ctx, f.x0 + 40, f.y0 + 30, 48, 40, 4); f.ctx.fill();
    add('power-switch', f, { dx: 10, dy: 3, k: 0.2 });
    const [c, g] = mkc(40, 12); g.fillStyle = '#ddd'; rrect(g, 0, 0, 40, 12, 3); g.fill(); addRaw('switch-lever', c);
  }
  {
    const f = frame(1, 1, 0.8, 0.15, 0.15);
    cylinder(f.ctx, f.x0 + 32, f.y0 - 10, 14, 6, 46, [100, 100, 98]);
    f.ctx.fillStyle = '#222'; f.ctx.beginPath(); f.ctx.arc(f.x0 + 32, f.y0 + 6, 9, 0, 6.3); f.ctx.fill();
    add('programmable-speaker', f, { dx: 6, dy: 2, k: 0.3 });
  }
  {
    const f = frame(1, 1, 0.3, 0.15, 0.15);
    box(f.ctx, f.x0 + 6, f.y0 + 8, 52, 38, 12, [80, 82, 80], { r: 4 });
    f.ctx.fillStyle = '#0a0f0a'; rrect(f.ctx, f.x0 + 12, f.y0 + 12, 40, 30, 3); f.ctx.fill();
    add('display-panel', f, { dx: 6, dy: 2 });
  }
}

export function buildProduction() {
  buildDrills(); buildFurnaces(); buildAssemblers(); buildLab(); buildBoilers(); buildGenerators(); buildOffshore();
  buildPumpjack(); buildRefinery(); buildChemPlant(); buildCentrifuge(); buildSolar(); buildRadarLampBeacon(); buildTank();
  buildNuclear(); buildSilo(); buildRoboport(); buildCircuit();
}
