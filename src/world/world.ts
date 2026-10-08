// World: chunk storage, tiles, resources, entity registry & spatial queries, placement validation.
import { MapGen, MapSettings, CHUNK, RES_NAMES } from './mapgen';
import { Entity, createEntity } from '../sim/entity';
import { ENTITIES, EntityProto } from '../data/protos';
import { isWaterTile, TILES } from './tiles';
import { G, Dir } from '../core';

export class Chunk {
  cx: number; cy: number;
  tiles: Uint8Array; resType: Uint8Array; resAmount: Uint32Array;
  ents: Entity[] = [];
  occ: (Entity | null)[] = new Array(CHUNK * CHUNK).fill(null);
  units: Entity[] = [];
  pollution = 0;
  charted = false;
  mapDirty = true;
  treeCount = 0;
  constructor(cx: number, cy: number, tiles: Uint8Array, rt: Uint8Array, ra: Uint32Array) {
    this.cx = cx; this.cy = cy; this.tiles = tiles; this.resType = rt; this.resAmount = ra;
  }
}

export const chunkKey = (cx: number, cy: number) => (cx + 0x8000) * 0x10000 + (cy + 0x8000);

export class World {
  gen: MapGen;
  settings: MapSettings;
  chunks = new Map<number, Chunk>();
  entities = new Map<number, Entity>();
  units: Entity[] = [];
  onChunkGenerated: ((c: Chunk, gen: any[]) => void) | null = null;
  tileVersion = 0;

  constructor(settings: MapSettings) {
    this.settings = settings;
    this.gen = new MapGen(settings);
  }

  getChunk(cx: number, cy: number, generate = true): Chunk | undefined {
    const k = chunkKey(cx, cy);
    let c = this.chunks.get(k);
    if (!c && generate) {
      const g = this.gen.generate(cx, cy);
      c = new Chunk(cx, cy, g.tiles, g.resType, g.resAmount);
      this.chunks.set(k, c);
      this.tileVersion++;
      if (this.onChunkGenerated) this.onChunkGenerated(c, g.ents);
    }
    return c;
  }
  chunkAt(x: number, y: number, generate = false) { return this.getChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK), generate); }

  tile(x: number, y: number): number {
    const c = this.chunkAt(x, y);
    if (!c) return 0;
    return c.tiles[((y & 31) << 5) | (x & 31)];
  }
  setTile(x: number, y: number, t: number) {
    const c = this.chunkAt(x, y);
    if (!c) return;
    c.tiles[((y & 31) << 5) | (x & 31)] = t;
    c.mapDirty = true;
    this.tileVersion++;
  }
  res(x: number, y: number): [string, number] {
    const c = this.chunkAt(x, y);
    if (!c) return ['', 0];
    const i = ((y & 31) << 5) | (x & 31);
    return [RES_NAMES[c.resType[i]], c.resAmount[i]];
  }
  resType(x: number, y: number): number { const c = this.chunkAt(x, y); return c ? c.resType[((y & 31) << 5) | (x & 31)] : 0; }
  setResAmount(x: number, y: number, a: number) {
    const c = this.chunkAt(x, y);
    if (!c) return;
    const i = ((y & 31) << 5) | (x & 31);
    c.resAmount[i] = a;
    if (a <= 0 && c.resType[i] !== 6) { c.resType[i] = 0; c.mapDirty = true; }
  }
  isWater(x: number, y: number) { return isWaterTile(this.tile(x, y)); }
  walkSpeed(x: number, y: number) { return TILES[this.tile(Math.floor(x), Math.floor(y))]?.walk ?? 1; }

  occAt(x: number, y: number): Entity | null {
    const c = this.chunkAt(x, y);
    if (!c) return null;
    return c.occ[((y & 31) << 5) | (x & 31)];
  }
  private setOcc(e: Entity, v: Entity | null) {
    const x0 = e.tx, y0 = e.ty;
    for (let y = y0; y < y0 + e.h; y++) for (let x = x0; x < x0 + e.w; x++) {
      const c = this.chunkAt(x, y, true)!;
      const i = ((y & 31) << 5) | (x & 31);
      if (v === null) { if (c.occ[i] === e) c.occ[i] = null; } else c.occ[i] = v;
    }
  }

  addEntity(e: Entity, occupy = true) {
    this.entities.set(e.id, e);
    const c = this.chunkAt(Math.floor(e.x), Math.floor(e.y), true)!;
    c.ents.push(e);
    if (occupy && e.type !== 'straight-rail' && e.type !== 'curved-rail') this.setOcc(e, e);
    c.mapDirty = true;
    if (e.type === 'tree') c.treeCount++;
  }
  removeEntity(e: Entity) {
    this.entities.delete(e.id);
    const c = this.chunkAt(Math.floor(e.x), Math.floor(e.y));
    if (c) {
      const i = c.ents.indexOf(e);
      if (i >= 0) { c.ents[i] = c.ents[c.ents.length - 1]; c.ents.pop(); }
      c.mapDirty = true;
      if (e.type === 'tree') c.treeCount--;
    }
    this.setOcc(e, null);
  }
  addUnit(u: Entity) { this.units.push(u); this.entities.set(u.id, u); }
  removeUnit(u: Entity) {
    const i = this.units.indexOf(u);
    if (i >= 0) { this.units[i] = this.units[this.units.length - 1]; this.units.pop(); }
    this.entities.delete(u.id);
  }

  // Entities overlapping rect [x0,x1) x [y0,y1)
  entitiesIn(x0: number, y0: number, x1: number, y1: number, filter?: (e: Entity) => boolean, margin = 5): Entity[] {
    const out: Entity[] = [];
    const cx0 = Math.floor((x0 - margin) / CHUNK), cx1 = Math.floor((x1 + margin) / CHUNK);
    const cy0 = Math.floor((y0 - margin) / CHUNK), cy1 = Math.floor((y1 + margin) / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = this.chunks.get(chunkKey(cx, cy));
      if (!c) continue;
      for (const e of c.ents) {
        if (e.x + e.w / 2 > x0 && e.x - e.w / 2 < x1 && e.y + e.h / 2 > y0 && e.y - e.h / 2 < y1) {
          if (!filter || filter(e)) out.push(e);
        }
      }
    }
    return out;
  }
  unitsNear(x: number, y: number, r: number, filter?: (e: Entity) => boolean): Entity[] {
    const out: Entity[] = [];
    const r2 = r * r;
    for (const u of this.units) {
      const dx = u.x - x, dy = u.y - y;
      if (dx * dx + dy * dy <= r2 && (!filter || filter(u))) out.push(u);
    }
    return out;
  }

  // Best selectable entity at a point
  entityAt(px: number, py: number): Entity | null {
    // units first (characters, biters, vehicles)
    let best: Entity | null = null, bd = 1e9;
    for (const u of this.units) {
      if (!u.selectable) continue;
      const r = Math.max(u.w, u.h) / 2 + 0.1;
      const d = Math.hypot(u.x - px, u.y - py);
      if (d < r && d < bd) { bd = d; best = u; }
    }
    if (best) return best;
    const o = this.occAt(Math.floor(px), Math.floor(py));
    if (o && o.selectable) return o;
    // non-occupying entities (rails, mines, items on ground)
    const near = this.entitiesIn(px - 0.01, py - 0.01, px + 0.01, py + 0.01, e => e.selectable, 6);
    for (const e of near) if (e.type === 'item-on-ground') return e;
    for (const e of near) if (e.type !== 'straight-rail' && e.type !== 'curved-rail') return e;
    if (G.game?.rails) return G.game.rails.railAt(px, py);
    return near[0] || null;
  }

  // Validate placement of entity prototype centered at (x,y)
  canPlace(protoId: string, x: number, y: number, dir: Dir, opts: { ignore?: Entity; replace?: boolean; ghost?: boolean } = {}): { ok: boolean; reason?: string; replace?: Entity[] } {
    const p = ENTITIES[protoId];
    if (!p) return { ok: false, reason: 'unknown' };
    const rot = p.rotatable && (dir & 1) === 1;
    const w = rot ? p.h : p.w, h = rot ? p.w : p.h;
    const x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2);
    const replace: Entity[] = [];
    let needRes = p.type === 'mining-drill';
    let hasRes = false;
    for (let ty = y0; ty < y0 + h; ty++) for (let tx = x0; tx < x0 + w; tx++) {
      const c = this.chunkAt(tx, ty);
      if (!c) return { ok: false, reason: 'Ungenerated area' };
      const t = c.tiles[((ty & 31) << 5) | (tx & 31)];
      const water = isWaterTile(t);
      if (p.type === 'offshore-pump') continue;
      if (water) return { ok: false, reason: 'Cannot build on water' };
      const o = c.occ[((ty & 31) << 5) | (tx & 31)];
      if (o && o !== opts.ignore) {
        if (o.type === 'ghost' || o.type === 'item-on-ground') { replace.push(o); continue; }
        if (fastReplaceable(o.proto, p) && (o.x === x && o.y === y || o.proto.w === 1 && o.proto.h === 1)) { if (!replace.includes(o)) replace.push(o); continue; }
        return { ok: false, reason: o.type === 'tree' ? 'Tree in the way' : o.type === 'simple-entity' ? 'Rock in the way' : (o.proto.name || o.name) + ' in the way' };
      }
    }
    // rails block buildings
    if (p.type !== 'straight-rail' && p.type !== 'curved-rail' && G.game?.rails) {
      if (G.game.rails.blocksArea(x0, y0, w, h) && !['rail-signal', 'rail-chain-signal', 'locomotive', 'cargo-wagon', 'fluid-wagon', 'artillery-wagon'].includes(p.type)) return { ok: false, reason: 'Rail in the way' };
    }
    if (needRes) {
      const r = (p.miningArea ?? 1) / 2;
      if (p.cats?.includes('basic-fluid')) {
        hasRes = this.resType(Math.floor(x), Math.floor(y)) === 6;
        if (!hasRes) return { ok: false, reason: 'Must be placed on crude oil' };
      } else {
        for (let ty = Math.floor(y - r); ty < Math.ceil(y + r); ty++) for (let tx = Math.floor(x - r); tx < Math.ceil(x + r); tx++) {
          const rt = this.resType(tx, ty);
          if (rt > 0 && rt < 6) hasRes = true;
        }
        if (!hasRes) return { ok: false, reason: 'No resources under the drill' };
      }
    }
    if (p.type === 'offshore-pump') {
      // Output faces `dir`; the water side is the opposite direction.
      const dv = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
      const fx = Math.floor(x + dv[0] * 0.5), fy = Math.floor(y + dv[1] * 0.5);           // land tile (output side)
      const bx = Math.floor(x - dv[0] * 0.5 - (dv[0] === 0 ? 0 : 0)), by = Math.floor(y - dv[1] * 0.5); // water tile
      const ffx = Math.floor(x - dv[0] * 1.5), ffy = Math.floor(y - dv[1] * 1.5);          // beyond: water
      const landTile = [Math.floor(x + dv[0] * 0.5 - (dv[0] < 0 ? 0 : 0)), 0];
      void landTile;
      for (const [tx, ty] of [[fx, fy], [bx, by]]) {
        const o = this.occAt(tx, ty);
        if (o && o !== opts.ignore && o.type !== 'ghost') return { ok: false, reason: 'Something in the way' };
        if (!this.chunkAt(tx, ty)) return { ok: false, reason: 'Ungenerated area' };
      }
      if (this.isWater(fx, fy) || !this.isWater(bx, by) || !this.isWater(ffx, ffy)) return { ok: false, reason: 'Must be placed at the shore, facing land' };
    }
    // vehicles block placement
    if (!opts.ghost && !p.walkable && G.game) {
      for (const u of this.units) {
        if (!(u as any).isVehicle || u.dead || (u as any).isRollingStock) continue;
        const r = Math.max(u.w, u.h) / 2;
        if (u.x + r > x0 && u.x - r < x0 + w && u.y + r > y0 && u.y - r < y0 + h) return { ok: false, reason: 'Vehicle in the way' };
      }
    }
    // character collision for blocking entities
    if (!opts.ghost && p.type !== 'transport-belt' && !p.walkable && G.game?.player) {
      for (const pl of [G.game.player.character]) {
        if (!pl || pl.dead) continue;
        if (pl.x + 0.2 > x0 && pl.x - 0.2 < x0 + w && pl.y + 0.2 > y0 && pl.y - 0.2 < y0 + h) return { ok: false, reason: 'Player in the way' };
      }
    }
    return { ok: true, replace };
  }
}

const FAST_GROUPS: string[][] = [
  ['transport-belt', 'fast-transport-belt', 'express-transport-belt'],
  ['underground-belt', 'fast-underground-belt', 'express-underground-belt'],
  ['splitter', 'fast-splitter', 'express-splitter'],
  ['burner-inserter', 'inserter', 'long-handed-inserter', 'fast-inserter', 'bulk-inserter'],
  ['assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3'],
  ['stone-furnace', 'steel-furnace'],
  ['wooden-chest', 'iron-chest', 'steel-chest', 'active-provider-chest', 'passive-provider-chest', 'storage-chest', 'buffer-chest', 'requester-chest'],
  ['small-electric-pole', 'medium-electric-pole'],
  ['pipe', 'pipe-to-ground'],
  ['burner-mining-drill', 'electric-mining-drill'],
  ['stone-wall', 'gate'],
];
export function fastReplaceable(a: EntityProto, b: EntityProto): boolean {
  if (a.id === b.id) return true;
  for (const g of FAST_GROUPS) if (g.includes(a.id) && g.includes(b.id)) return a.w === b.w && a.h === b.h;
  return false;
}
