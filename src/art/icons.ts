// Procedural 64x64 item / fluid / recipe / signal icons.
import { Ctx, RGB, mkc, hex, css, sh, shade, mix, rrect, vgrad, hgrad, lgrad, rgrad, gear, ellipse, poly, glow, cylinder, rivet, stripes, grain, METAL, STEEL, COPPER, YELLOW, RED, BLUE, GREEN, DARK } from './draw';
import { RNG } from '../engine/noise';
import { FLUIDS, ITEMS, RECIPES } from '../data/protos';

export const ICON = 64;
type IconFn = (ctx: Ctx) => void;

const FLUID_RGB = (id: string): RGB => { const c = FLUIDS[id].color; return [c[0] * 255, c[1] * 255, c[2] * 255]; };

// ---------- primitives ----------
function rock(ctx: Ctx, x: number, y: number, r: number, base: RGB, seed: number, spec = 0.3) {
  const R = new RNG(seed);
  const n = 7;
  const pts: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R.next() * 0.4;
    const rr = r * (0.75 + R.next() * 0.35);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85]);
  }
  poly(ctx, pts);
  ctx.fillStyle = rgrad(ctx, x - r * 0.4, y - r * 0.5, 0, r * 1.5, [[0, sh(base, 1 + spec)], [0.5, sh(base, 0.95)], [1, sh(base, 0.45)]]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  // facets
  ctx.strokeStyle = sh(base, 1.4, 0.35);
  ctx.beginPath(); ctx.moveTo(pts[3][0], pts[3][1]); ctx.lineTo(x - r * 0.1, y - r * 0.1); ctx.lineTo(pts[6][0], pts[6][1]); ctx.stroke();
}
function orePile(base: RGB, seed: number, spec = 0.3, fleck?: RGB): IconFn {
  return ctx => {
    const R = new RNG(seed);
    const spots = [[32, 42, 15], [20, 34, 11], [44, 33, 11], [30, 24, 10], [16, 48, 8], [48, 48, 8], [40, 20, 7]];
    for (let i = spots.length - 1; i >= 0; i--) {
      const [x, y, r] = spots[i];
      rock(ctx, x + R.range(-2, 2), y + R.range(-2, 2), r, shade(base, R.range(0.85, 1.1)), seed + i * 13, spec);
    }
    if (fleck) {
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = css(fleck, 0.85);
        ctx.fillRect(R.range(10, 54), R.range(14, 56), 2, 2);
      }
    }
  };
}
function plates(base: RGB, n = 3, stamp?: string): IconFn {
  return ctx => {
    for (let i = n - 1; i >= 0; i--) {
      const ox = 8 + i * 3, oy = 18 + i * 7;
      ctx.save();
      ctx.translate(ox, oy);
      // plate in perspective
      poly(ctx, [[4, 0], [44, 0], [48, 14], [0, 14]]);
      ctx.fillStyle = lgrad(ctx, 0, 0, 48, 14, [[0, sh(base, 1.35)], [0.5, sh(base, 1.0)], [1, sh(base, 0.75)]]);
      ctx.fill();
      ctx.fillStyle = sh(base, 0.5);
      poly(ctx, [[0, 14], [48, 14], [48, 18], [0, 18]]); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
      poly(ctx, [[4, 0], [44, 0], [48, 14], [48, 18], [0, 18], [0, 14]]); ctx.stroke();
      ctx.strokeStyle = sh(base, 1.6, 0.6); ctx.beginPath(); ctx.moveTo(5, 1); ctx.lineTo(43, 1); ctx.stroke();
      ctx.restore();
    }
    if (stamp) { ctx.fillStyle = sh(base, 0.6); ctx.font = 'bold 9px sans-serif'; ctx.fillText(stamp, 26, 28); }
  };
}
function flask(liquid: RGB, shape: number): IconFn {
  return ctx => {
    ctx.save();
    // glass body shapes: 0 erlenmeyer, 1 round, 2 tall, 3 square bottle, 4 hex, 5 tube, 6 orb
    const glass = 'rgba(200,220,230,0.35)';
    ctx.lineWidth = 2;
    const body = new Path2D();
    if (shape === 0) { body.moveTo(26, 8); body.lineTo(38, 8); body.lineTo(38, 22); body.lineTo(54, 52); body.quadraticCurveTo(56, 58, 50, 58); body.lineTo(14, 58); body.quadraticCurveTo(8, 58, 10, 52); body.lineTo(26, 22); body.closePath(); }
    else if (shape === 1) { body.moveTo(27, 8); body.lineTo(37, 8); body.lineTo(37, 24); body.arc(32, 40, 18, -1.28, Math.PI + 1.28, false); body.lineTo(27, 8); body.closePath(); }
    else if (shape === 2) { body.moveTo(24, 6); body.lineTo(40, 6); body.lineTo(40, 14); body.lineTo(46, 20); body.lineTo(46, 56); body.lineTo(18, 56); body.lineTo(18, 20); body.lineTo(24, 14); body.closePath(); }
    else if (shape === 3) { body.moveTo(26, 6); body.lineTo(38, 6); body.lineTo(38, 16); body.lineTo(50, 22); body.lineTo(50, 58); body.lineTo(14, 58); body.lineTo(14, 22); body.lineTo(26, 16); body.closePath(); }
    else if (shape === 4) { body.moveTo(27, 6); body.lineTo(37, 6); body.lineTo(37, 18); body.lineTo(52, 28); body.lineTo(52, 48); body.lineTo(32, 60); body.lineTo(12, 48); body.lineTo(12, 28); body.lineTo(27, 18); body.closePath(); }
    else if (shape === 5) { body.moveTo(22, 6); body.lineTo(42, 6); body.lineTo(42, 12); body.lineTo(38, 14); body.lineTo(38, 54); body.quadraticCurveTo(32, 62, 26, 54); body.lineTo(26, 14); body.lineTo(22, 12); body.closePath(); }
    else { body.moveTo(28, 6); body.lineTo(36, 6); body.lineTo(36, 18); body.arc(32, 38, 21, -1.38, Math.PI + 1.38, false); body.closePath(); }
    ctx.fillStyle = glass; ctx.fill(body);
    // liquid
    ctx.save(); ctx.clip(body);
    const top = shape === 5 ? 24 : 30;
    ctx.fillStyle = vgrad(ctx, top, 60, [[0, css(shade(liquid, 1.25))], [0.5, css(liquid)], [1, css(shade(liquid, 0.55))]]);
    ctx.fillRect(0, top, 64, 64);
    ctx.fillStyle = css(shade(liquid, 1.5), 0.8);
    ctx.fillRect(0, top, 64, 2);
    glow(ctx, 24, top + 12, 10, shade(liquid, 1.6), 0.35);
    ctx.restore();
    ctx.strokeStyle = 'rgba(30,35,40,0.9)'; ctx.stroke(body);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(20, 30); ctx.lineTo(18, 46); ctx.stroke();
    // cork
    ctx.fillStyle = vgrad(ctx, 3, 9, [[0, '#a68a64'], [1, '#6e5638']]);
    rrect(ctx, 25, 2, 14, 7, 2); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  };
}
function pcb(board: RGB, chip: RGB, traces: RGB, n: number): IconFn {
  return ctx => {
    ctx.save(); ctx.translate(32, 34); ctx.rotate(-0.12); ctx.translate(-32, -34);
    ctx.fillStyle = sh(board, 0.45); rrect(ctx, 8, 14, 50, 40, 3); ctx.fill();
    ctx.fillStyle = lgrad(ctx, 8, 10, 56, 50, [[0, sh(board, 1.25)], [1, sh(board, 0.8)]]);
    rrect(ctx, 6, 10, 50, 40, 3); ctx.fill();
    ctx.strokeStyle = css(traces, 0.9); ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(8, 16 + i * 6); ctx.lineTo(20 + i * 3, 16 + i * 6); ctx.lineTo(24 + i * 3, 20 + i * 6); ctx.lineTo(54, 20 + i * 6); ctx.stroke(); }
    for (let i = 0; i < n; i++) {
      const cx = n === 1 ? 31 : 18 + i * 22, cy = 30;
      ctx.fillStyle = sh(chip, 0.4); rrect(ctx, cx - 9, cy - 8, 20, 18, 2); ctx.fill();
      ctx.fillStyle = lgrad(ctx, cx - 10, cy - 10, cx + 10, cy + 8, [[0, sh(chip, 1.3)], [1, sh(chip, 0.8)]]);
      rrect(ctx, cx - 10, cy - 10, 20, 18, 2); ctx.fill();
      ctx.fillStyle = '#c8c8c0';
      for (let k = 0; k < 4; k++) { ctx.fillRect(cx - 13, cy - 7 + k * 4, 3, 2); ctx.fillRect(cx + 10, cy - 7 + k * 4, 3, 2); }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; rrect(ctx, 6, 10, 50, 40, 3); ctx.stroke();
    ctx.restore();
  };
}
function barrelIcon(band?: RGB): IconFn {
  return ctx => {
    const base: RGB = [150, 150, 145];
    cylinder(ctx, 32, 12, 16, 6, 42, base);
    for (const y of [22, 44]) {
      ctx.fillStyle = sh(base, 0.6); ctx.fillRect(16, y, 32, 3);
    }
    if (band) {
      ctx.fillStyle = hgrad(ctx, 16, 48, [[0, sh(band, 0.6)], [0.35, sh(band, 1.2)], [1, sh(band, 0.5)]]);
      ctx.fillRect(16, 28, 32, 12);
      ctx.fillStyle = css(shade(band, 1.1));
      ellipse(ctx, 32, 12, 13, 4.5); ctx.fill();
    }
  };
}
function drop(ctx: Ctx, x: number, y: number, s: number, c: RGB) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.bezierCurveTo(4, -12, 16, 0, 16, 9);
  ctx.arc(0, 9, 16, 0, Math.PI, false);
  ctx.bezierCurveTo(-16, 0, -4, -12, 0, -22);
  ctx.closePath();
  ctx.fillStyle = rgrad(ctx, -5, 2, 1, 26, [[0, sh(c, 1.7)], [0.4, css(c)], [1, sh(c, 0.4)]]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5 / s; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ellipse(ctx, -6, 6, 3, 6, 0.4); ctx.fill();
  ctx.restore();
}
function fluidIcon(id: string): IconFn {
  return ctx => {
    const c = FLUID_RGB(id);
    if (id === 'steam') {
      for (const [x, y, r] of [[24, 38, 14], [38, 30, 15], [30, 22, 11], [42, 44, 10]]) {
        ctx.fillStyle = rgrad(ctx, x - 3, y - 3, 1, r, [[0, 'rgba(255,255,255,0.95)'], [1, 'rgba(180,180,185,0.6)']]);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    drop(ctx, 32, 32, 1.15, c);
  };
}
function arrow(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, c = '#fff', w = 4) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * w * 1.5, y1 - Math.sin(a) * w * 1.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - Math.cos(a - 0.5) * w * 2.8, y1 - Math.sin(a - 0.5) * w * 2.8);
  ctx.lineTo(x1 - Math.cos(a + 0.5) * w * 2.8, y1 - Math.sin(a + 0.5) * w * 2.8);
  ctx.closePath(); ctx.fill();
}

function beltIcon(rail: RGB): IconFn {
  return ctx => {
    ctx.save(); ctx.translate(32, 32); ctx.rotate(-0.6); ctx.translate(-32, -32);
    ctx.fillStyle = '#2a2a28'; ctx.fillRect(14, 2, 36, 60);
    for (let y = 4; y < 62; y += 6) { ctx.fillStyle = '#3e3e3a'; ctx.fillRect(16, y, 32, 3); ctx.fillStyle = '#1a1a18'; ctx.fillRect(16, y + 3, 32, 1); }
    for (const x of [10, 48]) {
      ctx.fillStyle = hgrad(ctx, x, x + 6, [[0, sh(rail, 0.6)], [0.4, sh(rail, 1.3)], [1, sh(rail, 0.5)]]);
      ctx.fillRect(x, 0, 6, 64);
      for (let y = 4; y < 64; y += 10) rivet(ctx, x + 3, y, 1.4, shade(rail, 0.9));
    }
    ctx.restore();
  };
}
function undergroundIcon(rail: RGB): IconFn {
  return ctx => {
    beltIcon(rail)(ctx);
    ctx.save(); ctx.translate(32, 32); ctx.rotate(-0.6);
    ctx.fillStyle = vgrad(ctx, -10, 26, [[0, sh(rail, 1.2)], [1, sh(rail, 0.55)]]);
    poly(ctx, [[-22, -6], [22, -6], [22, 22], [-22, 22]]); ctx.fill();
    ctx.fillStyle = '#151515'; poly(ctx, [[-16, -2], [16, -2], [16, 10], [-16, 10]]); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; poly(ctx, [[-22, -6], [22, -6], [22, 22], [-22, 22]]); ctx.stroke();
    ctx.restore();
  };
}
function splitterIcon(rail: RGB): IconFn {
  return ctx => {
    ctx.fillStyle = '#2a2a28'; ctx.fillRect(6, 4, 22, 56); ctx.fillRect(36, 4, 22, 56);
    for (let y = 6; y < 60; y += 6) { ctx.fillStyle = '#3e3e3a'; ctx.fillRect(8, y, 18, 3); ctx.fillRect(38, y, 18, 3); }
    ctx.fillStyle = vgrad(ctx, 20, 46, [[0, sh(rail, 1.3)], [1, sh(rail, 0.55)]]);
    rrect(ctx, 2, 20, 60, 24, 4); ctx.fill();
    ctx.fillStyle = sh(rail, 0.35); rrect(ctx, 26, 24, 12, 16, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; rrect(ctx, 2, 20, 60, 24, 4); ctx.stroke();
  };
}
function inserterIcon(c: RGB): IconFn {
  return ctx => {
    ctx.fillStyle = vgrad(ctx, 44, 62, [[0, '#7a7a74'], [1, '#3a3a36']]);
    rrect(ctx, 14, 44, 36, 16, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    const seg = (x0: number, y0: number, x1: number, y1: number, w: number) => {
      ctx.strokeStyle = sh(c, 0.4); ctx.lineWidth = w + 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = css(c); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = sh(c, 1.5, 0.7); ctx.lineWidth = w * 0.3; ctx.beginPath(); ctx.moveTo(x0 - 1, y0 - 1); ctx.lineTo(x1 - 1, y1 - 1); ctx.stroke();
    };
    seg(32, 50, 20, 26, 7);
    seg(20, 26, 42, 12, 6);
    rivet(ctx, 32, 50, 5, [90, 90, 85]); rivet(ctx, 20, 26, 4, [90, 90, 85]);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(42, 12); ctx.lineTo(50, 8); ctx.moveTo(42, 12); ctx.lineTo(48, 18); ctx.stroke();
  };
}
function gunIcon(kind: string): IconFn {
  return ctx => {
    ctx.save(); ctx.translate(32, 32); ctx.rotate(-0.5); ctx.translate(-32, -32);
    const metal: RGB = [70, 72, 74];
    const wood: RGB = [120, 75, 40];
    const fillShape = (pts: number[][], c: RGB) => { poly(ctx, pts); ctx.fillStyle = vgrad(ctx, Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[1])), [[0, sh(c, 1.35)], [1, sh(c, 0.55)]]); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1; ctx.stroke(); };
    if (kind === 'pistol') { fillShape([[14, 24], [52, 24], [52, 32], [30, 32], [28, 46], [18, 46], [18, 32], [14, 32]], metal); }
    else if (kind === 'submachine-gun') { fillShape([[6, 26], [58, 26], [58, 32], [40, 32], [38, 48], [32, 48], [30, 34], [18, 34], [12, 42], [6, 40]], metal); fillShape([[40, 32], [46, 32], [44, 44], [38, 44]], [40, 40, 40]); }
    else if (kind === 'shotgun' || kind === 'combat-shotgun') { fillShape([[4, 34], [22, 28], [60, 28], [60, 33], [22, 36], [10, 44]], kind === 'shotgun' ? wood : [60, 60, 60]); fillShape([[22, 24], [60, 24], [60, 28], [22, 28]], metal); }
    else if (kind === 'rocket-launcher') { fillShape([[4, 24], [60, 24], [60, 36], [4, 36]], [80, 95, 70]); fillShape([[26, 36], [32, 36], [30, 48], [24, 48]], metal); ctx.fillStyle = '#222'; ellipse(ctx, 60, 30, 2.5, 6); ctx.fill(); }
    else if (kind === 'flamethrower') { fillShape([[6, 28], [56, 28], [56, 34], [6, 34]], metal); cylinder(ctx, 24, 38, 7, 3, 12, [180, 60, 40]); fillShape([[40, 34], [46, 34], [44, 46], [38, 46]], metal); }
    ctx.restore();
  };
}
function magazine(c: RGB): IconFn {
  return ctx => {
    ctx.save(); ctx.translate(32, 32); ctx.rotate(0.25); ctx.translate(-32, -32);
    ctx.fillStyle = lgrad(ctx, 18, 14, 46, 56, [[0, sh(c, 1.35)], [1, sh(c, 0.5)]]);
    poly(ctx, [[20, 14], [42, 14], [46, 56], [24, 56]]); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = sh(c, 0.5); ctx.fillRect(22, 22, 20, 3); ctx.fillRect(23, 46, 21, 3);
    // bullets on top
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = vgrad(ctx, 4, 14, [[0, '#e8c070'], [1, '#9a6a20']]);
      rrect(ctx, 23 + i * 6, 4, 5, 12, 2.5); ctx.fill();
    }
    ctx.restore();
  };
}
function shell(c: RGB, tip: RGB, big = false): IconFn {
  return ctx => {
    ctx.save(); ctx.translate(32, 32); ctx.rotate(0.6);
    const w = big ? 14 : 10, h = big ? 44 : 34;
    ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, [[0, sh(c, 0.6)], [0.35, sh(c, 1.35)], [1, sh(c, 0.5)]]);
    ctx.fillRect(-w / 2, -h / 2 + w * 0.6, w, h - w * 0.6);
    ctx.fillStyle = hgrad(ctx, -w / 2, w / 2, [[0, sh(tip, 0.6)], [0.35, sh(tip, 1.35)], [1, sh(tip, 0.5)]]);
    ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2 + w * 0.6); ctx.quadraticCurveTo(-w / 2, -h / 2 - w * 0.3, 0, -h / 2 - w * 0.5); ctx.quadraticCurveTo(w / 2, -h / 2 - w * 0.3, w / 2, -h / 2 + w * 0.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(-w / 2, -h / 2 + w * 0.6, w, h - w * 0.6);
    ctx.fillStyle = '#c09040'; ctx.fillRect(-w / 2 - 1, h / 2 - 6, w + 2, 6);
    ctx.restore();
  };
}
function rocketIcon(body: RGB, tip: RGB, nuke = false): IconFn {
  return ctx => {
    ctx.save(); ctx.translate(32, 32); ctx.rotate(0.75);
    ctx.fillStyle = hgrad(ctx, -6, 6, [[0, sh(body, 0.55)], [0.35, sh(body, 1.3)], [1, sh(body, 0.5)]]);
    ctx.fillRect(-6, -18, 12, 36);
    ctx.fillStyle = hgrad(ctx, -6, 6, [[0, sh(tip, 0.55)], [0.35, sh(tip, 1.3)], [1, sh(tip, 0.5)]]);
    ctx.beginPath(); ctx.moveTo(-6, -18); ctx.quadraticCurveTo(-5, -28, 0, -30); ctx.quadraticCurveTo(5, -28, 6, -18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = sh(body, 0.6);
    poly(ctx, [[-6, 10], [-12, 22], [-6, 18]]); ctx.fill(); poly(ctx, [[6, 10], [12, 22], [6, 18]]); ctx.fill();
    if (nuke) { ctx.fillStyle = '#ffd400'; ctx.beginPath(); ctx.arc(0, -2, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#111'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(0, -2); ctx.arc(0, -2, 4.5, i * 2.094, i * 2.094 + 1.0); ctx.fill(); } }
    ctx.restore();
  };
}
function canister(c: RGB, label?: RGB): IconFn {
  return ctx => {
    ctx.fillStyle = lgrad(ctx, 14, 12, 50, 58, [[0, sh(c, 1.35)], [1, sh(c, 0.45)]]);
    rrect(ctx, 14, 14, 36, 44, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = sh(c, 0.5); rrect(ctx, 22, 6, 12, 10, 2); ctx.fill();
    ctx.fillStyle = sh(c, 0.7); ctx.fillRect(38, 8, 8, 8);
    if (label) { ctx.fillStyle = css(label); ctx.fillRect(14, 30, 36, 10); }
    ctx.strokeStyle = sh(c, 1.5, 0.5); ctx.beginPath(); ctx.moveTo(18, 20); ctx.lineTo(18, 52); ctx.stroke();
  };
}
function capsuleIcon(c: RGB, kind: string): IconFn {
  return ctx => {
    if (kind === 'grenade' || kind === 'cluster') {
      const draw = (x: number, y: number, r: number) => {
        ctx.fillStyle = rgrad(ctx, x - r * 0.3, y - r * 0.3, 0, r * 1.3, [[0, '#8a9a70'], [1, '#2e3a22']]);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x - r, y + i * r * 0.45); ctx.lineTo(x + r, y + i * r * 0.45); ctx.stroke(); }
        ctx.fillStyle = '#777'; ctx.fillRect(x - r * 0.3, y - r - r * 0.4, r * 0.6, r * 0.5);
      };
      if (kind === 'cluster') { draw(22, 40, 11); draw(42, 40, 11); draw(32, 24, 11); } else draw(32, 36, 17);
      return;
    }
    if (kind === 'robot') {
      ctx.fillStyle = rgrad(ctx, 26, 26, 0, 26, [[0, sh(c, 1.5)], [0.6, css(c)], [1, sh(c, 0.4)]]);
      ctx.beginPath(); ctx.arc(32, 34, 20, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
      ctx.fillStyle = '#ddd'; ctx.fillRect(14, 32, 36, 4);
      glow(ctx, 32, 34, 8, [255, 255, 255], 0.5);
      return;
    }
    cylinder(ctx, 32, 14, 13, 5, 36, c);
    ctx.fillStyle = '#666'; ctx.fillRect(26, 6, 12, 8);
  };
}
function armorIcon(c: RGB, tier: number): IconFn {
  return ctx => {
    ctx.fillStyle = lgrad(ctx, 12, 8, 52, 58, [[0, sh(c, 1.35)], [1, sh(c, 0.5)]]);
    poly(ctx, [[20, 8], [26, 12], [38, 12], [44, 8], [56, 16], [52, 30], [46, 28], [46, 58], [18, 58], [18, 28], [12, 30], [8, 16]]);
    ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.strokeStyle = sh(c, 0.5); ctx.beginPath(); ctx.moveTo(32, 14); ctx.lineTo(32, 56); ctx.stroke();
    if (tier >= 3) { ctx.fillStyle = tier >= 5 ? '#ffb000' : tier >= 4 ? '#60c0ff' : '#90d070'; ctx.fillRect(24, 20, 16, 6); }
    for (let i = 0; i < 3; i++) { ctx.fillStyle = sh(c, 0.6); ctx.fillRect(20, 34 + i * 7, 24, 2); }
  };
}
function equipIcon(c: RGB, sym: string): IconFn {
  return ctx => {
    ctx.fillStyle = lgrad(ctx, 6, 6, 58, 58, [[0, '#5a5a56'], [1, '#2a2a28']]);
    rrect(ctx, 6, 6, 52, 52, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.stroke();
    ctx.fillStyle = lgrad(ctx, 12, 12, 52, 52, [[0, sh(c, 1.3)], [1, sh(c, 0.6)]]);
    rrect(ctx, 12, 12, 40, 40, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(sym, 32, 33);
  };
}
function moduleIcon(c: RGB, tier: number): IconFn {
  return ctx => {
    ctx.fillStyle = sh(c, 0.3); rrect(ctx, 10, 10, 46, 46, 6); ctx.fill();
    ctx.fillStyle = lgrad(ctx, 8, 8, 54, 54, [[0, sh(c, 1.4)], [0.5, css(c)], [1, sh(c, 0.55)]]);
    rrect(ctx, 8, 8, 46, 46, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(20,20,20,0.75)'; rrect(ctx, 18, 18, 26, 26, 3); ctx.fill();
    glow(ctx, 31, 31, 12, shade(c, 1.6), 0.7);
    ctx.fillStyle = '#ddd';
    for (let i = 0; i < 5; i++) { ctx.fillRect(12 + i * 9, 4, 4, 5); ctx.fillRect(12 + i * 9, 54, 4, 5); }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < tier; i++) ctx.fillRect(22 + i * 7, 48, 5, 3);
  };
}
function paperIcon(c: RGB, mark: string): IconFn {
  return ctx => {
    ctx.fillStyle = lgrad(ctx, 10, 6, 54, 58, [[0, sh(c, 1.35)], [1, sh(c, 0.7)]]);
    poly(ctx, [[12, 6], [44, 6], [54, 16], [54, 58], [12, 58]]); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
    for (let x = 16; x < 54; x += 6) { ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, 56); ctx.stroke(); }
    for (let y = 12; y < 58; y += 6) { ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(52, y); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(mark, 33, 34);
  };
}
function robotIcon(c: RGB): IconFn {
  return ctx => {
    ctx.fillStyle = rgrad(ctx, 26, 24, 0, 26, [[0, sh(c, 1.4)], [1, sh(c, 0.5)]]);
    rrect(ctx, 16, 18, 32, 26, 8); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
    ctx.fillStyle = '#333'; ctx.fillRect(8, 26, 10, 6); ctx.fillRect(46, 26, 10, 6);
    ctx.fillStyle = '#ccc'; ellipse(ctx, 10, 24, 8, 2.5); ctx.fill(); ellipse(ctx, 54, 24, 8, 2.5); ctx.fill();
    ctx.fillStyle = '#222'; rrect(ctx, 22, 24, 20, 8, 3); ctx.fill();
    glow(ctx, 32, 28, 6, [255, 120, 60], 0.9);
    ctx.fillStyle = sh(c, 0.6); ctx.fillRect(22, 44, 20, 8);
  };
}
function wireIcon(c: RGB): IconFn {
  return ctx => {
    ctx.strokeStyle = sh(c, 0.4); ctx.lineWidth = 6;
    for (let i = 0; i < 4; i++) { ellipse(ctx, 32, 32 + (i - 1.5) * 4, 20, 9); ctx.stroke(); }
    ctx.strokeStyle = css(c); ctx.lineWidth = 3.5;
    for (let i = 0; i < 4; i++) { ellipse(ctx, 32, 32 + (i - 1.5) * 4, 20, 9); ctx.stroke(); }
  };
}
function cableIcon(ctx: Ctx) {
  ctx.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = sh(COPPER, 0.5); ctx.beginPath(); ctx.moveTo(8, 50 - i * 6); ctx.bezierCurveTo(24, 10 - i * 4, 40, 64 - i * 4, 58, 16 + i * 6); ctx.stroke();
  }
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = sh(COPPER, 1.25); ctx.beginPath(); ctx.moveTo(8, 50 - i * 6); ctx.bezierCurveTo(24, 10 - i * 4, 40, 64 - i * 4, 58, 16 + i * 6); ctx.stroke();
  }
}
function sticks(ctx: Ctx) {
  for (let i = 0; i < 2; i++) {
    ctx.save(); ctx.translate(32 + i * 6 - 3, 32); ctx.rotate(0.7 - i * 0.15);
    ctx.fillStyle = hgrad(ctx, -3, 3, [[0, '#5a5e60'], [0.4, '#c8ccd0'], [1, '#4a4e50']]);
    ctx.fillRect(-3, -26, 6, 52);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(-3, -26, 6, 52);
    ctx.restore();
  }
}
function woodIcon(ctx: Ctx) {
  const log = (x: number, y: number) => {
    ctx.fillStyle = vgrad(ctx, y - 8, y + 8, [[0, '#9a6a3c'], [1, '#4e3218']]);
    ctx.fillRect(x - 18, y - 8, 36, 16);
    ctx.fillStyle = rgrad(ctx, x + 18, y, 0, 9, [[0, '#d8b080'], [0.6, '#b08050'], [1, '#6a4422']]);
    ellipse(ctx, x + 18, y, 5, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(x - 18, y - 8, 36, 16);
  };
  log(28, 42); log(36, 26); log(24, 26);
}
function brickIcon(ctx: Ctx) {
  const b = (x: number, y: number) => {
    ctx.fillStyle = sh([150, 120, 90], 0.55); ctx.fillRect(x, y + 10, 26, 6);
    ctx.fillStyle = lgrad(ctx, x, y, x + 26, y + 12, [[0, '#c8a880'], [1, '#8a6e4e']]); ctx.fillRect(x, y, 26, 11);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 25, 15);
  };
  b(6, 38); b(32, 38); b(18, 22); b(6, 6 + 16); b(32, 22);
}
function fishIcon(ctx: Ctx) {
  ctx.fillStyle = lgrad(ctx, 8, 20, 56, 44, [[0, '#a8c0c8'], [1, '#4a6a78']]);
  ctx.beginPath(); ctx.ellipse(30, 32, 20, 10, 0, 0, Math.PI * 2); ctx.fill();
  poly(ctx, [[48, 32], [60, 22], [60, 42]]); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(18, 30, 2, 0, 6.3); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(30, 32, 20, 10, 0, 0, Math.PI * 2); ctx.stroke();
}

// ---------- icon table ----------
const I: Record<string, IconFn> = {
  'iron-ore': orePile([96, 128, 146], 11, 0.35),
  'copper-ore': orePile([186, 96, 58], 12, 0.3, [60, 170, 120]),
  'coal': orePile([38, 38, 40], 13, 0.6),
  'stone': orePile([170, 148, 110], 14, 0.25),
  'uranium-ore': orePile([60, 150, 40], 15, 0.6, [180, 255, 100]),
  'iron-plate': plates([150, 160, 170]),
  'copper-plate': plates([200, 112, 70]),
  'steel-plate': plates([120, 128, 135], 3),
  'stone-brick': brickIcon,
  'wood': woodIcon,
  'raw-fish': fishIcon,
  'iron-gear-wheel': ctx => gear(ctx, 32, 32, 26, 12, [150, 156, 162]),
  'copper-cable': cableIcon,
  'iron-stick': sticks,
  'electronic-circuit': pcb([46, 120, 40], [40, 40, 40], [200, 190, 100], 1),
  'advanced-circuit': pcb([150, 40, 32], [40, 40, 40], [230, 200, 120], 2),
  'processing-unit': pcb([40, 70, 150], [30, 30, 40], [140, 200, 240], 1),
  'automation-science-pack': flask([210, 40, 40], 0),
  'logistic-science-pack': flask([60, 190, 60], 1),
  'military-science-pack': flask([90, 90, 90], 2),
  'chemical-science-pack': flask([60, 190, 220], 3),
  'production-science-pack': flask([160, 70, 200], 4),
  'utility-science-pack': flask([230, 200, 50], 5),
  'space-science-pack': flask([235, 235, 240], 6),
  'barrel': barrelIcon(),
  'engine-unit': ctx => {
    ctx.fillStyle = lgrad(ctx, 8, 14, 56, 54, [[0, '#9a9a94'], [1, '#4a4a46']]); rrect(ctx, 10, 18, 44, 30, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
    for (let i = 0; i < 4; i++) { cylinder(ctx, 18 + i * 9.5, 10, 4, 2, 10, [130, 130, 125]); }
    ctx.fillStyle = '#333'; ctx.fillRect(14, 36, 36, 4);
    gear(ctx, 50, 44, 8, 8, [110, 110, 105]);
  },
  'electric-engine-unit': ctx => {
    cylinder(ctx, 32, 14, 18, 7, 34, [70, 110, 160]);
    ctx.fillStyle = '#c87830'; for (let i = 0; i < 4; i++) ctx.fillRect(14, 22 + i * 7, 36, 2.5);
    ctx.fillStyle = '#888'; ctx.fillRect(28, 4, 8, 10);
  },
  'flying-robot-frame': ctx => {
    ctx.strokeStyle = '#6a6a66'; ctx.lineWidth = 4; rrect(ctx, 14, 16, 36, 30, 6); ctx.stroke();
    ctx.strokeStyle = '#a0a09a'; ctx.lineWidth = 2; rrect(ctx, 14, 16, 36, 30, 6); ctx.stroke();
    ctx.fillStyle = '#444'; ctx.fillRect(4, 24, 12, 6); ctx.fillRect(48, 24, 12, 6);
    ctx.fillStyle = '#c8c8c0'; ellipse(ctx, 8, 22, 7, 2); ctx.fill(); ellipse(ctx, 56, 22, 7, 2); ctx.fill();
    cylinder(ctx, 32, 26, 6, 2.5, 10, [80, 120, 170]);
  },
  'low-density-structure': ctx => {
    ctx.fillStyle = lgrad(ctx, 8, 10, 56, 54, [[0, '#e0a070'], [1, '#8a4a28']]); rrect(ctx, 8, 12, 48, 40, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(60,30,10,0.8)'; ctx.lineWidth = 1.5;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) { const x = 13 + c * 9 + (r % 2) * 4.5, y = 18 + r * 9; poly(ctx, [[x, y - 4], [x + 4, y - 2], [x + 4, y + 2], [x, y + 4], [x - 4, y + 2], [x - 4, y - 2]]); ctx.stroke(); }
  },
  'rocket-fuel': canister([200, 50, 40], [240, 200, 60]),
  'nuclear-fuel': canister([60, 180, 50], [30, 30, 30]),
  'solid-fuel': ctx => {
    for (const [x, y] of [[18, 36], [34, 40], [26, 22], [42, 26]]) {
      ctx.fillStyle = '#2a2a28'; rrect(ctx, x - 10, y - 8 + 4, 22, 14, 2); ctx.fill();
      ctx.fillStyle = lgrad(ctx, x - 10, y - 8, x + 12, y + 6, [[0, '#6a6a60'], [1, '#383834']]); rrect(ctx, x - 10, y - 8, 22, 12, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    }
  },
  'plastic-bar': ctx => {
    for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(32, 22 + i * 10); ctx.fillStyle = '#9a9a98'; rrect(ctx, -22, 2, 44, 8, 3); ctx.fill(); ctx.fillStyle = lgrad(ctx, -22, -6, 22, 4, [[0, '#ffffff'], [1, '#b8b8b4']]); rrect(ctx, -22, -4, 44, 9, 3); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke(); ctx.restore(); }
  },
  'sulfur': orePile([220, 200, 40], 21, 0.5),
  'battery': ctx => {
    cylinder(ctx, 32, 14, 14, 5, 38, [90, 90, 92]);
    ctx.fillStyle = '#c87830'; ellipse(ctx, 32, 14, 9, 3); ctx.fill();
    ctx.fillStyle = '#e0c040'; ctx.fillRect(18, 30, 28, 8);
  },
  'explosives': ctx => {
    for (let i = 0; i < 3; i++) { cylinder(ctx, 22 + i * 10, 16 + (i % 2) * 4, 5, 2, 34, [200, 50, 40]); }
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(32, 18); ctx.quadraticCurveTo(40, 4, 50, 8); ctx.stroke();
    ctx.fillStyle = '#c8b070'; ctx.fillRect(16, 32, 32, 5);
  },
  'uranium-235': ctx => { glow(ctx, 32, 32, 28, [120, 255, 60], 0.6); ctx.fillStyle = rgrad(ctx, 28, 28, 0, 18, [[0, '#d8ff90'], [1, '#30a010']]); ctx.beginPath(); ctx.arc(32, 32, 16, 0, 6.3); ctx.fill(); ctx.fillStyle = '#103a08'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('235', 32, 37); },
  'uranium-238': ctx => { ctx.fillStyle = rgrad(ctx, 28, 28, 0, 18, [[0, '#6aa050'], [1, '#1a3a10']]); ctx.beginPath(); ctx.arc(32, 32, 16, 0, 6.3); ctx.fill(); ctx.fillStyle = '#c8e0b0'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('238', 32, 37); },
  'uranium-fuel-cell': ctx => { cylinder(ctx, 32, 8, 10, 4, 46, [150, 150, 145]); ctx.fillStyle = '#60e030'; ctx.fillRect(25, 18, 14, 30); glow(ctx, 32, 32, 14, [120, 255, 60], 0.5); },
  'depleted-uranium-fuel-cell': ctx => { cylinder(ctx, 32, 8, 10, 4, 46, [120, 120, 115]); ctx.fillStyle = '#2a4a20'; ctx.fillRect(25, 18, 14, 30); },
  'repair-pack': ctx => {
    ctx.fillStyle = lgrad(ctx, 8, 16, 56, 56, [[0, '#d84a3a'], [1, '#7a1e14']]); rrect(ctx, 8, 18, 48, 36, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
    ctx.fillStyle = '#777'; rrect(ctx, 24, 10, 16, 10, 3); ctx.fill();
    ctx.fillStyle = '#eee'; ctx.fillRect(28, 26, 8, 22); ctx.fillRect(21, 33, 22, 8);
  },
  'blueprint': paperIcon([60, 110, 190], ''),
  'blueprint-book': paperIcon([40, 80, 150], 'B'),
  'deconstruction-planner': paperIcon([190, 60, 50], 'X'),
  'upgrade-planner': paperIcon([60, 160, 70], '▲'),
  'red-wire': wireIcon([210, 40, 30]),
  'green-wire': wireIcon([40, 190, 50]),
  'pistol': gunIcon('pistol'), 'submachine-gun': gunIcon('submachine-gun'), 'shotgun': gunIcon('shotgun'), 'combat-shotgun': gunIcon('combat-shotgun'),
  'rocket-launcher': gunIcon('rocket-launcher'), 'flamethrower': gunIcon('flamethrower'),
  'firearm-magazine': magazine([200, 160, 50]), 'piercing-rounds-magazine': magazine([190, 50, 40]), 'uranium-rounds-magazine': magazine([60, 170, 40]),
  'shotgun-shell': shell([190, 50, 40], [200, 160, 60]), 'piercing-shotgun-shell': shell([60, 60, 60], [200, 160, 60]),
  'cannon-shell': shell([90, 100, 80], [70, 70, 70], true), 'explosive-cannon-shell': shell([90, 100, 80], [200, 60, 40], true),
  'uranium-cannon-shell': shell([90, 100, 80], [60, 180, 40], true), 'explosive-uranium-cannon-shell': shell([90, 100, 80], [220, 220, 50], true),
  'artillery-shell': shell([80, 90, 70], [200, 60, 40], true),
  'rocket': rocketIcon([140, 140, 135], [200, 60, 40]), 'explosive-rocket': rocketIcon([140, 140, 135], [230, 160, 40]), 'atomic-bomb': rocketIcon([90, 100, 80], [60, 60, 60], true),
  'flamethrower-ammo': canister([200, 60, 30], [40, 40, 40]),
  'grenade': capsuleIcon([0, 0, 0], 'grenade'), 'cluster-grenade': capsuleIcon([0, 0, 0], 'cluster'),
  'poison-capsule': capsuleIcon([60, 170, 50], 'cyl'), 'slowdown-capsule': capsuleIcon([60, 110, 200], 'cyl'),
  'defender-capsule': capsuleIcon([200, 160, 40], 'robot'), 'distractor-capsule': capsuleIcon([200, 80, 40], 'robot'), 'destroyer-capsule': capsuleIcon([150, 50, 160], 'robot'),
  'light-armor': armorIcon([140, 120, 90], 1), 'heavy-armor': armorIcon([110, 110, 110], 2), 'modular-armor': armorIcon([110, 120, 100], 3),
  'power-armor': armorIcon([70, 90, 110], 4), 'power-armor-mk2': armorIcon([60, 60, 70], 5),
  'solar-panel-equipment': equipIcon([40, 60, 120], '☀'), 'fission-reactor-equipment': equipIcon([60, 160, 50], '☢'),
  'battery-equipment': equipIcon([120, 120, 60], '▮'), 'battery-mk2-equipment': equipIcon([160, 140, 40], '▮▮'),
  'belt-immunity-equipment': equipIcon([160, 130, 40], '⇋'), 'exoskeleton-equipment': equipIcon([90, 90, 110], '⇧'),
  'personal-roboport-equipment': equipIcon([170, 120, 40], 'R'), 'personal-roboport-mk2-equipment': equipIcon([200, 140, 40], 'R2'),
  'night-vision-equipment': equipIcon([60, 140, 60], '◉'), 'energy-shield-equipment': equipIcon([60, 110, 180], '⛨'),
  'energy-shield-mk2-equipment': equipIcon([80, 140, 220], '⛨'), 'personal-laser-defense-equipment': equipIcon([180, 50, 50], '✶'),
  'discharge-defense-equipment': equipIcon([120, 80, 200], 'ϟ'),
  'speed-module': moduleIcon([50, 120, 210], 1), 'speed-module-2': moduleIcon([50, 120, 210], 2), 'speed-module-3': moduleIcon([50, 120, 210], 3),
  'efficiency-module': moduleIcon([60, 180, 60], 1), 'efficiency-module-2': moduleIcon([60, 180, 60], 2), 'efficiency-module-3': moduleIcon([60, 180, 60], 3),
  'productivity-module': moduleIcon([210, 80, 40], 1), 'productivity-module-2': moduleIcon([210, 80, 40], 2), 'productivity-module-3': moduleIcon([210, 80, 40], 3),
  'logistic-robot': robotIcon([200, 160, 60]), 'construction-robot': robotIcon([220, 140, 40]),
  'transport-belt': beltIcon(YELLOW), 'fast-transport-belt': beltIcon(RED), 'express-transport-belt': beltIcon(BLUE),
  'underground-belt': undergroundIcon(YELLOW), 'fast-underground-belt': undergroundIcon(RED), 'express-underground-belt': undergroundIcon(BLUE),
  'splitter': splitterIcon(YELLOW), 'fast-splitter': splitterIcon(RED), 'express-splitter': splitterIcon(BLUE),
  'burner-inserter': inserterIcon([90, 80, 70]), 'inserter': inserterIcon(YELLOW), 'long-handed-inserter': inserterIcon(RED),
  'fast-inserter': inserterIcon(BLUE), 'bulk-inserter': inserterIcon(GREEN),
  'landfill': orePile([120, 100, 70], 31, 0.2),
  'concrete': ctx => { ctx.fillStyle = '#5a5a56'; ctx.fillRect(10, 22, 44, 34); ctx.fillStyle = lgrad(ctx, 10, 10, 54, 44, [[0, '#a8a8a0'], [1, '#6a6a64']]); ctx.fillRect(10, 10, 44, 34); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeRect(10.5, 10.5, 43, 45); },
  'refined-concrete': ctx => { ctx.fillStyle = '#3a3a38'; ctx.fillRect(10, 22, 44, 34); ctx.fillStyle = lgrad(ctx, 10, 10, 54, 44, [[0, '#7a7a76'], [1, '#4a4a46']]); ctx.fillRect(10, 10, 44, 34); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeRect(10.5, 10.5, 43, 45); },
  'hazard-concrete': ctx => { ctx.fillStyle = '#5a5a56'; ctx.fillRect(10, 22, 44, 34); stripes(ctx, 10, 10, 44, 34, 7, '#d0a020', '#222'); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeRect(10.5, 10.5, 43, 45); },
  'refined-hazard-concrete': ctx => { ctx.fillStyle = '#3a3a38'; ctx.fillRect(10, 22, 44, 34); stripes(ctx, 10, 10, 44, 34, 7, '#b88c18', '#1a1a1a'); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeRect(10.5, 10.5, 43, 45); },
  'cliff-explosives': ctx => { barrelIcon([200, 50, 40])(ctx); ctx.fillStyle = '#ffdd00'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 32, 40); },
  'rocket-part': ctx => { cylinder(ctx, 32, 8, 14, 5, 48, [200, 200, 195]); ctx.fillStyle = '#333'; ctx.fillRect(18, 26, 28, 3); },
  'satellite': ctx => {
    ctx.fillStyle = '#2a3a70'; ctx.fillRect(4, 26, 18, 14); ctx.fillRect(42, 26, 18, 14);
    ctx.strokeStyle = '#8090c0'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.strokeRect(4 + i * 6, 26, 6, 14); ctx.strokeRect(42 + i * 6, 26, 6, 14); }
    cylinder(ctx, 32, 18, 10, 4, 26, [200, 180, 100]);
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(32, 18); ctx.lineTo(32, 6); ctx.stroke();
  },
  'spidertron-remote': ctx => { ctx.fillStyle = lgrad(ctx, 16, 8, 48, 56, [[0, '#6a6a6a'], [1, '#2a2a2a']]); rrect(ctx, 18, 8, 28, 48, 5); ctx.fill(); ctx.fillStyle = '#c03030'; ctx.beginPath(); ctx.arc(32, 22, 6, 0, 6.3); ctx.fill(); ctx.fillStyle = '#3a8ad0'; ctx.fillRect(24, 34, 16, 12); },
};
for (const f of ['water', 'crude-oil', 'heavy-oil', 'light-oil', 'petroleum-gas', 'lubricant', 'sulfuric-acid']) {
  I[f + '-barrel'] = barrelIcon(FLUID_RGB(f));
}
for (const f of Object.keys(FLUIDS)) I['fluid:' + f] = fluidIcon(f);

// Recipe icons (multi-product or special)
const R: Record<string, IconFn> = {
  'basic-oil-processing': ctx => { drop(ctx, 24, 34, 0.75, FLUID_RGB('crude-oil')); drop(ctx, 42, 30, 0.75, FLUID_RGB('petroleum-gas')); },
  'advanced-oil-processing': ctx => { drop(ctx, 18, 36, 0.62, FLUID_RGB('heavy-oil')); drop(ctx, 32, 28, 0.62, FLUID_RGB('light-oil')); drop(ctx, 46, 36, 0.62, FLUID_RGB('petroleum-gas')); },
  'coal-liquefaction': ctx => { I['coal'](ctx); drop(ctx, 44, 40, 0.55, FLUID_RGB('heavy-oil')); },
  'heavy-oil-cracking': ctx => { drop(ctx, 18, 40, 0.6, FLUID_RGB('heavy-oil')); arrow(ctx, 26, 30, 38, 22, '#eee', 3); drop(ctx, 46, 26, 0.6, FLUID_RGB('light-oil')); },
  'light-oil-cracking': ctx => { drop(ctx, 18, 40, 0.6, FLUID_RGB('light-oil')); arrow(ctx, 26, 30, 38, 22, '#eee', 3); drop(ctx, 46, 26, 0.6, FLUID_RGB('petroleum-gas')); },
  'solid-fuel-from-light-oil': ctx => { I['solid-fuel'](ctx); drop(ctx, 48, 46, 0.42, FLUID_RGB('light-oil')); },
  'solid-fuel-from-heavy-oil': ctx => { I['solid-fuel'](ctx); drop(ctx, 48, 46, 0.42, FLUID_RGB('heavy-oil')); },
  'solid-fuel-from-petroleum-gas': ctx => { I['solid-fuel'](ctx); drop(ctx, 48, 46, 0.42, FLUID_RGB('petroleum-gas')); },
  'uranium-processing': ctx => { ctx.save(); ctx.scale(0.6, 0.6); I['uranium-ore'](ctx); ctx.restore(); ctx.save(); ctx.translate(26, 26); ctx.scale(0.6, 0.6); I['uranium-235'](ctx); ctx.restore(); },
  'kovarex-enrichment-process': ctx => { I['uranium-235'](ctx); ctx.strokeStyle = '#eee'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(32, 32, 26, 0.3, 2.6); ctx.stroke(); ctx.beginPath(); ctx.arc(32, 32, 26, 3.4, 5.8); ctx.stroke(); },
  'nuclear-fuel-reprocessing': ctx => { ctx.save(); ctx.scale(0.7, 0.7); I['depleted-uranium-fuel-cell'](ctx); ctx.restore(); ctx.save(); ctx.translate(22, 22); ctx.scale(0.65, 0.65); I['uranium-238'](ctx); ctx.restore(); },
  'lubricant': fluidIcon('lubricant'), 'sulfuric-acid': fluidIcon('sulfuric-acid'),
};
for (const f of ['water', 'crude-oil', 'heavy-oil', 'light-oil', 'petroleum-gas', 'lubricant', 'sulfuric-acid']) {
  R[f + '-barrel'] = ctx => { barrelIcon(FLUID_RGB(f))(ctx); arrow(ctx, 50, 4, 50, 26, '#fff', 3); };
  R['empty-' + f + '-barrel'] = ctx => { barrelIcon(FLUID_RGB(f))(ctx); arrow(ctx, 50, 26, 50, 4, '#fff', 3); };
}

// Virtual signals
const SIGNALS: string[] = [];
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') SIGNALS.push('signal-' + ch);
const SIG_COLORS: Record<string, string> = { red: '#e03020', green: '#30c030', blue: '#3070e0', yellow: '#e0d020', pink: '#e050c0', cyan: '#30d0e0', white: '#f0f0f0', grey: '#808080', black: '#202020' };
for (const c of Object.keys(SIG_COLORS)) SIGNALS.push('signal-' + c);
SIGNALS.push('signal-each', 'signal-anything', 'signal-everything', 'signal-check', 'signal-dot', 'signal-info');
export const VIRTUAL_SIGNALS = SIGNALS;
function signalIcon(id: string): IconFn {
  return ctx => {
    const k = id.slice(7);
    ctx.fillStyle = '#4a4a48'; rrect(ctx, 4, 4, 56, 56, 6); ctx.fill();
    if (SIG_COLORS[k]) { ctx.fillStyle = SIG_COLORS[k]; ctx.beginPath(); ctx.arc(32, 32, 20, 0, 6.3); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke(); return; }
    ctx.fillStyle = '#f0f0f0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const map: Record<string, string> = { each: '∀', anything: '∃', everything: '*', check: '✔', dot: '•', info: 'i' };
    ctx.font = 'bold ' + (map[k] ? 34 : 38) + 'px sans-serif';
    ctx.fillText(map[k] || k, 32, 35);
  };
}

export function drawIconCanvas(key: string, entityIcon?: (id: string, ctx: Ctx) => boolean): HTMLCanvasElement {
  const [c, ctx] = mkc(ICON, ICON);
  if (key.startsWith('recipe:')) {
    const rid = key.slice(7);
    if (R[rid]) R[rid](ctx); else { const r = RECIPES[rid]; drawInto(ctx, r ? r.main : rid, entityIcon); }
  } else if (key.startsWith('signal-')) {
    signalIcon(key)(ctx);
  } else if (key.startsWith('tech:')) {
    // drawn elsewhere
  } else {
    drawInto(ctx, key, entityIcon);
  }
  return c;
}
function drawInto(ctx: Ctx, id: string, entityIcon?: (id: string, ctx: Ctx) => boolean) {
  if (I[id]) { I[id](ctx); return; }
  if (FLUIDS[id]) { fluidIcon(id)(ctx); return; }
  if (entityIcon && entityIcon(id, ctx)) return;
  // fallback
  ctx.fillStyle = '#666'; rrect(ctx, 8, 8, 48, 48, 6); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText((ITEMS[id]?.name || id).slice(0, 8), 32, 36);
}
export const HAS_CUSTOM_ICON = (id: string) => !!I[id];
export const RECIPE_ICON_IDS = Object.keys(R);
