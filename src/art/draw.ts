// Canvas drawing helpers for procedural art in a gritty top-down industrial style.
import { RNG } from '../engine/noise';

export type Ctx = CanvasRenderingContext2D;
export type RGB = [number, number, number];

export function hex(h: string): RGB {
  h = h.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function css(c: RGB, a = 1): string {
  return a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
export function shade(c: RGB, f: number): RGB {
  if (f >= 1) { const k = f - 1; return [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k]; }
  return [c[0] * f, c[1] * f, c[2] * f];
}
export function mix(a: RGB, b: RGB, t: number): RGB { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function sh(c: RGB, f: number, a = 1) { return css(shade(c, f), a); }

export function mkc(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d')!;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  return [c, ctx];
}

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function vgrad(ctx: Ctx, y0: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
export function hgrad(ctx: Ctx, x0: number, x1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
export function lgrad(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
export function rgrad(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][], fx?: number, fy?: number) {
  const g = ctx.createRadialGradient(fx ?? x, fy ?? y, r0, x, y, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

// A 3/4-view box: top face (w x d) with front face of height h below it.
export function box(ctx: Ctx, x: number, y: number, w: number, d: number, h: number, base: RGB, opts: { r?: number; outline?: boolean; topF?: number; frontF?: number; noTop?: boolean } = {}) {
  const r = opts.r ?? 3;
  // front face
  ctx.fillStyle = vgrad(ctx, y + d - r, y + d + h, [[0, sh(base, 0.62)], [1, sh(base, 0.38)]]);
  rrect(ctx, x, y + d - r, w, h + r, r); ctx.fill();
  if (!opts.noTop) {
    ctx.fillStyle = lgrad(ctx, x, y, x + w * 0.6, y + d, [[0, sh(base, opts.topF ?? 1.12)], [1, sh(base, 0.92)]]);
    rrect(ctx, x, y, w, d, r); ctx.fill();
    // top highlight edge
    ctx.strokeStyle = sh(base, 1.35, 0.55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + r, y + 0.5); ctx.lineTo(x + w - r, y + 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 0.5, y + r); ctx.lineTo(x + 0.5, y + d - r); ctx.stroke();
  }
  if (opts.outline !== false) {
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1;
    rrect(ctx, x + 0.5, y + 0.5, w - 1, d + h - 1, r); ctx.stroke();
  }
}

export function rivet(ctx: Ctx, x: number, y: number, r: number, base: RGB) {
  ctx.fillStyle = rgrad(ctx, x - r * 0.3, y - r * 0.3, 0, r * 1.2, [[0, sh(base, 1.5)], [0.6, sh(base, 0.9)], [1, sh(base, 0.4)]]);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

export function gear(ctx: Ctx, cx: number, cy: number, r: number, teeth: number, base: RGB, hole = 0.35) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  const ri = r * 0.78;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = a0 + Math.PI / teeth * 0.45;
    const a2 = a0 + Math.PI / teeth * 1.0;
    const a3 = a0 + Math.PI / teeth * 1.55;
    const p = (a: number, rr: number) => [Math.cos(a) * rr, Math.sin(a) * rr];
    const pts = [p(a0, ri), p(a1, r), p(a2, r), p(a3, ri)];
    if (i === 0) ctx.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts) ctx.lineTo(q[0], q[1]);
  }
  ctx.closePath();
  ctx.arc(0, 0, r * hole, 0, Math.PI * 2, true);
  ctx.fillStyle = rgrad(ctx, -r * 0.3, -r * 0.3, 0, r * 1.4, [[0, sh(base, 1.35)], [0.5, sh(base, 1.0)], [1, sh(base, 0.55)]]);
  ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.stroke();
  ctx.restore();
}

export function grain(ctx: Ctx, w: number, h: number, amount = 0.08, seed = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const r = new RNG(seed);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = 1 + (r.next() - 0.5) * 2 * amount;
    d[i] = Math.min(255, d[i] * n); d[i + 1] = Math.min(255, d[i + 1] * n); d[i + 2] = Math.min(255, d[i + 2] * n);
  }
  ctx.putImageData(img, 0, 0);
}

// Generate a soft shadow canvas from a sprite silhouette. Shadow is offset toward +x (east) like Factorio.
export function makeShadow(src: HTMLCanvasElement, dx: number, dy: number, skew = 0.0, alpha = 1, extra = 0): HTMLCanvasElement {
  const pad = Math.ceil(Math.abs(dx) + 8 + extra);
  const [c, ctx] = mkc(src.width + pad * 2, src.height + pad * 2);
  const [s2, sctx] = mkc(src.width, src.height);
  sctx.drawImage(src, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = '#000'; sctx.fillRect(0, 0, src.width, src.height);
  const offs = [[0, 0, 0.5], [1.5, 0, 0.13], [-1.5, 0, 0.13], [0, 1.5, 0.13], [0, -1.5, 0.13], [3, 1, 0.06], [-3, -1, 0.06]];
  for (const [ox, oy, a] of offs) {
    ctx.globalAlpha = a * alpha * 1.4;
    ctx.setTransform(1, 0, skew, 1, pad + dx + ox - skew * src.height, pad + dy + oy);
    ctx.drawImage(s2, 0, 0);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  (c as any)._pad = pad;
  return c;
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

export function cylinder(ctx: Ctx, cx: number, top: number, rx: number, ry: number, h: number, base: RGB) {
  // body
  ctx.fillStyle = hgrad(ctx, cx - rx, cx + rx, [[0, sh(base, 0.55)], [0.3, sh(base, 1.15)], [0.55, sh(base, 0.95)], [1, sh(base, 0.4)]]);
  ctx.beginPath();
  ctx.moveTo(cx - rx, top);
  ctx.lineTo(cx - rx, top + h);
  ctx.ellipse(cx, top + h, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(cx + rx, top);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  // top cap
  ctx.fillStyle = rgrad(ctx, cx - rx * 0.3, top - ry * 0.3, 0, rx * 1.2, [[0, sh(base, 1.3)], [1, sh(base, 0.8)]]);
  ellipse(ctx, cx, top, rx, ry); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
}

export function pipeSeg(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, base: RGB) {
  const horiz = Math.abs(x1 - x0) > Math.abs(y1 - y0);
  if (horiz) {
    const y = y0;
    ctx.fillStyle = vgrad(ctx, y - w / 2, y + w / 2, [[0, sh(base, 1.25)], [0.35, sh(base, 1.05)], [0.7, sh(base, 0.7)], [1, sh(base, 0.4)]]);
    ctx.fillRect(Math.min(x0, x1), y - w / 2, Math.abs(x1 - x0), w);
  } else {
    const x = x0;
    ctx.fillStyle = hgrad(ctx, x - w / 2, x + w / 2, [[0, sh(base, 0.75)], [0.3, sh(base, 1.2)], [0.65, sh(base, 0.9)], [1, sh(base, 0.45)]]);
    ctx.fillRect(x - w / 2, Math.min(y0, y1), w, Math.abs(y1 - y0));
  }
}

export function glow(ctx: Ctx, x: number, y: number, r: number, color: RGB, a = 1) {
  ctx.fillStyle = rgrad(ctx, x, y, 0, r, [[0, css(color, a)], [0.4, css(color, a * 0.45)], [1, css(color, 0)]]);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

export function poly(ctx: Ctx, pts: number[][]) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

export function vents(ctx: Ctx, x: number, y: number, w: number, h: number, n: number, base: RGB) {
  const gap = h / n;
  for (let i = 0; i < n; i++) {
    const yy = y + i * gap + gap * 0.2;
    ctx.fillStyle = sh(base, 0.3);
    ctx.fillRect(x, yy, w, gap * 0.45);
    ctx.fillStyle = sh(base, 1.25, 0.6);
    ctx.fillRect(x, yy + gap * 0.45, w, Math.max(1, gap * 0.12));
  }
}

export function stripes(ctx: Ctx, x: number, y: number, w: number, h: number, sw: number, c1: string, c2: string) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = c1; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = c2;
  for (let i = -h; i < w + h; i += sw * 2) {
    ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + sw, y + h); ctx.lineTo(x + i + sw + h, y); ctx.lineTo(x + i + h, y); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

export const METAL: RGB = [128, 128, 122];
export const DARK: RGB = [70, 70, 68];
export const STEEL: RGB = [105, 110, 112];
export const RUST: RGB = [120, 85, 60];
export const YELLOW: RGB = [218, 166, 40];
export const RED: RGB = [196, 60, 44];
export const BLUE: RGB = [60, 130, 196];
export const GREEN: RGB = [80, 160, 60];
export const COPPER: RGB = [196, 110, 64];

// Shadow with a horizontal shear about groundY: points higher above the ground shift further right.
export function makeShadowAt(src: HTMLCanvasElement, dx: number, dy: number, k: number, groundY: number, alpha = 1): HTMLCanvasElement {
  const pad = Math.ceil(Math.abs(dx) + Math.abs(k) * groundY + 10);
  const [c, ctx] = mkc(src.width + pad * 2, src.height + pad * 2);
  const [s2, sctx] = mkc(src.width, src.height);
  sctx.drawImage(src, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = '#000'; sctx.fillRect(0, 0, src.width, src.height);
  const offs = [[0, 0, 0.42], [1.5, 0, 0.14], [-1.5, 0, 0.14], [0, 1.5, 0.14], [0, -1.5, 0.14], [3, 1.5, 0.07], [-2, -2, 0.07]];
  for (const [ox, oy, a] of offs) {
    ctx.globalAlpha = Math.min(1, a * alpha * 1.6);
    ctx.setTransform(1, 0, -k, 1, pad + dx + ox + k * groundY, pad + dy + oy);
    ctx.drawImage(s2, 0, 0);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  return c;
}
