// Electric networks: poles, generators, boilers, solar panels, accumulators.
import { Entity, PHASE, registerEntity, Burner } from './entity';
import { FluidBox, FluidOwner } from './fluids';
import { G, Dir, DIRS } from '../core';
import { ITEMS } from '../data/protos';
import type { Renderer } from '../engine/renderer';
import { WHITE, rgba, additive } from '../engine/renderer';
import { POLE_WIRE } from '../art/sprites-logistics';

export class ElectricPole extends Entity {
  wiresTo = new Set<ElectricPole>();
  net: ElectricNetwork | null = null;
  get supply() { return this.proto.supply!; }
  get reach() { return this.proto.reach!; }
  onPlaced() { G.game.power.addPole(this); }
  onRemoved() { G.game.power.removePole(this); }
  wirePoint(color: 'copper' | 'red' | 'green'): [number, number] {
    const p = POLE_WIRE[this.name][color];
    return [this.x + p[0], this.y + p[1]];
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get(this.name), this.x, this.y, WHITE, 0, 1, this.y + this.h / 2 - 0.1);
    r.draw('shadow', a.get(this.name + '-shadow'), this.x, this.y);
  }
  serialize() { return { w: [...this.wiresTo].map(p => p.id) }; }
  load(d: any) { (this as any)._wireIds = d.w || []; }
}

export class ElectricNetwork {
  id: number;
  poles: ElectricPole[] = [];
  consumers: Entity[] = [];
  generators: Generator[] = [];
  solars: SolarPanel[] = [];
  accumulators: Accumulator[] = [];
  satisfaction = 1;
  lastDemand = 0; lastSupply = 0; lastProdCap = 0;
  // statistics (J per tick, rolling)
  histProd: number[] = []; histCons: number[] = [];
  constructor(id: number) { this.id = id; }
}

export class ElectricSystem {
  poles = new Set<ElectricPole>();
  electric = new Set<Entity>();
  networks: ElectricNetwork[] = [];
  dirty = true;
  nextNet = 1;

  addPole(p: ElectricPole) {
    this.poles.add(p);
    if ((p as any)._wireIds) return; // loading: wires restored later
    // auto-connect: nearest pole in reach, plus poles from other networks
    const cands: [number, ElectricPole][] = [];
    for (const o of this.poles) {
      if (o === p) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d <= Math.min(p.reach, o.reach) + 1e-6) cands.push([d, o]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const connectedNets = new Set<ElectricNetwork | null>();
    let count = 0;
    for (const [, o] of cands) {
      if (count >= 5) break;
      if (count === 0 || !connectedNets.has(o.net)) {
        p.wiresTo.add(o); o.wiresTo.add(p); connectedNets.add(o.net); count++;
      }
    }
    this.dirty = true;
  }
  removePole(p: ElectricPole) {
    this.poles.delete(p);
    for (const o of p.wiresTo) o.wiresTo.delete(p);
    p.wiresTo.clear();
    this.dirty = true;
  }
  connect(a: ElectricPole, b: ElectricPole) { a.wiresTo.add(b); b.wiresTo.add(a); this.dirty = true; }
  disconnect(a: ElectricPole, b: ElectricPole) { a.wiresTo.delete(b); b.wiresTo.delete(a); this.dirty = true; }
  addElectric(e: Entity) { this.electric.add(e); this.dirty = true; }
  removeElectric(e: Entity) { this.electric.delete(e); e.elecNet = null; this.dirty = true; }

  restoreWires() {
    const g = G.game;
    for (const p of this.poles) {
      const ids: number[] = (p as any)._wireIds;
      if (!ids) continue;
      for (const id of ids) { const o = g.world.entities.get(id); if (o instanceof ElectricPole) { p.wiresTo.add(o); o.wiresTo.add(p); } }
      delete (p as any)._wireIds;
    }
    this.dirty = true;
  }

  rebuild() {
    this.dirty = false;
    const old = this.networks;
    this.networks = [];
    for (const p of this.poles) p.net = null;
    for (const p of this.poles) {
      if (p.net) continue;
      const net = new ElectricNetwork(this.nextNet++);
      const stack = [p]; p.net = net;
      while (stack.length) {
        const q = stack.pop()!;
        net.poles.push(q);
        for (const o of q.wiresTo) if (!o.net) { o.net = net; stack.push(o); }
      }
      // keep stats history from an old network sharing a pole
      const prev = old.find(n => n.poles.includes(p));
      if (prev) { net.histProd = prev.histProd; net.histCons = prev.histCons; }
      this.networks.push(net);
    }
    for (const e of this.electric) e.elecNet = null;
    const world = G.game.world;
    for (const p of this.poles) {
      const s = p.supply;
      const ents = world.entitiesIn(p.x - s, p.y - s, p.x + s, p.y + s, e => this.electric.has(e), 10);
      for (const e of ents) {
        if (e.elecNet) continue;
        e.elecNet = p.net;
      }
    }
    for (const e of this.electric) {
      const n: ElectricNetwork | null = e.elecNet;
      if (!n) { e.power = 0; continue; }
      if (e instanceof Generator) n.generators.push(e);
      else if (e instanceof SolarPanel) n.solars.push(e);
      else if (e instanceof Accumulator) n.accumulators.push(e);
      else n.consumers.push(e);
    }
  }

  tick() {
    if (this.dirty) this.rebuild();
    const g = G.game;
    const daylight = g.daylight;
    for (const net of this.networks) {
      let demand = 0;
      for (const c of net.consumers) demand += c.demand;
      let solarCap = 0;
      for (const s of net.solars) solarCap += s.capacity(daylight);
      let genCap = 0;
      for (const gn of net.generators) genCap += gn.capacity();
      let accDis = 0, accChg = 0;
      for (const a of net.accumulators) { accDis += Math.min(a.maxFlow, a.stored); accChg += Math.min(a.maxFlow, a.cap - a.stored); }
      const supplyAll = solarCap + genCap + accDis;
      const used = Math.min(demand, supplyAll);
      net.satisfaction = demand > 0 ? used / demand : 1;
      // allocate
      let rem = used;
      const fromSolar = Math.min(rem, solarCap); rem -= fromSolar;
      const fromGen = Math.min(rem, genCap); rem -= fromGen;
      const fromAcc = Math.min(rem, accDis); rem -= fromAcc;
      // surplus charges accumulators
      let charge = 0;
      if (accChg > 0) {
        const surplus = (solarCap - fromSolar) + (genCap - fromGen);
        charge = Math.min(surplus, accChg);
      }
      const genLoad = genCap > 0 ? Math.min(1, (fromGen + Math.max(0, charge - (solarCap - fromSolar))) / genCap) : 0;
      for (const gn of net.generators) gn.produce(genLoad);
      if (accDis > 0 && fromAcc > 0) { const f = fromAcc / accDis; for (const a of net.accumulators) a.stored -= Math.min(a.maxFlow, a.stored) * f; }
      if (charge > 0 && accChg > 0) { const f = charge / accChg; for (const a of net.accumulators) a.stored += Math.min(a.maxFlow, a.cap - a.stored) * f; }
      for (const c of net.consumers) c.power = net.satisfaction;
      net.lastDemand = demand; net.lastSupply = used; net.lastProdCap = supplyAll;
      // stats every tick summed per second
      const prodNow = fromSolar + fromGen + fromAcc + charge * 0;
      if (g.tick % 60 === 0) {
        net.histProd.push((net as any)._accP || 0); net.histCons.push((net as any)._accC || 0);
        if (net.histProd.length > 600) { net.histProd.shift(); net.histCons.shift(); }
        (net as any)._accP = 0; (net as any)._accC = 0;
      }
      (net as any)._accP = ((net as any)._accP || 0) + prodNow * 60 / 60;
      (net as any)._accC = ((net as any)._accC || 0) + used * 60 / 60;
      // power usage statistics per entity type
      for (const c of net.consumers) if (c.demand > 0) g.stats.powerUse(c.name, c.demand * net.satisfaction);
      for (const gn of net.generators) g.stats.powerProd(gn.name, gn.lastOut);
      for (const s of net.solars) g.stats.powerProd(s.name, s.capacity(daylight) * (solarCap > 0 ? fromSolar / solarCap : 0));
    }
    // reset demands for next tick
    for (const e of this.electric) e.demand = 0;
  }
  networkAt(x: number, y: number): ElectricNetwork | null {
    for (const p of this.poles) {
      const s = p.supply;
      if (Math.abs(x - p.x) <= s && Math.abs(y - p.y) <= s) return p.net;
    }
    return null;
  }
}

// Steam engine / turbine
export class Generator extends Entity implements FluidOwner {
  fluidBoxes: FluidBox[];
  lastOut = 0;
  anim = 0;
  get phase() { return PHASE.NONE; }
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.fluidBoxes = this.proto.fluidBoxes!.map((fb, i) => new FluidBox(this, fb, i));
  }
  onPlaced() { G.game.fluids.add(this); G.game.power.addElectric(this); }
  onRemoved() { G.game.fluids.remove(this); G.game.power.removeElectric(this); }
  private energyPerUnit(): number {
    const s = this.fluidBoxes[0].segment;
    if (!s || s.fluid !== 'steam') return 0;
    return (Math.min(s.temp, this.proto.maxTemp!) - 15) * 200;
  }
  capacity(): number {
    const s = this.fluidBoxes[0].segment;
    if (!s || s.fluid !== 'steam' || s.amount <= 0) return 0;
    const epu = this.energyPerUnit();
    const maxUnits = this.proto.fluidUse!;
    return Math.min(this.proto.power! / 60, Math.min(maxUnits, s.amount) * epu);
  }
  produce(load: number) {
    const cap = this.capacity();
    const out = cap * load;
    this.lastOut = out;
    if (out <= 0) return;
    const epu = this.energyPerUnit();
    if (epu > 0) { const units = out / epu; this.fluidBoxes[0].segment!.take(units); G.game.stats.consume('steam', units); }
    this.anim += load;
  }
  draw(r: Renderer) {
    const a = r.atlas;
    const v = (this.dir & 1) === 0 ? 'v' : 'h';
    r.draw('objects', a.get(`${this.name}-${v}`), this.x, this.y, WHITE, 0, 1, this.y);
    r.draw('shadow', a.get(`${this.name}-${v}-shadow`), this.x, this.y);
    if (this.name === 'steam-engine') {
      const off = v === 'v' ? [0, 1.0] : [1.0, -0.3];
      r.draw('objects', a.get('flywheel'), this.x + off[0], this.y + off[1] - 0.35, WHITE, this.anim * 0.12, 0.9, this.y + 0.01);
    }
  }
  description() { return [`Output: ${(this.lastOut * 60 / 1000).toFixed(1)} kW`]; }
}

export class SolarPanel extends Entity {
  capacity(daylight: number) { return this.proto.power! / 60 * daylight; }
  onPlaced() { G.game.power.addElectric(this); }
  onRemoved() { G.game.power.removeElectric(this); }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('ground2', a.get('solar-panel'), this.x, this.y, WHITE);
    r.draw('shadow', a.get('solar-panel-shadow'), this.x, this.y);
  }
}

export class Accumulator extends Entity {
  stored = 0;
  get cap() { return this.proto.capacity!; }
  get maxFlow() { return this.proto.power! / 60; }
  onPlaced() { G.game.power.addElectric(this); }
  onRemoved() { G.game.power.removeElectric(this); }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get('accumulator'), this.x, this.y, WHITE, 0, 1, this.y);
    r.draw('shadow', a.get('accumulator-shadow'), this.x, this.y);
    const f = this.stored / this.cap;
    if (f > 0.02) r.draw('objects', a.get('accumulator-glow'), this.x, this.y - 0.3, additive(0.4 * f, 0.6 * f, 1 * f, 0.5), 0, 0.6, this.y + 0.01);
  }
  serialize() { return { s: this.stored }; }
  load(d: any) { this.stored = d.s || 0; }
  description() { return [`Charge: ${(this.stored / 1e6).toFixed(2)} / ${(this.cap / 1e6).toFixed(1)} MJ`]; }
}

export class Boiler extends Entity implements FluidOwner {
  fluidBoxes: FluidBox[];
  burner = new Burner(1);
  working = false;
  get phase() { return PHASE.MACHINE; }
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.fluidBoxes = this.proto.fluidBoxes!.map((fb, i) => new FluidBox(this, fb, i));
  }
  onPlaced() { G.game.fluids.add(this); }
  onRemoved() { G.game.fluids.remove(this); }
  inventories() { return [this.burner.fuel]; }
  wantsFuel(id: string) { return this.burner.wantsFuel(id); }
  insertItem(id: string, n: number) { return this.burner.isFuel(id) ? this.burner.fuel.insert(id, n) : 0; }
  takeOutput(max: number, filter?: (id: string) => boolean) { return null; }
  update() {
    const water = this.fluidBoxes[0].segment;
    const steam = this.fluidBoxes[1];
    this.working = false;
    if (!water || water.fluid !== 'water' || water.amount <= 0) { this.status = 'no-water'; return; }
    // per tick: 1 water -> 1 steam at 165C, needs 30kJ per unit; max 1 unit/tick (60/s)
    const room = steam.space;
    if (room <= 0) { this.status = 'output-full'; return; }
    const units = Math.min(1, water.amount, room);
    const need = units * 30000;
    const got = this.burner.consume(need);
    if (got <= 0) { this.status = 'no-fuel'; this.warnIcon = 'warn-no-fuel'; return; }
    this.warnIcon = null;
    const u = units * got;
    water.take(u);
    steam.fluid = 'steam'; steam.temp = 165; steam.amount += u;
    G.game.stats.produce('steam', u); G.game.stats.consume('water', u);
    G.game.pollute(this.x, this.y, this.proto.pollution! / 3600 * got);
    this.working = true; this.status = 'working';
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get(`boiler-${this.dir}`), this.x, this.y, WHITE, 0, 1, this.y);
    r.draw('shadow', a.get(`boiler-${this.dir}-shadow`), this.x, this.y);
    if (this.working) {
      const fb = [[0, 0.65], [-1.15, 0.2], [0, -0.35], [1.15, 0.2]][this.dir];
      const fl = 0.75 + 0.25 * Math.sin(G.game.renderTime * 13 + this.id);
      r.draw('objects', a.get('fire-glow'), this.x + fb[0], this.y + fb[1], additive(1, 0.6, 0.25, fl), 0, 0.5, this.y + 0.02);
      r.draw('light', a.get('light'), this.x + fb[0], this.y + fb[1], additive(1, 0.6, 0.3, 1), 0, 4);
      if (G.game.tick % 9 === 0) G.game.fx.smoke(this.x + ((this.dir & 1) === 0 ? 0.7 : 0.3), this.y - 1.6, 1);
    }
  }
  serialize() { return { b: this.burner.serialize() }; }
  load(d: any) { this.burner.load(d.b); }
}

registerEntity(['electric-pole'], ElectricPole);
registerEntity(['generator'], Generator);
registerEntity(['solar-panel'], SolarPanel);
registerEntity(['accumulator'], Accumulator);
registerEntity(['boiler'], Boiler);
