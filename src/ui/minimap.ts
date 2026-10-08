// Minimap and full map view, using per-chunk cached map images.
import { Game } from '../game';
import { Chunk, chunkKey } from '../world/world';
import { CHUNK, RES_NAMES } from '../world/mapgen';
import { TILES } from '../world/tiles';
import { RESOURCES, ENTITIES } from '../data/protos';

const chunkCanvas = new WeakMap<Chunk, HTMLCanvasElement>();

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}
const RES_RGB: Record<number, [number, number, number]> = {};
for (let i = 1; i < RES_NAMES.length; i++) RES_RGB[i] = hexToRgb(RESOURCES[RES_NAMES[i]].mapColor);

export function chunkImage(g: Game, c: Chunk): HTMLCanvasElement {
  let cv = chunkCanvas.get(c);
  if (cv && !c.mapDirty) return cv;
  if (!cv) { cv = document.createElement('canvas'); cv.width = CHUNK; cv.height = CHUNK; chunkCanvas.set(c, cv); }
  c.mapDirty = false;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(CHUNK, CHUNK);
  const d = img.data;
  for (let i = 0; i < CHUNK * CHUNK; i++) {
    const t = TILES[c.tiles[i]];
    let col: [number, number, number] = t ? [t.map[0] * 255 * 0.85, t.map[1] * 255 * 0.85, t.map[2] * 255 * 0.85] : [0, 0, 0];
    const rt = c.resType[i];
    if (rt) col = RES_RGB[rt];
    d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
  }
  // entities
  for (const e of c.ents) {
    if ((e as any).isRail) continue; // painted along the track by the rail system
    let mc: string | undefined;
    if (e.type === 'tree') { mc = '1f3618'; }
    else if (e.type === 'simple-entity') mc = '6a6a5a';
    else if (e.isBuilding && e.proto.mapColor) mc = e.proto.mapColor;
    else if ((e as any).enemyBase) mc = 'c80000';
    if (!mc) continue;
    const rgb = hexToRgb(mc);
    const x0 = Math.floor(e.x - e.w / 2) - c.cx * CHUNK, y0 = Math.floor(e.y - e.h / 2) - c.cy * CHUNK;
    const w = Math.max(1, Math.round(e.w)), hh = Math.max(1, Math.round(e.h));
    for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= CHUNK || y >= CHUNK) continue;
      const i = (y * CHUNK + x) * 4;
      if (e.type === 'tree') { d[i] = d[i] * 0.55 + rgb[0] * 0.45; d[i + 1] = d[i + 1] * 0.55 + rgb[1] * 0.45; d[i + 2] = d[i + 2] * 0.55 + rgb[2] * 0.45; }
      else { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; }
    }
  }
  g.rails?.paintMap?.(c, d);
  ctx.putImageData(img, 0, 0);
  return cv;
}

export function drawMap(g: Game, ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, W: number, H: number, opts: { pollution?: boolean; markers?: boolean } = {}) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  const x0 = cx - W / 2 / scale, y0 = cy - H / 2 / scale;
  const c0x = Math.floor(x0 / CHUNK), c1x = Math.floor((cx + W / 2 / scale) / CHUNK);
  const c0y = Math.floor(y0 / CHUNK), c1y = Math.floor((cy + H / 2 / scale) / CHUNK);
  const w = g.world;
  for (let ccy = c0y; ccy <= c1y; ccy++) for (let ccx = c0x; ccx <= c1x; ccx++) {
    const c = w.chunks.get(chunkKey(ccx, ccy));
    if (!c || !c.charted) continue;
    const img = chunkImage(g, c);
    const sx = (ccx * CHUNK - x0) * scale, sy = (ccy * CHUNK - y0) * scale;
    ctx.drawImage(img, sx, sy, CHUNK * scale + 0.5, CHUNK * scale + 0.5);
    if (opts.pollution && c.pollution > 0.5) {
      ctx.fillStyle = `rgba(200,20,10,${Math.min(0.55, c.pollution / 400)})`;
      ctx.fillRect(sx, sy, CHUNK * scale, CHUNK * scale);
    }
  }
  // enemies & units
  if (g.enemies) {
    ctx.fillStyle = '#ff2a1a';
    for (const u of w.units) {
      if (!(u as any).isEnemyUnit) continue;
      const sx = (u.x - x0) * scale, sy = (u.y - y0) * scale;
      if (sx < -2 || sy < -2 || sx > W + 2 || sy > H + 2) continue;
      ctx.fillRect(sx - 1, sy - 1, Math.max(2, scale * 0.6), Math.max(2, scale * 0.6));
    }
  }
  // trains / vehicles
  for (const u of w.units) {
    if (!(u as any).isVehicle) continue;
    const sx = (u.x - x0) * scale, sy = (u.y - y0) * scale;
    ctx.fillStyle = '#ffd040'; ctx.fillRect(sx - 2, sy - 2, 4, 4);
  }
  // player
  const p = g.player;
  const px = (p.x - x0) * scale, py = (p.y - y0) * scale;
  ctx.save(); ctx.translate(px, py);
  ctx.rotate(p.character.face * Math.PI / 4);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

export class Minimap {
  g: Game; c: HTMLCanvasElement; ctx: CanvasRenderingContext2D;
  constructor(g: Game, c: HTMLCanvasElement) {
    this.g = g; this.c = c;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = 220 * dpr; c.height = 220 * dpr;
    this.ctx = c.getContext('2d')!;
  }
  draw() {
    const g = this.g;
    const dpr = this.c.width / 220;
    drawMap(g, this.ctx, g.player.x, g.player.y, 2 * dpr, this.c.width, this.c.height, { pollution: false });
    // view rect
    const r = g.ui.r;
    const s = 2 * dpr;
    this.ctx.strokeStyle = 'rgba(255,255,255,0.5)'; this.ctx.lineWidth = 1;
    this.ctx.strokeRect(this.c.width / 2 + (r.left - g.player.x) * s, this.c.height / 2 + (r.top - g.player.y) * s, r.viewW * s, r.viewH * s);
  }
}

