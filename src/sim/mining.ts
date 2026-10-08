// Mining drills (burner/electric) and pumpjacks.
import { Entity, registerEntity } from './entity';
import { Machine } from './crafting';
import { FluidBox, FluidOwner } from './fluids';
import { BeltBase } from './belts';
import { G, Dir, DIRS } from '../core';
import { RESOURCES } from '../data/protos';
import { RES_NAMES } from '../world/mapgen';
import type { Renderer } from '../engine/renderer';
import { WHITE, rgba, additive } from '../engine/renderer';

export class MiningDrill extends Machine implements FluidOwner {
  fluidBoxes: FluidBox[] = [];
  progress = 0;
  bonus = 0;
  pending: string | null = null;
  tiles: [number, number][] = [];
  tileIdx = 0;
  outX = 0; outY = 0;
  isPump: boolean;
  lastYield = 0;
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.isPump = !!this.proto.cats?.includes('basic-fluid');
    if (this.proto.fluidBoxes) this.fluidBoxes = this.proto.fluidBoxes.map((fb, i) => new FluidBox(this, fb, i));
    if (this.proto.outPos) { const [ox, oy] = this.local(this.proto.outPos[0], this.proto.outPos[1]); this.outX = ox; this.outY = oy; }
  }
  onPlaced() {
    super.onPlaced();
    if (this.fluidBoxes.length) G.game.fluids.add(this);
    this.scanTiles();
  }
  onRemoved() { super.onRemoved(); if (this.fluidBoxes.length) G.game.fluids.remove(this); }
  scanTiles() {
    this.tiles = [];
    const w = G.game.world;
    if (this.isPump) { this.tiles = [[Math.floor(this.x), Math.floor(this.y)]]; return; }
    const r = this.proto.miningArea! / 2;
    for (let ty = Math.floor(this.y - r); ty < Math.ceil(this.y + r); ty++) for (let tx = Math.floor(this.x - r); tx < Math.ceil(this.x + r); tx++) {
      const t = w.resType(tx, ty);
      if (t > 0 && t < 6) this.tiles.push([tx, ty]);
    }
  }
  allowsProd() { return true; }
  currentResource(): string | null {
    const w = G.game.world;
    while (this.tiles.length) {
      const i = this.tileIdx % this.tiles.length;
      const [tx, ty] = this.tiles[i];
      const [rid, amt] = w.res(tx, ty);
      if (rid && (amt > 0 || this.isPump)) return rid;
      this.tiles.splice(i, 1);
    }
    return null;
  }
  private outputTarget(): Entity | null { return G.game.world.occAt(Math.floor(this.outX), Math.floor(this.outY)); }
  private tryOutput(id: string): boolean {
    const t = this.outputTarget();
    if (t instanceof BeltBase) {
      // drop on lane nearest to the drop point
      let best: any = null, bd = 1e9;
      for (const l of t.lanes) {
        for (let p = 0; p <= l.len; p += l.len / 8) {
          if (!t.laneVisible(l, p)) continue;
          const [wx, wy] = t.lanePos(l, p);
          const d = Math.hypot(wx - this.outX, wy - this.outY);
          if (d < bd) { bd = d; best = [l, p]; }
        }
      }
      if (!best) return false;
      const [l, p] = best;
      if (!l.hasSpaceAt(p)) return false;
      l.insertAt(p, id);
      return true;
    }
    if (t && t !== this) {
      if (t.wantsFuel(id) > 0 || t.wants(id) > 0 || t.type === 'container' || t.type === 'cargo-wagon') return t.insertItem(id, 1, 'drill') > 0;
      return t.insertItem(id, 1, 'drill') > 0;
    }
    if (!t) {
      const existing = G.game.world.entitiesIn(this.outX - 0.3, this.outY - 0.3, this.outX + 0.3, this.outY + 0.3, e => e.type === 'item-on-ground', 1);
      if (existing.length) return false;
      G.game.spillItem(this.outX, this.outY, id, 1, true);
      return true;
    }
    return false;
  }
  update() {
    this.powerWarn();
    if (this.pending) {
      this.energyTick(false);
      if (this.tryOutput(this.pending)) this.pending = null;
      else { this.status = 'output-full'; this.working = false; return; }
    }
    if (!this.active) { this.energyTick(false); this.working = false; return; }
    const rid = this.currentResource();
    if (!rid) { this.status = 'no-resources'; this.working = false; this.energyTick(false); this.warnIcon = 'warn-generic'; return; }
    const res = RESOURCES[rid];
    if (this.isPump) {
      const b = this.fluidBoxes[0];
      if (b.space < 1) { this.status = 'output-full'; this.working = false; this.energyTick(false); return; }
    }
    if (res.requiresFluid) {
      const b = this.fluidBoxes[0];
      (b as any).wantFluid = res.requiresFluid; b.filter = res.requiresFluid;
      if (b.amount < 1 || b.fluid !== res.requiresFluid) { this.status = 'no-fluid'; this.working = false; this.energyTick(false); return; }
    }
    const f = this.energyTick(true);
    if (f <= 0) { this.working = false; this.status = this.burner ? 'no-fuel' : 'no-power'; return; }
    this.working = true; this.status = 'working';
    const prodBonus = G.game.bonus.miningProd + this.effects().prod;
    const dp = this.speed / (res.mineTime * 60) * f;
    this.progress += dp;
    this.bonus += dp * prodBonus;
    this.animT += f * this.speed;
    this.pollute(f);
    let cycles = 0;
    if (this.progress >= 1) { this.progress -= 1; cycles++; }
    if (this.bonus >= 1) { this.bonus -= 1; cycles++; }
    for (let c = 0; c < cycles; c++) this.mineOnce(rid, c === 0);
  }
  private mineOnce(rid: string, deplete: boolean) {
    const w = G.game.world;
    const [tx, ty] = this.tiles[this.tileIdx % this.tiles.length];
    const [, amt] = w.res(tx, ty);
    if (this.isPump) {
      const yieldF = Math.max(amt, 6000) / 30000;
      const out = Math.min(1000, yieldF * 10);
      const b = this.fluidBoxes[0];
      b.fluid = 'crude-oil'; b.temp = 15; b.amount = Math.min(b.volume, b.amount + out);
      this.lastYield = yieldF;
      G.game.stats.produce('crude-oil', out);
      if (deplete && amt > 6000) w.setResAmount(tx, ty, amt - 1);
      G.game.research.onMined('crude-oil');
      return;
    }
    const res = RESOURCES[rid];
    if (res.requiresFluid) { this.fluidBoxes[0].amount -= 1; G.game.stats.consume(res.requiresFluid, 1); }
    if (deplete) {
      w.setResAmount(tx, ty, amt - 1);
      if (amt - 1 <= 0) { this.tiles.splice(this.tileIdx % this.tiles.length, 1); G.game.world.chunkAt(tx, ty)!.mapDirty = true; }
      this.tileIdx++;
    }
    const item = res.item!;
    G.game.stats.produce(item, 1);
    G.game.research.onMined(rid);
    if (!this.tryOutput(item)) this.pending = item;
  }
  inventories() { return super.inventories(); }
  insertItem(id: string, n: number) { return this.burner && this.burner.isFuel(id) ? this.burner.fuel.insert(id, n) : 0; }
  remainingResources(): number {
    let t = 0;
    for (const [x, y] of this.tiles) t += G.game.world.res(x, y)[1];
    return t;
  }
  draw(r: Renderer, alt: boolean) {
    const a = r.atlas;
    if (this.isPump) {
      r.draw('objects', a.get(`pumpjack-${this.dir}`), this.x, this.y, WHITE, 0, 1, this.y + 1);
      r.draw('shadow', a.get(`pumpjack-${this.dir}-shadow`), this.x, this.y);
      const fr = Math.floor(this.animT * 0.25) % 16;
      r.draw('objects', a.get(`pumpjack-beam-${fr}`), this.x, this.y - 0.3, WHITE, 0, 1, this.y + 1.01);
      return;
    }
    const key = `${this.name}-${this.dir}`;
    r.draw('objects', a.get(key), this.x, this.y, WHITE, 0, 1, this.y + this.h / 2 - 0.5);
    r.draw('shadow', a.get(key + '-shadow'), this.x, this.y);
    if (this.name === 'electric-mining-drill') {
      r.draw('objects', a.get('drill-head'), this.x, this.y - 0.2, WHITE, this.animT * 0.08, 0.85, this.y + this.h / 2 - 0.49);
    } else {
      r.draw('objects', a.get('burner-drill-head'), this.x, this.y - 0.7, WHITE, this.animT * 0.1, 0.7, this.y + this.h / 2 - 0.49);
      if (this.working) {
        r.draw('objects', a.get('fire-glow'), this.x, this.y + 0.62, additive(1, 0.55, 0.2, 0.8), 0, 0.35, this.y + this.h / 2 - 0.48);
        r.draw('light', a.get('light'), this.x, this.y + 0.6, additive(1, 0.5, 0.2), 0, 3);
      }
    }
  }
  serialize() { return { p: this.progress, b: this.bonus, pe: this.pending, bu: this.burner?.serialize(), m: this.modules?.serialize(), fb: this.fluidBoxes.map(b => [b.fluid, b.amount, b.temp]) }; }
  load(d: any) {
    this.progress = d.p || 0; this.bonus = d.b || 0; this.pending = d.pe || null;
    if (d.bu && this.burner) this.burner.load(d.bu); if (d.m && this.modules) this.modules.load(d.m);
    if (d.fb) d.fb.forEach((x: any, i: number) => { const b = this.fluidBoxes[i]; if (b && x) { b.fluid = x[0]; b.amount = x[1]; b.temp = x[2]; } });
  }
  description() {
    if (this.isPump) return [`Yield: ${(this.lastYield * 100).toFixed(0)}%`];
    return [`Expected resources: ${this.remainingResources()}`];
  }
}
registerEntity(['mining-drill'], MiningDrill);
