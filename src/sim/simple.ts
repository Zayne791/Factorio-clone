// Simple entities: containers, items on ground, trees, rocks, fish, lamps, walls, gates, radar, remnants, landing pad.
import { Entity, PHASE, registerEntity } from './entity';
import { Inventory, Stack } from './inventory';
import { G, Dir } from '../core';
import { ITEMS } from '../data/protos';
import type { Renderer } from '../engine/renderer';
import { WHITE, rgba, additive } from '../engine/renderer';
import { hash2 } from '../engine/noise';
import { TREE_VARIANTS } from '../art/sprites-world';

export class Container extends Entity {
  inv: Inventory;
  requests: { id: string; n: number }[] = [];
  requestFromBuffers = false;
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.inv = new Inventory(this.proto.slots || 16);
  }
  get logistic() { return this.proto.logistic; }
  onPlaced() { if (this.logistic) G.game.logistics?.addChest(this); }
  onRemoved() { if (this.logistic) G.game.logistics?.removeChest(this); }
  inventories() { return [this.inv]; }
  wants(id: string) { return this.inv.space(id, true); }
  insertItem(id: string, n: number, src = 'inserter') { return this.inv.insert(id, n, src !== 'player'); }
  takeOutput(max: number, filter?: (id: string) => boolean) { return this.inv.takeAny(max, filter); }
  hasOutput(filter?: (id: string) => boolean) { return this.inv.firstItem(filter) !== null; }
  draw(r: Renderer, alt: boolean) {
    const a = r.atlas;
    r.draw('objects', a.get(this.name), this.x, this.y, WHITE, 0, 1, this.y + 0.3);
    r.draw('shadow', a.get(this.name + '-shadow'), this.x, this.y);
    if (alt && this.requests.length) {
      const q = this.requests[0];
      r.draw('overlay', a.get('alt-bg'), this.x, this.y, WHITE, 0, 0.5);
      r.draw('overlay', a.get('icon:' + q.id), this.x, this.y, WHITE, 0, 0.4);
    }
  }
  serialize() { return { i: this.inv.serialize(), rq: this.requests, rb: this.requestFromBuffers }; }
  load(d: any) { this.inv.load(d.i); this.requests = d.rq || []; this.requestFromBuffers = !!d.rb; }
}

export class CargoLandingPad extends Container {
  draw(r: Renderer) {
    const a = r.atlas;
    r.drawRect('ground2', a.get('white'), this.x, this.y, 7.8, 7.8, rgba(0.32, 0.32, 0.3, 1));
    r.drawRect('ground2', a.get('white'), this.x, this.y, 6, 6, rgba(0.22, 0.22, 0.2, 1));
    r.draw('ground2', a.get('ring'), this.x, this.y, rgba(0.9, 0.7, 0.2, 1), 0, 5);
    r.draw('ground2', a.get('ring'), this.x, this.y, rgba(0.9, 0.7, 0.2, 1), 0, 3);
  }
}

export class ItemOnGround extends Entity {
  item: string;
  n = 1;
  constructor(p: string, x: number, y: number, d: Dir) { super('item-on-ground', x, y, 0); this.item = 'iron-plate'; this.w = 0.5; this.h = 0.5; }
  get isBuilding() { return false; }
  get blocksMovement() { return false; }
  get phase() { return PHASE.NONE; }
  draw(r: Renderer) {
    r.draw('ground2', r.atlas.get('icon:' + this.item), this.x, this.y, WHITE, 0, 0.42);
  }
  serialize() { return { it: this.item }; }
  load(d: any) { this.item = d.it; }
}

export class Tree extends Entity {
  variant = 0;
  leafStage = 0;
  constructor(p: string, x: number, y: number, d: Dir) { super('tree', x, y, 0); this.w = 1; this.h = 1; this.health = 50; }
  get maxHealth() { return 50; }
  get isBuilding() { return false; }
  get tx() { return Math.floor(this.x); }
  get ty() { return Math.floor(this.y); }
  get isDeadTree() { return this.variant < 0; }
  get mineTime() { return this.isDeadTree ? 0.5 : 0.55; }
  minedItems(): Stack[] { return [{ id: 'wood', n: this.isDeadTree ? 2 : 4 }]; }
  draw(r: Renderer) {
    const a = r.atlas;
    const name = this.variant < 0 ? `dead-tree-${(-this.variant - 1) % 3}` : `tree-${this.variant % TREE_VARIANTS}`;
    const pol = this.leafStage;
    const col = pol > 0 ? rgba(1 - pol * 0.15, 1 - pol * 0.25, 1 - pol * 0.35, 1) : WHITE;
    r.draw('objects', a.get(name), this.x, this.y, col, 0, 1.25, this.y + 0.3);
    r.draw('shadow', a.get(name + '-shadow'), this.x, this.y, WHITE, 0, 1.25);
  }
  serialize() { return { v: this.variant, ls: this.leafStage }; }
  load(d: any) { this.variant = d.v; this.leafStage = d.ls || 0; }
}

export class Rock extends Entity {
  sub = 'big-rock';
  variant = 0;
  constructor(p: string, x: number, y: number, d: Dir) { super('simple-entity', x, y, 0); this.w = 2; this.h = 2; }
  get isBuilding() { return false; }
  get maxHealth() { return 500; }
  get mineTime() { return this.sub === 'huge-rock' ? 2 : 2; }
  minedItems(): Stack[] {
    const h = hash2(Math.floor(this.x), Math.floor(this.y), 3);
    if (this.sub === 'huge-rock') return [{ id: 'stone', n: 24 + Math.floor(h * 26) }, { id: 'coal', n: 24 + Math.floor(h * 26) }];
    if (this.sub === 'big-sand-rock') return [{ id: 'stone', n: 19 + Math.floor(h * 6) }];
    return [{ id: 'stone', n: 20 }];
  }
  draw(r: Renderer) {
    const a = r.atlas;
    const name = `${this.sub}-${this.variant % 3}`;
    r.draw('objects', a.get(name), this.x, this.y, WHITE, 0, 1, this.y + 0.6);
    r.draw('shadow', a.get(name + '-shadow'), this.x, this.y);
  }
  serialize() { return { s: this.sub, v: this.variant }; }
  load(d: any) { this.sub = d.s; this.variant = d.v; }
}

export class Fish extends Entity {
  t = Math.random() * 100;
  constructor(p: string, x: number, y: number, d: Dir) { super('fish', x, y, 0); this.w = 0.6; this.h = 0.6; }
  get isBuilding() { return false; }
  get blocksMovement() { return false; }
  get mineTime() { return 0.4; }
  minedItems(): Stack[] { return [{ id: 'raw-fish', n: 5 }]; }
  draw(r: Renderer) {
    const t = G.game.renderTime + this.t;
    const ox = Math.sin(t * 0.7) * 0.3, oy = Math.cos(t * 0.5) * 0.3;
    r.draw('ground2', r.atlas.get('icon:raw-fish'), this.x + ox, this.y + oy, rgba(0.6, 0.7, 0.75, 0.5), Math.atan2(Math.cos(t * 0.7), -Math.sin(t * 0.5)), 0.35);
  }
}

export class Remnants extends Entity {
  size = 1; born = 0;
  constructor(p: string, x: number, y: number, d: Dir) { super('remnants', x, y, 0); this.w = 0.1; this.h = 0.1; }
  get selectable() { return false; }
  get isBuilding() { return false; }
  get blocksMovement() { return false; }
  get minable() { return false; }
  draw(r: Renderer) {
    r.draw('ground2', r.atlas.get(this.sprite), this.x, this.y, rgba(1, 1, 1, 0.9), (this.id % 4) * 1.57, this.size);
  }
  sprite = 'remnants';
  serialize() { return { s: this.size, b: this.born, sp: this.sprite }; }
  load(d: any) { this.size = d.s; this.born = d.b; this.sprite = d.sp || 'remnants'; }
}

export class Lamp extends Entity {
  on = false;
  color: [number, number, number] | null = null;
  get phase() { return PHASE.MISC; }
  onPlaced() { G.game.power.addElectric(this); }
  onRemoved() { G.game.power.removeElectric(this); }
  update() {
    const dark = G.game.darkness > 0.3;
    this.on = dark && this.active && this.power > 0 && !!this.elecNet || (this.active && this.color !== null && this.power > 0 && !!this.elecNet);
    this.demand = this.active ? this.proto.energy! / 60 : 0;
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get('small-lamp'), this.x, this.y, WHITE, 0, 1, this.y + 0.3);
    r.draw('shadow', a.get('small-lamp-shadow'), this.x, this.y);
    if (this.on) {
      const c = this.color || [1, 0.97, 0.85];
      const k = this.power;
      r.draw('objects', a.get('lamp-glow'), this.x, this.y - 0.35, additive(c[0] * k, c[1] * k, c[2] * k, 0.9), 0, 0.8, this.y + 0.31);
      r.draw('light', a.get('light'), this.x, this.y, additive(c[0] * k, c[1] * k, c[2] * k), 0, 22);
    }
  }
}

export class Wall extends Entity {
  mask = 0;
  onPlaced() { this.refreshNeighbours(true); }
  onRemoved() { this.refreshNeighbours(false); }
  refreshNeighbours(self: boolean) {
    const w = G.game.world;
    const tx = Math.floor(this.x), ty = Math.floor(this.y);
    const upd = (e: Entity | null) => { if (e instanceof Wall) e.computeMask(); };
    if (self) this.computeMask();
    upd(w.occAt(tx, ty - 1)); upd(w.occAt(tx + 1, ty)); upd(w.occAt(tx, ty + 1)); upd(w.occAt(tx - 1, ty));
  }
  computeMask() {
    const w = G.game.world;
    const tx = Math.floor(this.x), ty = Math.floor(this.y);
    const isW = (e: Entity | null) => !!e && !e.dead && (e instanceof Wall || e.type === 'gate');
    this.mask = (isW(w.occAt(tx, ty - 1)) ? 1 : 0) | (isW(w.occAt(tx + 1, ty)) ? 2 : 0) | (isW(w.occAt(tx, ty + 1)) ? 4 : 0) | (isW(w.occAt(tx - 1, ty)) ? 8 : 0);
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get(`wall-${this.mask}`), this.x, this.y, WHITE, 0, 1, this.y + 0.4);
    r.draw('shadow', a.get(`wall-${this.mask}-shadow`), this.x, this.y);
  }
}

export class Gate extends Entity {
  open = 0;
  get phase() { return PHASE.MISC; }
  get blocksMovement() { return this.open < 0.5; }
  update() {
    const pl = G.game.player.character;
    let near = false;
    if (pl && !pl.dead && Math.hypot(pl.x - this.x, pl.y - this.y) < 2.5) near = true;
    if (!near && G.game.trains?.trainNear(this.x, this.y, 3)) near = true;
    this.open = Math.max(0, Math.min(1, this.open + (near ? 0.08 : -0.05)));
  }
  draw(r: Renderer) {
    const a = r.atlas;
    const v = (this.dir & 1) ? 'v' : 'h';
    const sp = `gate-${v}-${this.open > 0.5 ? 1 : 0}`;
    r.draw('objects', a.get(sp), this.x, this.y, WHITE, 0, 1, this.y + 0.4);
    r.draw('shadow', a.get(sp + '-shadow'), this.x, this.y);
  }
}

export class Radar extends Entity {
  angle = 0;
  scanProgress = 0;
  scanTarget: [number, number] | null = null;
  get phase() { return PHASE.MISC; }
  onPlaced() { G.game.power.addElectric(this); }
  onRemoved() { G.game.power.removeElectric(this); }
  update() {
    this.demand = this.proto.energy! / 60;
    if (this.power <= 0) return;
    this.angle += 0.015 * this.power;
    const g = G.game;
    const cx = Math.floor(this.x / 32), cy = Math.floor(this.y / 32);
    // continuous coverage: 7x7 chunks charted
    if (g.tick % 60 === this.id % 60) {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) g.chart(cx + dx, cy + dy);
    }
    // sector scanning: 10MJ per sector (300kW -> ~33s), radius 14 chunks
    this.scanProgress += this.power * this.proto.energy! / 60 / 10e6;
    if (this.scanProgress >= 1) {
      this.scanProgress = 0;
      for (let tries = 0; tries < 50; tries++) {
        const dx = Math.floor(Math.random() * 29) - 14, dy = Math.floor(Math.random() * 29) - 14;
        const c = g.world.getChunk(cx + dx, cy + dy, false);
        if (!c || !c.charted) { g.world.getChunk(cx + dx, cy + dy, true); g.chart(cx + dx, cy + dy); break; }
      }
    }
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get('radar'), this.x, this.y, WHITE, 0, 1, this.y + 1);
    r.draw('shadow', a.get('radar-shadow'), this.x, this.y);
    const s = Math.cos(this.angle);
    r.drawRect('objects', a.get('radar-dish'), this.x, this.y - 1.1, 2.5 * (0.35 + 0.65 * Math.abs(s)) * (s < 0 ? -1 : 1), 1.85, WHITE, 0, this.y + 1.01);
  }
  serialize() { return { a: this.angle, s: this.scanProgress }; }
  load(d: any) { this.angle = d.a || 0; this.scanProgress = d.s || 0; }
}

registerEntity(['container', 'logistic-container'], Container);
registerEntity(['cargo-landing-pad'], CargoLandingPad);
registerEntity(['item-on-ground'], ItemOnGround);
registerEntity(['tree'], Tree);
registerEntity(['simple-entity'], Rock);
registerEntity(['fish'], Fish);
registerEntity(['remnants'], Remnants);
registerEntity(['lamp'], Lamp);
registerEntity(['wall'], Wall);
registerEntity(['gate'], Gate);
registerEntity(['radar'], Radar);
