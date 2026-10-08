// Crafting machines: assemblers, chemical plants, refineries, centrifuges, furnaces, labs, rocket silo, beacons.
import { Entity, PHASE, registerEntity, Burner } from './entity';
import { Inventory, Stack } from './inventory';
import { FluidBox, FluidOwner } from './fluids';
import { G, Dir, DIRS } from '../core';
import { ITEMS, RECIPES, RecipeProto, SMELT_RECIPE_FOR, TECHS, isFluid } from '../data/protos';
import type { Renderer } from '../engine/renderer';
import { WHITE, rgba, additive } from '../engine/renderer';

export interface Effects { speed: number; prod: number; energy: number; pollution: number; }
export let BEACON_VERSION = 1;
export function bumpBeacons() { BEACON_VERSION++; }

export class Machine extends Entity {
  modules: Inventory | null = null;
  burner: Burner | null = null;
  eff: Effects = { speed: 0, prod: 0, energy: 0, pollution: 0 };
  effVer = -1;
  working = false;
  animT = 0;
  get phase() { return PHASE.MACHINE; }
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    if (this.proto.modules) { this.modules = new Inventory(this.proto.modules); this.modules.onChange = () => { this.effVer = -1; }; }
    if (this.proto.source === 'burner') this.burner = new Burner(1);
  }
  onPlaced() { if (this.proto.source === 'electric') G.game.power.addElectric(this); }
  onRemoved() { if (this.proto.source === 'electric') G.game.power.removeElectric(this); }
  allowsProd(): boolean { return true; }
  effects(): Effects {
    if (this.effVer === BEACON_VERSION) return this.eff;
    const e: Effects = { speed: 0, prod: 0, energy: 0, pollution: 0 };
    if (this.modules) for (const s of this.modules.slots) if (s) {
      const m = ITEMS[s.id].module!;
      e.speed += (m.speed || 0); e.prod += (m.prod || 0); e.energy += (m.energy || 0); e.pollution += (m.pollution || 0);
    }
    // beacons
    const beacons = G.game.world.entitiesIn(this.x - this.w / 2 - 4.5, this.y - this.h / 2 - 4.5, this.x + this.w / 2 + 4.5, this.y + this.h / 2 + 4.5, b => b instanceof Beacon, 6) as Beacon[];
    const affecting = beacons.filter(b => b.affects(this));
    if (affecting.length) {
      const k = 1 / Math.sqrt(affecting.length);
      for (const b of affecting) {
        if (b.power <= 0) continue;
        for (const s of b.modules.slots) if (s) {
          const m = ITEMS[s.id].module!;
          e.speed += (m.speed || 0) * 1.5 * k; e.energy += (m.energy || 0) * 1.5 * k; e.pollution += (m.pollution || 0) * 1.5 * k;
          e.prod += (m.prod || 0) * 1.5 * k;
        }
      }
    }
    if (!this.allowsProd()) e.prod = 0;
    e.energy = Math.max(-0.8, e.energy);
    e.speed = Math.max(-0.8, e.speed);
    this.eff = e; this.effVer = BEACON_VERSION;
    return e;
  }
  // energy for this tick; returns speed factor 0..1
  energyTick(active: boolean): number {
    const e = this.effects();
    const full = (this.proto.energy || 0) * (1 + e.energy) / 60;
    if (this.burner) {
      if (!active) return 1;
      return this.burner.consume(full);
    }
    if (this.proto.source === 'electric') {
      this.demand = (this.proto.drain || 0) / 60 + (active ? full : 0);
      return this.power;
    }
    return 1;
  }
  pollute(factor: number) {
    if (!this.proto.pollution) return;
    const e = this.effects();
    G.game.pollute(this.x, this.y, this.proto.pollution / 3600 * (1 + e.energy) * (1 + e.pollution) * factor);
  }
  get speed() { return (this.proto.speed || 1) * (1 + this.effects().speed); }
  powerWarn() {
    if (this.burner) this.warnIcon = this.burner.hasFuel ? null : 'warn-no-fuel';
    else if (this.proto.source === 'electric') this.warnIcon = !this.elecNet || this.power <= 0 ? 'warn-no-power' : this.power < 0.99 ? 'warn-low-power' : null;
  }
  inventories(): Inventory[] { const r: Inventory[] = []; if (this.burner) r.push(this.burner.fuel); if (this.modules) r.push(this.modules); return r; }
  wantsFuel(id: string) { return this.burner ? this.burner.wantsFuel(id) : 0; }
}

// ---------------- Assembling machine & friends ----------------
export class CraftingMachine extends Machine implements FluidOwner {
  recipe: RecipeProto | null = null;
  input = new Inventory(0);
  output = new Inventory(0);
  fluidBoxes: FluidBox[] = [];
  progress = 0;
  crafting = false;
  bonus = 0;
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    if (this.proto.fluidBoxes) this.fluidBoxes = this.proto.fluidBoxes.map((fb, i) => new FluidBox(this, fb, i));
  }
  onPlaced() { super.onPlaced(); if (this.fluidBoxes.length) G.game.fluids.add(this); }
  onRemoved() { super.onRemoved(); if (this.fluidBoxes.length) G.game.fluids.remove(this); }
  allowsProd() { return !!this.recipe?.allowProd; }
  get fixedRecipe(): boolean { return false; }
  canUse(r: RecipeProto) { return !!this.proto.cats?.includes(r.cat); }
  setRecipe(r: RecipeProto | null, returnTo?: (s: Stack) => void) {
    if (this.recipe === r) return;
    // return items
    const back: Stack[] = [];
    for (const s of this.input.slots) if (s) back.push(s);
    for (const s of this.output.slots) if (s) back.push(s);
    if (this.crafting && this.recipe) for (const i of this.recipe.ing) if (!i.fluid) back.push({ id: i.id, n: i.n });
    for (const s of back) { if (returnTo) returnTo(s); else G.game.spillItem(this.x, this.y, s.id, s.n); }
    this.recipe = r;
    this.progress = 0; this.crafting = false; this.bonus = 0; this.effVer = -1;
    const ing = r ? r.ing.filter(i => !i.fluid) : [];
    const res = r ? r.res.filter(i => !i.fluid) : [];
    this.input = new Inventory(ing.length); this.input.filters = ing.map(i => i.id);
    this.output = new Inventory(Math.max(res.length, 0)); this.output.filters = res.map(i => i.id);
    // assign fluid boxes
    for (const b of this.fluidBoxes) { b.filter = null; (b as any).wantFluid = null; b.amount = 0; b.fluid = null; }
    if (r) {
      const fin = r.ing.filter(i => i.fluid), fout = r.res.filter(i => i.fluid);
      const inBoxes = this.fluidBoxes.filter(b => b.kind === 'input'), outBoxes = this.fluidBoxes.filter(b => b.kind === 'output');
      fin.forEach((f, i) => { if (inBoxes[i]) { inBoxes[i].filter = f.id; (inBoxes[i] as any).wantFluid = f.id; } });
      fout.forEach((f, i) => { if (outBoxes[i]) outBoxes[i].filter = f.id; });
    }
    if (this.fluidBoxes.length) G.game.fluids.dirty = true;
  }
  inventories() { return [this.input, this.output, ...super.inventories()]; }
  craftsPerSec() { return this.recipe ? this.speed / this.recipe.time : 0; }
  ingredientLimit(n: number) {
    const c = this.craftsPerSec();
    return Math.max(n * 2, n * (Math.ceil(1.166 * c) + 1));
  }
  wants(id: string): number {
    if (!this.recipe) return 0;
    const ing = this.recipe.ing.find(i => i.id === id && !i.fluid);
    if (!ing) return 0;
    return Math.max(0, this.ingredientLimit(ing.n) - this.input.count(id));
  }
  insertItem(id: string, n: number, src = 'inserter'): number {
    if (this.burner && this.burner.isFuel(id) && (!this.recipe || !this.recipe.ing.some(i => i.id === id))) return this.burner.fuel.insert(id, n);
    if (!this.recipe) return 0;
    if (!this.recipe.ing.some(i => i.id === id)) return 0;
    return this.input.insert(id, n);
  }
  takeOutput(max: number, filter?: (id: string) => boolean): Stack | null {
    return this.output.takeAny(max, filter);
  }
  hasOutput(filter?: (id: string) => boolean) { return this.output.firstItem(filter) !== null; }
  private hasIngredients(): boolean {
    const r = this.recipe!;
    for (const i of r.ing) {
      if (i.fluid) {
        const b = this.fluidBoxes.find(b => b.filter === i.id && b.kind === 'input');
        if (!b || b.amount < i.n - 1e-6) return false;
      } else if (this.input.count(i.id) < i.n) return false;
    }
    return true;
  }
  private outputBlocked(): boolean {
    const r = this.recipe!;
    for (const p of r.res) {
      if (p.fluid) {
        const b = this.fluidBoxes.find(b => b.filter === p.id && b.kind === 'output');
        if (!b || b.amount + p.n > b.volume + 1e-6) return true;
      } else {
        const have = this.output.count(p.id);
        const lim = Math.max(ITEMS[p.id].stack, Math.ceil(p.n * (1 + this.effects().prod)) * 2);
        if (have + p.n > lim) return true;
      }
    }
    return false;
  }
  update() {
    const r = this.recipe;
    if (!r) { this.working = false; this.status = 'no-recipe'; this.energyTick(false); this.warnIcon = 'warn-no-recipe'; return; }
    this.powerWarn();
    if (!this.crafting) {
      if (!this.active) { this.status = 'disabled'; this.working = false; this.energyTick(false); return; }
      if (this.outputBlocked()) { this.status = 'output-full'; this.working = false; this.energyTick(false); return; }
      if (!this.hasIngredients()) { this.status = 'no-ingredients'; this.working = false; this.energyTick(false); return; }
      this.consumeIngredients();
      this.crafting = true; this.progress = 0;
    }
    const f = this.energyTick(true);
    if (f <= 0) { this.status = this.burner ? 'no-fuel' : 'no-power'; this.working = false; return; }
    this.working = true; this.status = 'working';
    const dp = this.speed / (r.time * 60) * f;
    this.progress += dp;
    this.bonus += dp * this.effects().prod;
    this.animT += f * this.speed;
    this.pollute(f);
    if (this.progress >= 1) {
      const carry = this.progress - 1;
      this.finish(1);
      this.crafting = false; this.progress = 0;
      if (this.active && !this.outputBlocked() && this.hasIngredients()) { this.consumeIngredients(); this.crafting = true; this.progress = carry; }
    }
    if (this.bonus >= 1) { this.bonus -= 1; this.finish(1, true); }
  }
  private consumeIngredients() {
    const r = this.recipe!;
    for (const i of r.ing) {
      if (i.fluid) { const b = this.fluidBoxes.find(b => b.filter === i.id && b.kind === 'input')!; b.amount -= i.n; G.game.stats.consume(i.id, i.n); }
      else { this.input.remove(i.id, i.n); G.game.stats.consume(i.id, i.n); }
    }
  }
  protected finish(times: number, isBonus = false) {
    const r = this.recipe!;
    for (const p of r.res) {
      let n = p.n * times;
      if (p.p !== undefined) { n = Math.random() < p.p ? 1 : 0; }
      if (n <= 0) continue;
      if (p.fluid) {
        const b = this.fluidBoxes.find(b => b.filter === p.id && b.kind === 'output');
        if (b) { b.fluid = p.id; b.temp = 15; b.amount = Math.min(b.volume, b.amount + n); }
      } else this.output.insert(p.id, n);
      G.game.stats.produce(p.id, n);
    }
  }
  draw(r: Renderer, alt: boolean) {
    const a = r.atlas;
    const n = this.name;
    const key = (this.proto.rotatable && ['oil-refinery', 'chemical-plant'].includes(n)) ? `${n}-${this.dir}` : n;
    r.draw('objects', a.get(key), this.x, this.y, WHITE, 0, 1, this.y + this.h / 2 - 0.5);
    r.draw('shadow', a.get(key + '-shadow'), this.x, this.y);
    if (n.startsWith('assembling-machine')) {
      r.draw('objects', a.get(n + '-top'), this.x, this.y - 0.45, WHITE, this.animT * 0.05, 1, this.y + this.h / 2 - 0.49);
    } else if (n === 'centrifuge' && this.working) {
      r.draw('objects', a.get('centrifuge-glow'), this.x, this.y - 0.6, additive(0.4, 1, 0.3, 0.6 + 0.2 * Math.sin(this.animT * 0.1)), 0, 1, this.y + 1.1);
      r.draw('light', a.get('light'), this.x, this.y, additive(0.4, 1, 0.4), 0, 6);
    } else if (n === 'oil-refinery' && this.working) {
      const fl = 0.8 + 0.2 * Math.sin(G.game.renderTime * 11 + this.id);
      r.draw('objects', a.get('flame'), this.x + 1.4, this.y - 3.5, additive(1, 0.7, 0.3, fl), 0, 0.7, this.y + 2.6);
      r.draw('light', a.get('light'), this.x + 1.4, this.y - 2.5, additive(1, 0.6, 0.3), 0, 8);
    } else if (n === 'chemical-plant' && this.working && G.game.tick % 20 === 0) {
      G.game.fx.smoke(this.x + 0.85, this.y - 1.9, 0.6);
    }
    if (alt && this.recipe) {
      r.draw('overlay', a.get('alt-bg'), this.x, this.y, WHITE, 0, Math.min(1, this.w * 0.33));
      r.draw('overlay', a.get('icon:' + (this.recipe.icon ? 'recipe:' + this.recipe.id : this.recipe.main)), this.x, this.y, WHITE, 0, Math.min(0.85, this.w * 0.28));
    }
    if (alt) drawFluidPorts(r, this);
  }
  serialize() {
    return { r: this.recipe?.id, i: this.input.serialize(), o: this.output.serialize(), p: this.progress, c: this.crafting, b: this.bonus, m: this.modules?.serialize(), bu: this.burner?.serialize(), fb: this.fluidBoxes.map(b => [b.fluid, b.amount, b.temp]) };
  }
  load(d: any) {
    if (d.r && RECIPES[d.r]) this.setRecipe(RECIPES[d.r]);
    this.input.load(d.i); this.output.load(d.o);
    this.progress = d.p || 0; this.crafting = !!d.c; this.bonus = d.b || 0;
    if (d.m && this.modules) this.modules.load(d.m);
    if (d.bu && this.burner) this.burner.load(d.bu);
    if (d.fb) d.fb.forEach((x: any, i: number) => { const b = this.fluidBoxes[i]; if (b && x) { b.fluid = x[0]; b.amount = x[1]; b.temp = x[2]; } });
  }
}

export function drawFluidPorts(r: Renderer, e: Entity & { fluidBoxes: FluidBox[] }) {
  const a = r.atlas;
  for (const b of e.fluidBoxes) {
    if (b.kind === 'pass') continue;
    if (!b.conns.length) b.computeConns();
    for (const c of b.conns) {
      const x = c.tx + 0.5 + DIRS[c.dir][0] * 0.5, y = c.ty + 0.5 + DIRS[c.dir][1] * 0.5;
      const rot = (b.kind === 'input' ? c.dir + 2 : c.dir) * Math.PI / 2;
      const col = b.filter ? rgba(0.6, 0.9, 1, 0.9) : rgba(1, 1, 1, 0.6);
      r.draw('overlay', a.get('arrow-small'), x, y, col, rot, 0.45);
      if (b.filter) r.draw('overlay', a.get('icon:fluid:' + b.filter), c.tx + 0.5, c.ty + 0.5, WHITE, 0, 0.35);
    }
  }
}

export class AssemblingMachine extends CraftingMachine { }

// ---------------- Furnace ----------------
export class Furnace extends Machine {
  source = new Inventory(1);
  result = new Inventory(1);
  recipe: RecipeProto | null = null;
  progress = 0; crafting = false; bonus = 0;
  allowsProd() { return true; }
  inventories() { return [this.source, this.result, ...super.inventories()]; }
  wants(id: string): number {
    const rid = SMELT_RECIPE_FOR[id];
    if (!rid) return 0;
    const cur = this.source.firstItem();
    if (cur && cur !== id) return 0;
    const res = this.result.firstItem();
    if (res && res !== RECIPES[rid].res[0].id) return 0;
    const n = RECIPES[rid].ing[0].n;
    const lim = Math.max(n * 2, n * (Math.ceil(1.166 * this.speed / RECIPES[rid].time) + 1));
    return Math.max(0, lim - this.source.count(id));
  }
  insertItem(id: string, n: number, src = 'inserter'): number {
    if (this.burner && this.burner.isFuel(id) && !(SMELT_RECIPE_FOR[id] && src === 'player' && false)) {
      if (!SMELT_RECIPE_FOR[id]) return this.burner.fuel.insert(id, n);
      // e.g. wood is fuel only; coal is fuel only. (No smeltable fuels in base game.)
      return this.burner.fuel.insert(id, n);
    }
    if (!SMELT_RECIPE_FOR[id]) return 0;
    const cur = this.source.firstItem();
    if (cur && cur !== id) return 0;
    return this.source.insert(id, n);
  }
  takeOutput(max: number, filter?: (id: string) => boolean) { return this.result.takeAny(max, filter); }
  hasOutput(filter?: (id: string) => boolean) { return this.result.firstItem(filter) !== null; }
  update() {
    this.powerWarn();
    if (!this.crafting) {
      const src = this.source.firstItem();
      if (!src) { this.status = 'no-ingredients'; this.working = false; this.energyTick(false); return; }
      const r = RECIPES[SMELT_RECIPE_FOR[src]];
      if (this.recipe !== r) { this.recipe = r; this.effVer = -1; }
      if (this.source.count(src) < r.ing[0].n) { this.status = 'no-ingredients'; this.working = false; this.energyTick(false); return; }
      const out = r.res[0];
      if (!this.result.canInsert(out.id, out.n)) { this.status = 'output-full'; this.working = false; this.energyTick(false); return; }
      if (this.burner && !this.burner.hasFuel) { this.status = 'no-fuel'; this.working = false; return; }
      this.source.remove(src, r.ing[0].n);
      G.game.stats.consume(src, r.ing[0].n);
      this.crafting = true; this.progress = 0;
    }
    const r = this.recipe!;
    const f = this.energyTick(true);
    if (f <= 0) { this.working = false; this.status = this.burner ? 'no-fuel' : 'no-power'; return; }
    this.working = true; this.status = 'working';
    const dp = this.speed / (r.time * 60) * f;
    this.progress += dp;
    this.bonus += dp * this.effects().prod;
    this.pollute(f);
    if (this.progress >= 1) {
      this.progress = 0; this.crafting = false;
      const out = r.res[0];
      this.result.insert(out.id, out.n);
      G.game.stats.produce(out.id, out.n);
    }
    if (this.bonus >= 1) { this.bonus -= 1; const out = r.res[0]; this.result.insert(out.id, out.n); G.game.stats.produce(out.id, out.n); }
  }
  draw(r: Renderer, alt: boolean) {
    const a = r.atlas;
    r.draw('objects', a.get(this.name), this.x, this.y, WHITE, 0, 1, this.y + this.h / 2 - 0.4);
    r.draw('shadow', a.get(this.name + '-shadow'), this.x, this.y);
    if (this.working) {
      const fl = 0.75 + 0.25 * Math.sin(G.game.renderTime * 12 + this.id * 1.7);
      const oy = this.name === 'electric-furnace' ? 0.85 : 0.55;
      r.draw('objects', a.get('fire-glow'), this.x, this.y + oy, additive(1, 0.55, 0.2, fl), 0, this.w * 0.35, this.y + this.h / 2 - 0.39);
      r.draw('light', a.get('light'), this.x, this.y + oy, additive(1, 0.55, 0.25), 0, 4 + this.w);
      if (this.name === 'stone-furnace' && G.game.tick % 14 === (this.id % 14)) G.game.fx.smoke(this.x, this.y - 0.9, 0.5);
    }
    if (alt && this.recipe) {
      r.draw('overlay', a.get('alt-bg'), this.x, this.y, WHITE, 0, 0.6);
      r.draw('overlay', a.get('icon:' + this.recipe.res[0].id), this.x, this.y, WHITE, 0, 0.5);
    }
  }
  serialize() { return { s: this.source.serialize(), r: this.result.serialize(), rc: this.recipe?.id, p: this.progress, c: this.crafting, b: this.bonus, m: this.modules?.serialize(), bu: this.burner?.serialize() }; }
  load(d: any) {
    this.source.load(d.s); this.result.load(d.r); this.recipe = d.rc ? RECIPES[d.rc] : null; this.progress = d.p || 0; this.crafting = !!d.c; this.bonus = d.b || 0;
    if (d.m && this.modules) this.modules.load(d.m); if (d.bu && this.burner) this.burner.load(d.bu);
  }
}

// ---------------- Lab ----------------
export const LAB_INPUTS = ['automation-science-pack', 'logistic-science-pack', 'military-science-pack', 'chemical-science-pack', 'production-science-pack', 'utility-science-pack', 'space-science-pack'];
export class Lab extends Machine {
  packs = new Inventory(7);
  unitProgress = 0;
  inUnit = false;
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.packs.filters = LAB_INPUTS.slice();
  }
  allowsProd() { return true; }
  inventories() { return [this.packs, ...super.inventories()]; }
  wants(id: string) {
    if (!LAB_INPUTS.includes(id)) return 0;
    const res = G.game.research;
    const t = res.current ? TECHS[res.current] : null;
    if (t && !res.currentCost().packs.includes(id)) return 0;
    return Math.max(0, 2 - this.packs.count(id));
  }
  insertItem(id: string, n: number) { if (!LAB_INPUTS.includes(id)) return 0; return this.packs.insert(id, n); }
  takeOutput(max: number, filter?: (id: string) => boolean) {
    // allow lab chaining: give away packs only if we keep at least 1
    for (const s of this.packs.slots) if (s && s.n > 1 && (!filter || filter(s.id))) { const k = Math.min(max, s.n - 1); s.n -= k; this.packs.changed(); return { id: s.id, n: k }; }
    return null;
  }
  update() {
    this.powerWarn();
    const res = G.game.research;
    const t = res.current;
    if (!t) { this.working = false; this.status = 'no-research'; this.energyTick(false); return; }
    const cost = res.currentCost();
    if (!this.inUnit) {
      for (const p of cost.packs) if (this.packs.count(p) < 1) { this.working = false; this.status = 'missing-packs'; this.energyTick(false); return; }
      for (const p of cost.packs) { this.packs.remove(p, 1); G.game.stats.consume(p, 1); }
      this.inUnit = true; this.unitProgress = 0;
    }
    const f = this.energyTick(true);
    if (f <= 0) { this.working = false; return; }
    this.working = true; this.status = 'working';
    const speed = (this.proto.speed || 1) * (1 + G.game.bonus.labSpeed) * (1 + this.effects().speed);
    const dp = speed / (cost.time * 60) * f;
    this.unitProgress += dp;
    this.animT += f;
    res.addProgress(dp * (1 + this.effects().prod));
    if (this.unitProgress >= 1) { this.inUnit = false; this.unitProgress = 0; }
  }
  draw(r: Renderer, alt: boolean) {
    const a = r.atlas;
    r.draw('objects', a.get('lab'), this.x, this.y, WHITE, 0, 1, this.y + 1);
    r.draw('shadow', a.get('lab-shadow'), this.x, this.y);
    if (this.working) {
      const pulse = 0.6 + 0.4 * Math.sin(this.animT * 0.08);
      r.draw('objects', a.get('lab-glow'), this.x, this.y - 0.4, additive(0.5, 0.8, 1, pulse * 0.8), 0, 1, this.y + 1.01);
      r.draw('light', a.get('light'), this.x, this.y, additive(0.6, 0.85, 1), 0, 6);
    }
  }
  serialize() { return { p: this.packs.serialize(), u: this.unitProgress, i: this.inUnit, m: this.modules?.serialize() }; }
  load(d: any) { this.packs.load(d.p); this.packs.filters = LAB_INPUTS.slice(); this.unitProgress = d.u || 0; this.inUnit = !!d.i; if (d.m && this.modules) this.modules.load(d.m); }
}

// ---------------- Beacon ----------------
export class Beacon extends Machine {
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.modules!.onChange = () => bumpBeacons();
  }
  affects(m: Entity) {
    const s = this.proto.supply!;
    return m !== this && m.x + m.w / 2 > this.x - this.w / 2 - s && m.x - m.w / 2 < this.x + this.w / 2 + s && m.y + m.h / 2 > this.y - this.h / 2 - s && m.y - m.h / 2 < this.y + this.h / 2 + s;
  }
  onPlaced() { super.onPlaced(); bumpBeacons(); }
  onRemoved() { super.onRemoved(); bumpBeacons(); }
  insertItem(id: string, n: number, src = 'inserter') {
    const m = ITEMS[id]?.module;
    if (!m || m.cat === 'productivity' || src === 'inserter') return 0;
    return this.modules!.insert(id, n);
  }
  update() {
    const any = this.modules!.slots.some(s => s);
    const was = this.power > 0;
    this.energyTick(any);
    this.working = any && this.power > 0;
    if (was !== this.power > 0) bumpBeacons();
    this.animT += this.working ? 1 : 0;
    this.powerWarn();
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get('beacon'), this.x, this.y, WHITE, 0, 1, this.y + 1);
    r.draw('shadow', a.get('beacon-shadow'), this.x, this.y);
    r.draw('objects', a.get('beacon-top'), this.x, this.y - 0.6, WHITE, 0, 1, this.y + 1.01);
    if (this.working) r.draw('light', a.get('light'), this.x, this.y - 1, additive(0.6, 0.4, 1), 0, 3);
  }
  serialize() { return { m: this.modules!.serialize() }; }
  load(d: any) { this.modules!.load(d.m); }
}

// ---------------- Rocket silo ----------------
export class RocketSilo extends CraftingMachine {
  parts = 0;
  rocketReady = false;
  launchT = -1;
  autoLaunch = false;
  payload = new Inventory(1);
  doorOpen = 0;
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.setRecipe(RECIPES['rocket-part']);
  }
  get fixedRecipe() { return true; }
  inventories() { return [...super.inventories(), this.payload]; }
  wants(id: string) {
    if (id === 'satellite') return this.payload.isEmpty() ? 1 : 0;
    if (this.rocketReady && this.parts >= 100) return 0;
    return super.wants(id);
  }
  insertItem(id: string, n: number, src = 'inserter') {
    if (id === 'satellite' || id === 'raw-fish') return this.payload.insert(id, Math.min(n, 1));
    return super.insertItem(id, n, src);
  }
  protected finish(times: number) {
    this.parts += times;
    G.game.stats.produce('rocket-part', times);
    if (this.parts >= 100) { this.parts = 100; this.rocketReady = true; }
  }
  update() {
    if (this.launchT >= 0) {
      this.launchT++;
      this.energyTick(false);
      if (this.launchT === 60 * 10) G.game.rocketLaunched(this);
      if (this.launchT > 60 * 14) { this.launchT = -1; this.rocketReady = false; this.parts = 0; }
      return;
    }
    if (this.rocketReady) {
      this.doorOpen = Math.min(1, this.doorOpen + 0.01);
      this.energyTick(false);
      this.status = this.payload.isEmpty() ? 'waiting-payload' : 'ready';
      if (this.autoLaunch && !this.payload.isEmpty()) this.launch();
      return;
    }
    this.doorOpen = Math.max(0, this.doorOpen - 0.01);
    super.update();
  }
  launch(): string | null {
    if (!this.rocketReady || this.launchT >= 0) return 'Rocket not ready';
    if (!G.game.world.entitiesIn(-1e6, -1e6, 1e6, 1e6, e => e.type === 'cargo-landing-pad', 0).length && !G.game.findEntityOfType('cargo-landing-pad')) return 'A cargo landing pad is required';
    this.launchT = 0;
    return null;
  }
  draw(r: Renderer, alt: boolean) {
    const a = r.atlas;
    r.draw('ground2', a.get('rocket-silo'), this.x, this.y, WHITE);
    r.draw('shadow', a.get('rocket-silo-shadow'), this.x, this.y);
    const open = this.launchT >= 0 ? 1 : this.doorOpen;
    const cy = this.y - 0.3;
    if (open > 0 || this.rocketReady) {
      const rise = this.launchT >= 0 ? Math.max(0, (this.launchT - 120) / 60) ** 2 * 0.6 : 0;
      if (this.rocketReady || this.launchT >= 0) {
        r.draw('objects', a.get('rocket'), this.x, cy - 1.8 - rise, WHITE, 0, 1, this.y + 4);
        if (this.launchT > 100) {
          for (let i = 0; i < 3; i++) r.draw('air', a.get('flame'), this.x, cy + 0.9 - rise + i * 0.5, additive(1, 0.7, 0.3, 1), 0, 1.5 - i * 0.3, 1e6);
          r.draw('light', a.get('light'), this.x, cy - rise, additive(1, 0.7, 0.4), 0, 20);
          if (G.game.tick % 2 === 0) G.game.fx.smoke(this.x + (Math.random() - 0.5) * 3, cy + 2, 2);
        }
      }
    }
    for (const side of [0, 1]) {
      const off = (side ? 1 : -1) * (1.4 + open * 2.6);
      r.draw('ground2', a.get(`silo-door-${side}`), this.x + off, cy, WHITE);
    }
  }
  serialize() { return { ...super.serialize(), pa: this.parts, rr: this.rocketReady, al: this.autoLaunch, pl: this.payload.serialize() }; }
  load(d: any) { super.load(d); this.setRecipe(RECIPES['rocket-part']); this.parts = d.pa || 0; this.rocketReady = !!d.rr; this.autoLaunch = !!d.al; this.payload.load(d.pl); }
}

registerEntity(['assembling-machine'], CraftingMachine);
registerEntity(['furnace'], Furnace);
registerEntity(['lab'], Lab);
registerEntity(['beacon'], Beacon);
registerEntity(['rocket-silo'], RocketSilo);
