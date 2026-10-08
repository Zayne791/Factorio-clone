// Freeplay crash site: smoking spaceship wreck (lootable) and minable hull debris near the spawn.
import { Entity, PHASE, registerEntity } from './entity';
import { Container } from './simple';
import { Stack } from './inventory';
import { G, Dir } from '../core';
import { ENTITIES } from '../data/protos';
import type { Renderer } from '../engine/renderer';
import { WHITE, additive } from '../engine/renderer';
import { isWaterTile } from '../world/tiles';

ENTITIES['crash-site-spaceship'] = { id: 'crash-site-spaceship', name: 'Crashed spaceship', type: 'crash-site-spaceship', w: 8, h: 4, health: 2000, mineTime: 0, item: '', slots: 16, mapColor: '8a8a8a', resist: { fire: [0, 1] } } as any;
ENTITIES['crash-site-debris'] = { id: 'crash-site-debris', name: 'Spaceship wreck', type: 'crash-site-debris', w: 1, h: 1, health: 300, mineTime: 1.2, item: '', mapColor: '8a8a8a' } as any;

const FIRE_POINTS: [number, number][] = [[-3.2, -0.6], [0.9, -1.2], [2.6, 0.4], [-1.2, 0.8]];

export class CrashSpaceship extends Container {
  born = 0;
  get isBuilding() { return false; }
  get minable() { return false; }
  get phase() { return PHASE.MISC; }
  update() {
    const g = G.game;
    const age = g.tick - this.born;
    const k = age < 60 * 60 * 8 ? 1 : age < 60 * 60 * 20 ? 0.4 : 0;
    if (k > 0 && (g.tick + this.id) % Math.round(14 / k) === 0) {
      const p = FIRE_POINTS[Math.floor(Math.random() * FIRE_POINTS.length)];
      g.fx?.smoke(this.x + p[0] + (Math.random() - 0.5) * 0.6, this.y + p[1] - 1.2, 1.4);
    }
  }
  draw(r: Renderer) {
    const a = r.atlas, g = G.game;
    r.draw('objects', a.get('crash-site-spaceship'), this.x, this.y, WHITE, 0, 1, this.y + 1.5);
    r.draw('shadow', a.get('crash-site-spaceship-shadow'), this.x, this.y);
    const age = g.tick - this.born;
    if (age < 60 * 60 * 8) {
      for (let i = 0; i < FIRE_POINTS.length; i++) {
        const [fx, fy] = FIRE_POINTS[i];
        const fl = 0.7 + 0.3 * Math.sin(g.renderTime * 11 + i * 2.3);
        r.draw('objects', a.get('flame'), this.x + fx, this.y + fy - 0.6, additive(1, 0.6, 0.22, fl), 0, 0.9 + 0.15 * Math.sin(g.renderTime * 7 + i), this.y + 1.6);
        r.draw('light', a.get('light'), this.x + fx, this.y + fy, additive(1, 0.55, 0.2, 0.9), 0, 6);
      }
    }
  }
  serialize() { return { ...super.serialize(), b: this.born }; }
  load(d: any) { super.load(d); this.born = d.b || 0; }
}

export class CrashDebris extends Entity {
  variant = 0;
  constructor(p: string, x: number, y: number, d: Dir) { super('crash-site-debris', x, y, 0); }
  get isBuilding() { return false; }
  get mineTime() { return this.variant < 2 ? 1.6 : 0.8; }
  minedItems(): Stack[] { return [{ id: 'iron-plate', n: this.variant < 2 ? 8 : 3 }]; }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get(`crash-debris-${this.variant}`), this.x, this.y, WHITE, 0, 1, this.y + 0.2);
    r.draw('shadow', a.get(`crash-debris-${this.variant}-shadow`), this.x, this.y);
  }
  serialize() { return { v: this.variant }; }
  load(d: any) { this.variant = d.v || 0; }
}
registerEntity(['crash-site-spaceship'], CrashSpaceship);
registerEntity(['crash-site-debris'], CrashDebris);

function areaClear(x0: number, y0: number, w: number, h: number): boolean {
  const g = G.game, world = g.world;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (!world.chunkAt(x, y) || isWaterTile(world.tile(x, y))) return false;
    const o = world.occAt(x, y);
    if (o && o.type !== 'tree' && o.type !== 'simple-entity') return false;
  }
  return true;
}
function clearArea(x0: number, y0: number, w: number, h: number) {
  const g = G.game;
  for (const e of g.world.entitiesIn(x0 - 0.5, y0 - 0.5, x0 + w + 0.5, y0 + h + 0.5, e => e.type === 'tree' || e.type === 'simple-entity', 2)) g.removeEntity(e);
}

export function spawnCrashSite(sx: number, sy: number) {
  const g = G.game;
  // find a spot for the ship a few tiles from the player
  let placed: CrashSpaceship | null = null;
  for (let r = 6; r < 30 && !placed; r += 2) for (let k = 0; k < 12 && !placed; k++) {
    const a = k / 12 * Math.PI * 2 + 0.6;
    const cx = Math.round(sx + Math.cos(a) * r), cy = Math.round(sy + Math.sin(a) * r * 0.7);
    if (!areaClear(cx - 5, cy - 3, 10, 6)) continue;
    clearArea(cx - 6, cy - 4, 12, 8);
    const s = new CrashSpaceship('crash-site-spaceship', cx, cy, 0);
    s.born = g.tick;
    s.inv.insert('iron-plate', 8); s.inv.insert('iron-gear-wheel', 4); s.inv.insert('copper-cable', 10);
    g.addEntity(s);
    placed = s;
  }
  const ox = placed ? placed.x : sx + 6, oy = placed ? placed.y : sy;
  // scattered debris
  let n = 0;
  for (let tries = 0; tries < 80 && n < 10; tries++) {
    const a = tries * 2.399, r = 4 + (tries % 7) * 1.6;
    const x = Math.floor(ox + Math.cos(a) * r * 1.3) + 0.5, y = Math.floor(oy + Math.sin(a) * r) + 0.5;
    if (Math.hypot(x - sx, y - sy) < 2.5) continue;
    if (!areaClear(Math.floor(x), Math.floor(y), 1, 1)) continue;
    clearArea(Math.floor(x), Math.floor(y), 1, 1);
    const d = new CrashDebris('crash-site-debris', x, y, 0);
    d.variant = n < 2 ? n : 2 + (tries % 4);
    g.world.addEntity(d);
    n++;
  }
}
