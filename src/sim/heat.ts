// Heat network: nuclear reactors, heat pipes and heat exchangers exchange thermal energy through
// aligned heat connections (Factorio rules: 1 MJ/°C buffers, 500°C minimum working temperature,
// +100% reactor neighbour bonus, reactors burn fuel continuously).
import { Entity, PHASE, Burner, registerEntity } from './entity';
import { G, Dir, DIRS, rotOffset, tileKey } from '../core';
import { FluidBox } from './fluids';
import type { Renderer } from '../engine/renderer';
import { WHITE, rgba, additive } from '../engine/renderer';
import { h } from '../util/dom';

export interface HeatOwner extends Entity { temp: number; heatCap: number; maxTemp: number; heatConns(): [number, number, number][]; }

export class HeatSystem {
  owners = new Set<HeatOwner>();
  edges: [HeatOwner, HeatOwner][] = [];
  dirty = true;
  add(e: HeatOwner) { this.owners.add(e); this.dirty = true; this.refreshPipes(e); }
  remove(e: HeatOwner) { this.owners.delete(e); this.dirty = true; this.refreshPipes(e); }
  refreshPipes(e: Entity) {
    const w = G.game.world;
    for (let y = e.ty - 1; y <= e.ty + e.h; y++) for (let x = e.tx - 1; x <= e.tx + e.w; x++) {
      const o = w.occAt(x, y);
      if (o instanceof HeatPipe) o.maskDirty = true;
    }
  }
  rebuild() {
    this.dirty = false;
    const w = G.game.world;
    // map of incoming connection points: tile key of the *neighbour* tile + dir
    const edges: [HeatOwner, HeatOwner][] = [];
    const seen = new Set<string>();
    for (const a of this.owners) {
      (a as any)._links = 0;
      for (const [tx, ty, d] of a.heatConns()) {
        const nx = tx + DIRS[d][0], ny = ty + DIRS[d][1];
        const b = w.occAt(nx, ny) as any as HeatOwner;
        if (!b || b === a || !this.owners.has(b)) continue;
        // b must have a connection on (nx,ny) pointing back
        const back = (d + 2) & 3;
        if (!b.heatConns().some(([bx, by, bd]) => bx === nx && by === ny && bd === back)) continue;
        (a as any)._links |= 1 << d;
        const k = a.id < b.id ? a.id + ':' + b.id + ':' + tx + ',' + ty : b.id + ':' + a.id + ':' + nx + ',' + ny;
        if (seen.has(k)) continue;
        seen.add(k);
        edges.push(a.id < b.id ? [a, b] : [b, a]);
      }
    }
    this.edges = edges;
    for (const o of this.owners) if (o instanceof Reactor) o.computeNeighbours();
  }
  tick() {
    if (this.dirty) this.rebuild();
    // explicit diffusion; per connection conductance limited for stability
    for (const [a, b] of this.edges) {
      const dT = a.temp - b.temp;
      if (Math.abs(dT) < 0.001) continue;
      const cMin = Math.min(a.heatCap, b.heatCap);
      const e = dT * cMin * 0.24;
      a.temp -= e / a.heatCap; b.temp += e / b.heatCap;
    }
    for (const o of this.owners) if (o.temp > o.maxTemp) o.temp = o.maxTemp;
  }
}

const AMBIENT = 15;

// ---------------- Heat pipe ----------------
export class HeatPipe extends Entity implements HeatOwner {
  temp = AMBIENT; heatCap = 1e6; maxTemp = 1000;
  mask = 0; maskDirty = true;
  onPlaced() { G.game.heat.add(this); }
  onRemoved() { G.game.heat.remove(this); }
  heatConns(): [number, number, number][] { const x = Math.floor(this.x), y = Math.floor(this.y); return [[x, y, 0], [x, y, 1], [x, y, 2], [x, y, 3]]; }
  draw(r: Renderer) {
    const a = r.atlas;
    this.mask = (this as any)._links || 0;
    r.draw('objects', a.get(`heat-pipe-${this.mask}`), this.x, this.y, WHITE, 0, 1, this.y - 0.4);
    const glow = heatGlow(this.temp);
    if (glow > 0) {
      r.draw('objects', a.get(`heat-pipe-${this.mask}`), this.x, this.y, additive(1, 0.35, 0.1, glow * 0.8), 0, 1, this.y - 0.39);
      r.draw('light', a.get('light'), this.x, this.y, additive(1, 0.4, 0.15, glow * 0.6), 0, 2.2);
    }
  }
  description() { return [`Temperature: ${this.temp.toFixed(1)}°C`]; }
  serialize() { return { t: this.temp }; }
  load(d: any) { this.temp = d.t ?? AMBIENT; }
  buildGUI(win: any, P: HTMLElement) { tempBar(win, P, this); }
}

function heatGlow(t: number) { return t <= 300 ? 0 : Math.min(1, (t - 300) / 700); }
function tempBar(win: any, P: HTMLElement, e: HeatOwner) {
  const row = h('div', 'row', P);
  h('div', 'label', row, 'Temperature');
  win.progress(row, () => e.temp / e.maxTemp, () => `${e.temp.toFixed(1)} / ${e.maxTemp} °C`, 'red').style.flex = '1';
}

// ---------------- Nuclear reactor ----------------
export class Reactor extends Entity implements HeatOwner {
  temp = AMBIENT; heatCap = 10e6; maxTemp = 1000;
  burner = new Burner(1, 1, 'nuclear');
  neighbours = 0;
  working = false;
  get phase() { return PHASE.MACHINE; }
  onPlaced() { G.game.heat.add(this); }
  onRemoved() { G.game.heat.remove(this); }
  inventories() { return [this.burner.fuel, this.burner.burnt!]; }
  wantsFuel(id: string) { return this.burner.isFuel(id) ? Math.max(0, 1 - this.burner.fuel.count(id)) : 0; }
  insertItem(id: string, n: number, src = 'inserter') { return this.burner.isFuel(id) ? this.burner.fuel.insert(id, src === 'inserter' ? Math.min(n, this.wantsFuel(id)) : n) : 0; }
  takeOutput(max: number, filter?: (id: string) => boolean) { return this.burner.burnt!.takeAny(max, filter); }
  hasOutput(filter?: (id: string) => boolean) { return this.burner.burnt!.firstItem(filter) !== null; }
  heatConns(): [number, number, number][] {
    const out: [number, number, number][] = [];
    const x0 = this.tx, y0 = this.ty;
    for (const o of [0, 2, 4]) {
      out.push([x0 + o, y0, 0]); out.push([x0 + 4, y0 + o, 1]); out.push([x0 + o, y0 + 4, 2]); out.push([x0, y0 + o, 3]);
    }
    return out;
  }
  computeNeighbours() {
    const w = G.game.world;
    const seen = new Set<Entity>();
    for (const [tx, ty, d] of this.heatConns()) {
      const o = w.occAt(tx + DIRS[d][0], ty + DIRS[d][1]);
      if (o instanceof Reactor && o !== this && Math.abs(o.x - this.x) + Math.abs(o.y - this.y) === 5) seen.add(o);
    }
    (this as any)._nb = [...seen];
  }
  update() {
    const nb: Reactor[] = (this as any)._nb || [];
    // fuel burns continuously while there is any
    const burning = this.burner.energy > 0 || this.burner.fuel.firstItem() !== null;
    this.neighbours = nb.filter(r => r.working).length;
    const power = 40e6 * (1 + this.neighbours);
    const got = burning ? this.burner.consume(40e6 / 60) : 0;
    this.working = got > 0;
    if (this.working) this.temp = Math.min(this.maxTemp, this.temp + power / 60 * got / this.heatCap);
    this.status = this.working ? 'working' : 'no-fuel';
    this.warnIcon = this.working ? null : 'warn-no-fuel';
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get('nuclear-reactor'), this.x, this.y, WHITE, 0, 1, this.y + 1);
    r.draw('shadow', a.get('nuclear-reactor-shadow'), this.x, this.y);
    if (this.working) {
      const k = 0.7 + 0.3 * Math.sin(G.game.renderTime * 2 + this.id);
      r.draw('objects', a.get('reactor-glow'), this.x, this.y - 0.4, additive(0.5, 1, 0.4, k), 0, 1, this.y + 1.01);
      r.draw('light', a.get('light'), this.x, this.y, additive(0.4, 1, 0.4, 0.9), 0, 16);
    }
    const glow = heatGlow(this.temp);
    if (glow > 0) for (const [tx, ty] of this.heatConns()) r.drawRect('objects', a.get('white'), tx + 0.5, ty + 0.5, 0.4, 0.4, additive(1, 0.35, 0.1, glow * 0.7), 0, this.y + 1.02);
  }
  description() { return [`Temperature: ${this.temp.toFixed(1)}°C`, `Neighbour bonus: ${this.neighbours * 100}%`]; }
  serialize() { return { t: this.temp, b: this.burner.serialize() }; }
  load(d: any) { this.temp = d.t ?? AMBIENT; this.burner.load(d.b); }
  buildGUI(win: any, P: HTMLElement) {
    win.status(P);
    win.burnerRow(P, this.burner);
    tempBar(win, P, this);
    const nb = h('div', 'mini-label', P);
    win.updaters.push(() => nb.textContent = `Neighbour bonus: ${this.neighbours * 100}% · Output ${this.working ? 40 * (1 + this.neighbours) : 0} MW`);
  }
}

// ---------------- Heat exchanger ----------------
export class HeatExchanger extends Entity implements HeatOwner {
  temp = AMBIENT; heatCap = 1e6; maxTemp = 1000;
  fluidBoxes: FluidBox[];
  working = false;
  puff = 0;
  get phase() { return PHASE.MACHINE; }
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.fluidBoxes = this.proto.fluidBoxes!.map((fb, i) => new FluidBox(this, fb, i));
  }
  onPlaced() { G.game.heat.add(this); G.game.fluids.add(this as any); }
  onRemoved() { G.game.heat.remove(this); G.game.fluids.remove(this as any); }
  heatConns(): [number, number, number][] {
    const [rx, ry] = rotOffset(0, 0.5, this.dir);
    return [[Math.floor(this.x + rx), Math.floor(this.y + ry), (2 + this.dir) & 3]];
  }
  update() {
    const water = this.fluidBoxes[0].segment;
    const steam = this.fluidBoxes[1];
    this.working = false;
    if (this.temp < 500) { this.status = 'low-temperature'; return; }
    if (!water || water.fluid !== 'water' || water.amount <= 0) { this.status = 'no-water'; return; }
    const epu = (500 - 15) * 200;
    const avail = Math.min(10e6 / 60, (this.temp - 500) * this.heatCap);
    const units = Math.min(avail / epu, water.amount, steam.space);
    if (units <= 0) { this.status = steam.space <= 0 ? 'output-full' : 'low-temperature'; return; }
    water.take(units);
    steam.fluid = 'steam'; steam.temp = 500; steam.amount += units;
    this.temp -= units * epu / this.heatCap;
    G.game.stats.produce('steam', units); G.game.stats.consume('water', units);
    this.working = true; this.status = 'working';
    if (++this.puff % 20 === 0) { const so = rotOffset(0, -1.2, this.dir); G.game.fx?.smoke(this.x + so[0], this.y + so[1] - 0.6, 0.7); }
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get(`heat-exchanger-${this.dir}`), this.x, this.y, WHITE, 0, 1, this.y);
    r.draw('shadow', a.get(`heat-exchanger-${this.dir}-shadow`), this.x, this.y);
    const glow = heatGlow(this.temp);
    if (glow > 0) { const [tx, ty] = this.heatConns()[0]; r.drawRect('objects', a.get('white'), tx + 0.5, ty + 0.5, 0.5, 0.3, additive(1, 0.35, 0.1, glow * 0.8), 0, this.y + 0.01); }
  }
  description() { return [`Temperature: ${this.temp.toFixed(1)}°C`]; }
  serialize() { return { t: this.temp }; }
  load(d: any) { this.temp = d.t ?? AMBIENT; }
  buildGUI(win: any, P: HTMLElement) {
    win.status(P);
    tempBar(win, P, this);
    const row = h('div', 'row', P);
    win.fluidBar(row, () => this.fluidBoxes[0], 'Water');
    win.fluidBar(row, () => this.fluidBoxes[1], 'Steam');
  }
}

registerEntity(['heat-pipe'], HeatPipe);
registerEntity(['reactor'], Reactor);
registerEntity(['heat-exchanger'], HeatExchanger);
void tileKey; void rgba;
