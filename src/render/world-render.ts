// Draws the world each frame.
import { Renderer, rgba, additive, WHITE } from '../engine/renderer';
import { Game } from '../game';
import { TILES, isWaterTile, isPlayerTile } from '../world/tiles';
import { CHUNK, RES_NAMES } from '../world/mapgen';
import { chunkKey } from '../world/world';
import { hash2, hashInt } from '../engine/noise';
import { Entity, createEntity } from '../sim/entity';
import { ElectricPole } from '../sim/power';
import { ENTITIES, ITEMS } from '../data/protos';
import { DECOR_COUNT } from '../art/sprites-world';
import { G, Dir, DIRS } from '../core';

export interface Preview {
  protoId?: string; tileItem?: string; x: number; y: number; dir: Dir; valid: boolean; reason?: string; ghost?: boolean; size?: number; flags?: number;
  extra?: { protoId: string; x: number; y: number; dir: Dir; valid: boolean }[];
}
export interface ViewState {
  hover: Entity | null; hoverTile: [number, number] | null; preview: Preview | null; alt: boolean;
  selRect?: [number, number, number, number, string] | null;
  showSupply?: boolean;
}

const LANE_COLORS = { copper: [0.55, 0.32, 0.16], red: [0.85, 0.15, 0.1], green: [0.15, 0.75, 0.2] } as const;

export class WorldRenderer {
  r: Renderer; g: Game;
  winX = 1e9; winY = 1e9; winVer = -1;
  previewCache = new Map<string, Entity>();
  constructor(r: Renderer, g: Game) {
    this.r = r; this.g = g;
    for (const t of TILES) if (t) r.setPalette(t.id, t.a, t.b, t.style);
  }

  updateTileWindow() {
    const r = this.r, w = this.g.world;
    const W = r.tileW, H = r.tileH;
    const ox = Math.floor(r.camX) - (W >> 1), oy = Math.floor(r.camY) - (H >> 1);
    if (Math.abs(ox - this.winX) < 40 && Math.abs(oy - this.winY) < 40 && this.winVer === w.tileVersion) return;
    // align to chunk
    const ax = Math.floor(ox / CHUNK) * CHUNK, ay = Math.floor(oy / CHUNK) * CHUNK;
    this.winX = ax; this.winY = ay; this.winVer = w.tileVersion;
    const data = r.tileData;
    data.fill(0);
    for (let cy = ay / CHUNK; cy < (ay + H) / CHUNK; cy++) for (let cx = ax / CHUNK; cx < (ax + W) / CHUNK; cx++) {
      const c = w.chunks.get(chunkKey(cx, cy));
      if (!c) continue;
      const bx = cx * CHUNK - ax, by = cy * CHUNK - ay;
      for (let y = 0; y < CHUNK; y++) {
        const row = (by + y) * W + bx;
        if (by + y < 0 || by + y >= H) continue;
        for (let x = 0; x < CHUNK; x++) data[row + x] = c.tiles[(y << 5) | x];
      }
    }
    r.tileOX = ax; r.tileOY = ay;
    r.tilesDirty = true;
  }

  render(view: ViewState) {
    const r = this.r, g = this.g, w = g.world, a = r.atlas;
    r.time = g.renderTime;
    this.updateTileWindow();
    r.begin();
    const x0 = r.left - 1, y0 = r.top - 1, x1 = r.left + r.viewW + 1, y1 = r.top + r.viewH + 1;
    const tilePx = r.zoom / r.dpr;
    // ---- resources & decoratives ----
    const cx0 = Math.floor(x0 / CHUNK), cx1 = Math.floor(x1 / CHUNK), cy0 = Math.floor(y0 / CHUNK), cy1 = Math.floor(y1 / CHUNK);
    const showDecor = tilePx >= 20;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = w.chunks.get(chunkKey(cx, cy));
      if (!c) continue;
      const bx = cx * CHUNK, by = cy * CHUNK;
      const lx0 = Math.max(0, Math.floor(x0 - bx)), lx1 = Math.min(CHUNK - 1, Math.ceil(x1 - bx));
      const ly0 = Math.max(0, Math.floor(y0 - by)), ly1 = Math.min(CHUNK - 1, Math.ceil(y1 - by));
      for (let ly = ly0; ly <= ly1; ly++) for (let lx = lx0; lx <= lx1; lx++) {
        const i = (ly << 5) | lx;
        const rt = c.resType[i];
        const tx = bx + lx, ty = by + ly;
        if (rt) {
          const amt = c.resAmount[i];
          if (rt === 6) {
            r.draw('ground', a.get('crude-oil-' + (hashInt(tx, ty, 1) % 3)), tx + 0.5, ty + 0.5, WHITE, 0, 1.2);
          } else {
            const lvl = amt < 150 ? 0 : amt < 600 ? 1 : amt < 2500 ? 2 : 3;
            const v = hashInt(tx, ty, 2) % 6;
            r.draw('ground', a.get(`ore-${RES_NAMES[rt]}-${v}-${lvl}`), tx + 0.5, ty + 0.5, WHITE, 0, 1.0);
          }
        } else if (showDecor) {
          const t = c.tiles[i];
          if (t >= 20 || !t) continue;
          const h = hash2(tx, ty, 91);
          if (h > 0.16) continue;
          if (c.occ[i]) continue;
          let d: number;
          const k = hashInt(tx, ty, 92);
          if (t <= 4) d = k % 8;                 // grass tufts & flowers
          else if (t <= 12) d = 8 + (k % 6);     // pebbles + bushes
          else d = 8 + (k % 3);                  // sand: pebbles
          if (d >= DECOR_COUNT) d = DECOR_COUNT - 1;
          r.draw('ground', a.get('decor-' + d), tx + 0.5 + (hash2(tx, ty, 93) - 0.5) * 0.6, ty + 0.5 + (hash2(tx, ty, 94) - 0.5) * 0.6, WHITE, 0, 0.55 + h * 2);
        }
      }
    }
    // ---- entities ----
    const alt = view.alt;
    const ents = w.entitiesIn(x0 - 2, y0 - 2, x1 + 2, y1 + 4, undefined, 10);
    const blink = (Math.floor(g.renderTime * 2) & 1) === 0;
    for (const e of ents) {
      e.draw(r, alt);
      if (e.warnIcon && blink && e.isBuilding) r.draw('overlay', a.get(e.warnIcon), e.x, e.y, WHITE, 0, 0.6);
      if (e.decon) { r.drawRect('overlay', a.get('white'), e.x, e.y, Math.max(0.6, e.w), Math.max(0.6, e.h), rgba(1, 0.15, 0.1, 0.18)); r.draw('overlay', a.get('decon-mark'), e.x, e.y, WHITE, 0, Math.min(0.9, Math.max(e.w, e.h) * 0.5)); }
      if ((e as any).upgradeTo) r.draw('overlay', a.get('upgrade-mark'), e.x, e.y, WHITE, 0, Math.min(0.9, Math.max(e.w, e.h) * 0.5));
      if (e.health < e.maxHealth && e.isBuilding && (g.tick - e.lastHit < 600 || view.hover === e)) this.healthBar(e);
    }
    for (const u of w.units) {
      if (u.x < x0 - 3 || u.x > x1 + 3 || u.y < y0 - 3 || u.y > y1 + 5) continue;
      u.draw(r, alt);
    }
    g.rails?.draw(r, x0, y0, x1, y1);
    // wires
    this.drawWires(ents);
    g.circuits?.draw(r, x0, y0, x1, y1);
    g.combat?.draw(r);
    g.fx?.draw(r);
    // player light (flashlight)
    const ch = g.player.character;
    if (!ch.dead && g.darkness > 0.05) {
      const f = DIRS8[ch.face];
      r.draw('light', a.get('light'), ch.x + f[0] * 4.5, ch.y + f[1] * 4.5, additive(1, 0.95, 0.85, 0.9), 0, 11);
      r.draw('light', a.get('light'), ch.x, ch.y, additive(1, 0.95, 0.85, 0.7), 0, 5);
    }
    // ---- overlays ----
    if (view.showSupply) this.drawSupplyAreas(x0, y0, x1, y1);
    { const ci = g.player.cursorItem(); if (ci && (ci === 'roboport' || ENTITIES[ITEMS[ci]?.place || '']?.logistic || ci.endsWith('-robot'))) g.logistics?.drawAreas(r, x0, y0, x1, y1); }
    if (view.hover && view.hover.selectable) this.selectionBox(view.hover);
    if (view.preview) this.drawPreview(view.preview);
    if (view.selRect) {
      const [sx0, sy0, sx1, sy1, mode] = view.selRect;
      const col = mode === 'decon' ? rgba(1, 0.25, 0.2, 0.18) : mode === 'cancel' ? rgba(0.3, 0.6, 1, 0.18) : rgba(0.4, 0.7, 1, 0.18);
      r.drawRect('top', a.get('white'), (sx0 + sx1) / 2, (sy0 + sy1) / 2, sx1 - sx0, sy1 - sy0, col);
      for (const [x, y, rot] of [[sx0, sy0, 0], [sx1, sy0, Math.PI / 2], [sx1, sy1, Math.PI], [sx0, sy1, -Math.PI / 2]] as [number, number, number][]) {
        r.draw('top', a.get('select-corner'), x + Math.cos(rot - Math.PI / 4) * 0.25 * Math.SQRT2, y + Math.sin(rot - Math.PI / 4) * 0.25 * Math.SQRT2, mode === 'decon' ? rgba(1, 0.4, 0.3, 1) : rgba(0.5, 0.8, 1, 1), rot, 0.5);
      }
    }
    // lighting
    let dark = g.darkness;
    if (g.player.equipmentStats().night) dark *= 0.35;
    r.darkness = dark;
    r.ambient = [1 - dark * 0.88, 1 - dark * 0.84, 1 - dark * 0.7];
    r.end();
  }

  healthBar(e: Entity) {
    const r = this.r, a = r.atlas;
    const f = Math.max(0, e.health / e.maxHealth);
    const w = Math.max(0.8, e.w * 0.8);
    const y = e.y - e.h / 2 - 0.2;
    r.drawRect('overlay', a.get('white'), e.x, y, w + 0.06, 0.16, rgba(0, 0, 0, 0.75));
    r.drawRect('overlay', a.get('white'), e.x - w / 2 + w * f / 2, y, w * f, 0.1, rgba(f < 0.35 ? 0.95 : f < 0.7 ? 0.95 : 0.25, f < 0.35 ? 0.2 : f < 0.7 ? 0.75 : 0.85, 0.2, 1));
  }

  selectionBox(e: Entity) {
    const r = this.r, a = r.atlas;
    const hw = Math.max(e.w, 0.4) / 2 + 0.05, hh = Math.max(e.h, 0.4) / 2 + 0.05;
    const s = Math.min(0.5, Math.max(0.3, Math.min(hw, hh) * 0.6));
    const off = s / 2 - 0.02;
    const col = rgba(1, 0.92, 0.45, 1);
    r.draw('top', a.get('select-corner'), e.x - hw + off, e.y - hh + off, col, 0, s);
    r.draw('top', a.get('select-corner'), e.x + hw - off, e.y - hh + off, col, Math.PI / 2, s);
    r.draw('top', a.get('select-corner'), e.x + hw - off, e.y + hh - off, col, Math.PI, s);
    r.draw('top', a.get('select-corner'), e.x - hw + off, e.y + hh - off, col, -Math.PI / 2, s);
  }

  drawWires(ents: Entity[]) {
    const r = this.r, a = r.atlas;
    const wire = a.get('wire');
    const seen = new Set<string>();
    const drawCat = (ax: number, ay: number, bx: number, by: number, col: readonly number[], shadow = true) => {
      const n = 10;
      const dist = Math.hypot(bx - ax, by - ay);
      const sag = Math.min(1.2, dist * 0.06);
      let px = ax, py = ay;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const x = ax + (bx - ax) * t, y = ay + (by - ay) * t + Math.sin(t * Math.PI) * sag;
        r.line('wires', wire, px, py, x, y, 0.07, rgba(col[0], col[1], col[2], 1));
        px = x; py = y;
      }
      if (shadow) {
        // ground shadow from pole bases (offset like Factorio shadows)
      }
    };
    for (const e of ents) {
      if (e instanceof ElectricPole) {
        for (const o of e.wiresTo) {
          const k = e.id < o.id ? e.id + ':' + o.id : o.id + ':' + e.id;
          if (seen.has(k)) continue;
          seen.add(k);
          const [ax, ay] = e.wirePoint('copper'), [bx, by] = o.wirePoint('copper');
          drawCat(ax, ay, bx, by, LANE_COLORS.copper);
        }
      }
    }
  }

  drawSupplyAreas(x0: number, y0: number, x1: number, y1: number) {
    const r = this.r, a = r.atlas;
    const poles = this.g.world.entitiesIn(x0 - 10, y0 - 10, x1 + 10, y1 + 10, e => e instanceof ElectricPole, 20) as ElectricPole[];
    for (const p of poles) {
      const s = p.supply;
      r.drawRect('overlay', a.get('white'), p.x, p.y, s * 2, s * 2, rgba(0.25, 0.6, 1, 0.12));
    }
  }

  getPreviewEntity(protoId: string, dir: Dir, flags = 0): Entity {
    const k = protoId + ':' + dir + ':' + flags;
    let e = this.previewCache.get(k);
    if (!e) { e = createEntity(protoId, 0, 0, dir); e.flags = flags; this.previewCache.set(k, e); }
    return e;
  }
  drawPreview(p: Preview) {
    const r = this.r, a = r.atlas;
    const items = [p, ...(p.extra || [])];
    for (const it of items) {
      if (!it.protoId) continue;
      const e = this.getPreviewEntity(it.protoId, it.dir, (p as any).flags || 0);
      e.x = it.x; e.y = it.y;
      if ((e as any).updatePositions) (e as any).updatePositions();
      r.redirect = 'top';
      r.tint = !it.valid ? rgba(1, 0.35, 0.3, 0.62) : (p as any).ghost ? rgba(0.55, 0.75, 1, 0.55) : rgba(0.55, 1, 0.55, 0.62);
      try { e.draw(r, true); } catch { /* preview drawing best-effort */ }
      r.redirect = null;
      // footprint
      r.drawRect('top', a.get('white'), it.x, it.y, e.w, e.h, it.valid ? rgba(0.4, 1, 0.4, 0.12) : rgba(1, 0.3, 0.3, 0.18));
      const pr = ENTITIES[it.protoId];
      if (pr?.rotatable) r.draw('top', a.get('arrow'), it.x, it.y, rgba(1, 1, 1, 0.7), it.dir * Math.PI / 2, Math.min(0.8, Math.min(e.w, e.h) * 0.6));
      if (pr?.type === 'mining-drill' && pr.miningArea && !pr.cats?.includes('basic-fluid')) r.drawRect('top', a.get('white'), it.x, it.y, pr.miningArea, pr.miningArea, rgba(0.3, 0.6, 1, 0.12));
      if (pr?.type === 'electric-pole') r.drawRect('top', a.get('white'), it.x, it.y, pr.supply! * 2, pr.supply! * 2, rgba(0.3, 0.6, 1, 0.16));
      if (pr?.type === 'beacon') r.drawRect('top', a.get('white'), it.x, it.y, 3 + pr.supply! * 2, 3 + pr.supply! * 2, rgba(0.6, 0.3, 1, 0.1));
      if (pr?.range && (pr.type.includes('turret'))) r.draw('top', a.get('ring'), it.x, it.y, rgba(1, 0.4, 0.3, 0.6), 0, pr.range * 2);
    }
    if (p.tileItem) {
      const s = p.size || 1;
      r.drawRect('top', a.get('white'), p.x, p.y, s, s, p.valid ? rgba(0.4, 1, 0.4, 0.3) : rgba(1, 0.3, 0.3, 0.3));
    }
  }
}

const DIRS8: [number, number][] = [[0, -1], [0.7, -0.7], [1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7]];

export function wirePointOf(e: Entity, color: 'red' | 'green'): [number, number] {
  if (e instanceof ElectricPole) return e.wirePoint(color);
  const off = color === 'red' ? -0.15 : 0.15;
  return [e.x + off, e.y - Math.min(0.6, e.h * 0.3)];
}
