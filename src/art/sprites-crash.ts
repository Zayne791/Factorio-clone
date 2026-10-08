// Crash site: the wrecked spaceship and scattered hull debris around the starting position.
import { mkc, sh, rgrad, lgrad, poly, grain, ellipse, rivet, makeShadowAt, RGB, Ctx } from './draw';
import { frame, add, addRaw, A } from './sprites-common';
import { RNG } from '../engine/noise';

const HULL: RGB = [150, 152, 150];
const DARK: RGB = [60, 62, 64];
const ORANGE: RGB = [200, 120, 40];

function plate(ctx: Ctx, pts: number[][], base: RGB, R: RNG) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  ctx.fillStyle = lgrad(ctx, x0, y0, x1, y1, [[0, sh(base, 1.25)], [0.5, sh(base, 0.95)], [1, sh(base, 0.55)]]);
  poly(ctx, pts); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
  // panel seams & rivets
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) { const t = R.range(0.2, 0.8); ctx.beginPath(); ctx.moveTo(x0 + (x1 - x0) * t, y0 + 2); ctx.lineTo(x0 + (x1 - x0) * t + R.range(-6, 6), y1 - 2); ctx.stroke(); }
}
function scorch(ctx: Ctx, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = rgrad(ctx, x, y, 2, Math.max(rx, ry), [[0, 'rgba(20,14,8,0.75)'], [0.6, 'rgba(30,22,12,0.4)'], [1, 'rgba(30,22,12,0)']]);
  ellipse(ctx, x, y, rx, ry); ctx.fill();
}

export function buildCrashSite() {
  // --- main spaceship wreck (approx. 10 x 6 tiles) ---
  {
    const f = frame(10, 6, 1.2, 0.4, 0.5);
    const { ctx, x0, y0 } = f;
    const R = new RNG(4242);
    const W = 10 * 64, H = 6 * 64;
    scorch(ctx, x0 + W * 0.5, y0 + H * 0.62, W * 0.55, H * 0.5);
    // dirt furrow behind the ship
    ctx.fillStyle = 'rgba(40,30,18,0.55)'; poly(ctx, [[x0 - 20, y0 + H * 0.45], [x0 + W * 0.3, y0 + H * 0.38], [x0 + W * 0.32, y0 + H * 0.78], [x0 - 20, y0 + H * 0.7]]); ctx.fill();
    // engine section (left), cracked hull (middle), cockpit (right)
    plate(ctx, [[x0 + 30, y0 + 120], [x0 + 200, y0 + 70], [x0 + 260, y0 + 120], [x0 + 250, y0 + 300], [x0 + 60, y0 + 320], [x0 + 20, y0 + 250]], HULL, R);
    for (const [cx, cy] of [[x0 + 70, y0 + 170], [x0 + 80, y0 + 260]]) {
      ctx.fillStyle = rgrad(ctx, cx, cy, 2, 34, [[0, '#2a2a2a'], [0.7, '#111'], [1, '#3a3a3a']]); ellipse(ctx, cx, cy, 30, 34); ctx.fill();
      ctx.strokeStyle = sh(DARK, 1.3); ctx.lineWidth = 4; ellipse(ctx, cx, cy, 30, 34); ctx.stroke();
    }
    plate(ctx, [[x0 + 250, y0 + 90], [x0 + 420, y0 + 60], [x0 + 450, y0 + 140], [x0 + 440, y0 + 300], [x0 + 270, y0 + 320], [x0 + 240, y0 + 200]], HULL, R);
    // crack with exposed interior
    ctx.fillStyle = '#1a1612'; poly(ctx, [[x0 + 330, y0 + 70], [x0 + 360, y0 + 150], [x0 + 340, y0 + 220], [x0 + 372, y0 + 310], [x0 + 352, y0 + 312], [x0 + 318, y0 + 220], [x0 + 336, y0 + 150]]); ctx.fill();
    ctx.strokeStyle = '#c87a30'; ctx.lineWidth = 2; ctx.stroke();
    plate(ctx, [[x0 + 440, y0 + 110], [x0 + 560, y0 + 120], [x0 + 630, y0 + 200], [x0 + 560, y0 + 290], [x0 + 440, y0 + 290]], HULL, R);
    // cockpit glass (shattered)
    ctx.fillStyle = lgrad(ctx, x0 + 520, y0 + 150, x0 + 610, y0 + 250, [[0, 'rgba(120,170,200,0.9)'], [1, 'rgba(30,50,70,0.95)']]);
    poly(ctx, [[x0 + 530, y0 + 150], [x0 + 590, y0 + 180], [x0 + 612, y0 + 205], [x0 + 585, y0 + 245], [x0 + 530, y0 + 255]]); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(x0 + 565, y0 + 205); ctx.lineTo(x0 + 565 + Math.cos(i) * 40, y0 + 205 + Math.sin(i) * 45); ctx.stroke(); }
    // orange stripes / markings
    ctx.fillStyle = sh(ORANGE, 1); poly(ctx, [[x0 + 270, y0 + 290], [x0 + 440, y0 + 275], [x0 + 440, y0 + 292], [x0 + 272, y0 + 306]]); ctx.fill();
    ctx.fillStyle = sh(ORANGE, 0.9); poly(ctx, [[x0 + 60, y0 + 300], [x0 + 245, y0 + 285], [x0 + 246, y0 + 300], [x0 + 62, y0 + 316]]); ctx.fill();
    for (let i = 0; i < 26; i++) rivet(ctx, x0 + R.range(60, 600), y0 + R.range(100, 290), 2.2, [120, 120, 118]);
    // broken wing
    plate(ctx, [[x0 + 300, y0 + 300], [x0 + 470, y0 + 300], [x0 + 520, y0 + 370], [x0 + 330, y0 + 380]], [128, 130, 128], R);
    grain(ctx, f.W, f.H, 0.08, 4243);
    add('crash-site-spaceship', f, { dx: 26, dy: 8, k: 0.25, alpha: 0.75 });
  }
  // --- debris pieces ---
  const R = new RNG(777);
  for (let i = 0; i < 6; i++) {
    const big = i < 2;
    const s = big ? 120 : 64;
    const [c, ctx] = mkc(s + 40, s + 30);
    const cx = (s + 40) / 2, cy = (s + 30) / 2 + 4;
    scorch(ctx, cx, cy + 4, s * 0.55, s * 0.35);
    const n = 5 + Math.floor(R.next() * 3);
    const pts: number[][] = [];
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + R.range(-0.3, 0.3); const r = s * R.range(0.28, 0.48); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6 - 6]); }
    plate(ctx, pts, R.next() < 0.3 ? [170, 110, 50] : HULL, R);
    if (R.next() < 0.6) { ctx.fillStyle = sh(ORANGE, 0.9); ctx.fillRect(cx - s * 0.2, cy - 8, s * 0.4, 5); }
    for (let k = 0; k < 4; k++) rivet(ctx, cx + R.range(-s * 0.3, s * 0.3), cy + R.range(-s * 0.2, s * 0.1), 1.8, [120, 120, 118]);
    grain(ctx, c.width, c.height, 0.08, 900 + i);
    addRaw(`crash-debris-${i}`, c);
    A.add(`crash-debris-${i}-shadow`, makeShadowAt(c, 8, 3, 0.2, cy + s * 0.2, 0.6), 0, 0);
  }
}
