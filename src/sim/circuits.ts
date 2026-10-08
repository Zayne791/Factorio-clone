// Circuit network: red/green wires, signal networks (summed each tick), entity control behaviours
// (enable/disable conditions, read contents) and combinators (arithmetic, decider, selector, constant),
// plus power switch, programmable speaker, lamp colours and display panel.
import { Entity, PHASE, registerEntity } from './entity';
import { G, Dir, rotOffset, fmtNum } from '../core';
import { ITEMS, FLUIDS, ENTITIES, itemName } from '../data/protos';
import type { Renderer } from '../engine/renderer';
import { WHITE, rgba, additive } from '../engine/renderer';
import { ElectricPole } from './power';
import { h } from '../util/dom';

export type Signals = Map<string, number>;
export type Color = 'red' | 'green';
export interface Cond { a: string | null; op: string; b: string | null; k: number; }
export interface Control {
  en?: boolean; cond?: Cond;          // enable/disable
  read?: boolean; readMode?: string;  // read contents / hand / resources
  color?: boolean;                    // lamp: use colors
  [k: string]: any;
}
interface Edge { a: Entity; at: number; b: Entity; bt: number; color: Color; }
class Net { id: number; signals: Signals = new Map(); next: Signals = new Map(); nodes: [Entity, number][] = []; constructor(id: number) { this.id = id; } }

const WIREABLE = new Set(['container', 'logistic-container', 'storage-tank', 'inserter', 'transport-belt', 'lamp', 'arithmetic-combinator', 'decider-combinator', 'selector-combinator', 'constant-combinator',
  'power-switch', 'programmable-speaker', 'display-panel', 'electric-pole', 'mining-drill', 'assembling-machine', 'furnace', 'accumulator', 'roboport', 'pump', 'offshore-pump', 'train-stop',
  'rail-signal', 'rail-chain-signal', 'gate', 'wall', 'ammo-turret', 'electric-turret', 'fluid-turret', 'reactor', 'rocket-silo', 'lab', 'cargo-wagon', 'artillery-turret', 'cargo-landing-pad']);
const TWO_TERMINALS = new Set(['arithmetic-combinator', 'decider-combinator', 'selector-combinator']);
const CONTROLLABLE = new Set(['inserter', 'mining-drill', 'assembling-machine', 'furnace', 'pump', 'offshore-pump', 'lamp', 'power-switch', 'programmable-speaker', 'train-stop', 'rail-signal', 'gate', 'transport-belt', 'display-panel']);

export const OPS = ['<', '>', '=', '≥', '≤', '≠'];
export function cmp(a: number, op: string, b: number) {
  switch (op) { case '<': return a < b; case '>': return a > b; case '=': return a === b; case '≥': return a >= b; case '≤': return a <= b; default: return a !== b; }
}
export function evalCond(c: Cond | undefined, s: Signals): boolean {
  if (!c || !c.a) return false;
  const bv = c.b ? (s.get(c.b) || 0) : c.k;
  if (c.a === 'signal-everything') { for (const v of s.values()) if (v !== 0 && !cmp(v, c.op, bv)) return false; return true; }
  if (c.a === 'signal-anything') { for (const v of s.values()) if (v !== 0 && cmp(v, c.op, bv)) return true; return false; }
  return cmp(s.get(c.a) || 0, c.op, bv);
}
function add(s: Signals, k: string, v: number) { if (!v) return; const n = ((s.get(k) || 0) + v) | 0; if (n) s.set(k, n); else s.delete(k); }
const i32 = (v: number) => (v | 0);

export class CircuitSystem {
  edges: Edge[] = [];
  nets: Net[] = [];
  nodeNet = new Map<string, Net>();       // `${id}:${t}:${color}` -> net
  dirty = true;
  pending: { e: Entity; t: number; color: Color } | null = null;
  nextNet = 1;

  canWire(e: Entity | null): boolean { return !!e && !e.dead && e.isBuilding && WIREABLE.has(e.type); }
  terminals(e: Entity) { return TWO_TERMINALS.has(e.type) ? 2 : 1; }
  terminalAt(e: Entity, wx: number, wy: number): number {
    if (!TWO_TERMINALS.has(e.type)) return 1;
    const [ox, oy] = rotOffset(0, -1, e.dir);  // output at front
    return (wx - e.x) * ox + (wy - e.y) * oy > 0 ? 2 : 1;
  }
  wirePoint(e: Entity, t: number, color: Color): [number, number] {
    if (e instanceof ElectricPole) return e.wirePoint(color);
    const off = color === 'red' ? -0.12 : 0.12;
    if (TWO_TERMINALS.has(e.type)) {
      const [fx, fy] = rotOffset(off, t === 2 ? -0.62 : 0.62, e.dir);
      return [e.x + fx, e.y + fy - 0.25];
    }
    return [e.x + off, e.y - Math.min(0.7, e.h * 0.35) - 0.1];
  }
  reach(e: Entity) { return e instanceof ElectricPole ? (e.proto.reach || 9) : 9; }
  isWired(e: Entity) { return this.edges.some(x => x.a === e || x.b === e); }
  hasEdge(a: Entity, at: number, b: Entity, bt: number, color: Color) {
    return this.edges.findIndex(x => x.color === color && ((x.a === a && x.at === at && x.b === b && x.bt === bt) || (x.a === b && x.at === bt && x.b === a && x.bt === at)));
  }
  connect(a: Entity, at: number, b: Entity, bt: number, color: Color): boolean | string {
    if (a === b && at === bt) return false;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > Math.max(this.reach(a), this.reach(b)) + 0.01) return 'Wire is too long';
    const i = this.hasEdge(a, at, b, bt, color);
    if (i >= 0) { this.edges.splice(i, 1); this.dirty = true; return true; }
    this.edges.push({ a, at, b, bt, color });
    this.dirty = true;
    return true;
  }
  wireClick(e: Entity | null, color: Color) {
    const g = G.game;
    const inp = g.ui?.input;
    if (!e || !this.canWire(e)) { this.pending = null; return; }
    const t = this.terminalAt(e, inp?.wx ?? e.x, inp?.wy ?? e.y);
    if (!g.player.canReach(e.x, e.y, 10)) { g.ui?.flyText(e.x, e.y, 'Out of reach', '#ff8a6a'); return; }
    if (!this.pending || this.pending.color !== color) { this.pending = { e, t, color }; g.sound.play('rotate', 0.3); return; }
    if (this.pending.e === e && this.pending.t === t) { this.pending = null; return; }
    const r = this.connect(this.pending.e, this.pending.t, e, t, color);
    if (typeof r === 'string') { g.ui?.flyText(e.x, e.y, r, '#ff8a6a'); return; }
    g.sound.play('build', 0.3, e.x, e.y);
    this.pending = { e, t, color };
  }
  onEntityRemoved(e: Entity) {
    const n = this.edges.length;
    this.edges = this.edges.filter(x => x.a !== e && x.b !== e);
    if (this.edges.length !== n) this.dirty = true;
    if (this.pending?.e === e) this.pending = null;
  }

  rebuild() {
    this.dirty = false;
    const parent = new Map<string, string>();
    const find = (k: string): string => { let r = k; while (parent.get(r) !== r) r = parent.get(r)!; let c = k; while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; } return r; };
    const node = (e: Entity, t: number, c: Color) => { const k = `${e.id}:${t}:${c}`; if (!parent.has(k)) parent.set(k, k); return k; };
    const ents = new Map<string, [Entity, number]>();
    for (const x of this.edges) {
      const ka = node(x.a, x.at, x.color), kb = node(x.b, x.bt, x.color);
      ents.set(ka, [x.a, x.at]); ents.set(kb, [x.b, x.bt]);
      const ra = find(ka), rb = find(kb);
      if (ra !== rb) parent.set(ra, rb);
    }
    const byRoot = new Map<string, Net>();
    const old = this.nodeNet;
    this.nodeNet = new Map();
    this.nets = [];
    for (const [k, en] of ents) {
      const r = find(k);
      let net = byRoot.get(r);
      if (!net) {
        const prev = old.get(k);
        net = new Net(prev && !this.nets.some(n => n.id === prev.id) ? prev.id : this.nextNet++);
        if (prev) net.signals = prev.signals;
        byRoot.set(r, net); this.nets.push(net);
      }
      net.nodes.push(en);
      this.nodeNet.set(k, net);
    }
  }
  netOf(e: Entity, t: number, c: Color) { return this.nodeNet.get(`${e.id}:${t}:${c}`) || null; }
  input(e: Entity, t = 1): Signals {
    const out: Signals = new Map();
    for (const c of ['red', 'green'] as Color[]) { const n = this.netOf(e, t, c); if (n) for (const [k, v] of n.signals) add(out, k, v); }
    return out;
  }

  tick() {
    if (this.dirty) this.rebuild();
    if (!this.nets.length) return;
    // 1) gather outputs into next-signal maps
    for (const n of this.nets) {
      n.next = new Map();
      for (const [e, t] of n.nodes) {
        if (e.dead) continue;
        const o = this.outputOf(e, t);
        if (o) for (const [k, v] of o) add(n.next, k, v);
      }
    }
    for (const n of this.nets) n.signals = n.next;
    // 2) entities read inputs (control behaviour / combinator evaluation)
    const done = new Set<Entity>();
    for (const n of this.nets) for (const [e] of n.nodes) {
      if (done.has(e) || e.dead) continue;
      done.add(e);
      this.control(e);
    }
  }

  outputOf(e: Entity, t: number): Signals | null {
    const x = e as any;
    if (x.circuitOutput) return x.circuitOutput(t);
    const c: Control = x.control || {};
    const s: Signals = new Map();
    switch (e.type) {
      case 'container': case 'logistic-container': case 'cargo-landing-pad': case 'cargo-wagon':
        if (c.read === false) return null;
        for (const st of x.inv.slots) if (st) add(s, st.id, st.n);
        return s;
      case 'storage-tank': {
        const b = x.fluidBoxes?.[0];
        if (b?.contentFluid) add(s, b.contentFluid, Math.floor(b.content));
        return s;
      }
      case 'accumulator': add(s, 'signal-A', Math.round(x.stored / x.cap * 100)); return s;
      case 'inserter':
        if (c.read && x.hand) add(s, x.hand.id, x.hand.n);
        return s;
      case 'mining-drill':
        if (!c.read) return null;
        for (const [tx, ty] of x.tiles || []) { const [rid, amt] = G.game.world.res(tx, ty); if (rid) add(s, rid, Math.min(amt, 2e9)); }
        return s;
      case 'assembling-machine': case 'furnace':
        if (!c.read) return null;
        for (const inv of e.inventories()) for (const st of inv.slots) if (st) add(s, st.id, st.n);
        return s;
      case 'roboport': {
        if (!c.read) return null;
        const net = x.net;
        if (net) {
          for (const ch of net.chests) for (const st of ch.inv.slots) if (st) add(s, st.id, st.n);
          const stt = net.stats();
          add(s, 'signal-X', stt.logAvail); add(s, 'signal-Y', stt.logTotal); add(s, 'signal-Z', stt.conAvail); add(s, 'signal-T', stt.conTotal);
        }
        return s;
      }
      case 'ammo-turret': for (const st of x.inv.slots) if (st) add(s, st.id, st.n); return s;
      case 'reactor': add(s, 'signal-T', Math.round(x.temp)); for (const st of x.burner.fuel.slots) if (st) add(s, st.id, st.n); return s;
      case 'transport-belt':
        if (!c.read) return null;
        for (const [id, n] of x.contentsOnTile ? x.contentsOnTile() : []) add(s, id, n);
        return s;
    }
    return null;
  }

  control(e: Entity) {
    const x = e as any;
    if (x.onCircuit) { x.onCircuit(this.input(e, 1), this); return; }
    if (!CONTROLLABLE.has(e.type)) return;
    const c: Control = x.control || {};
    const inp = this.input(e, 1);
    if (c.en && c.cond) e.active = evalCond(c.cond, inp);
    else e.active = true;
    if (e.type === 'lamp') {
      if (c.color) {
        const cols: [string, [number, number, number]][] = [['signal-red', [1, 0.2, 0.2]], ['signal-green', [0.2, 1, 0.2]], ['signal-blue', [0.3, 0.4, 1]], ['signal-yellow', [1, 1, 0.2]], ['signal-pink', [1, 0.4, 0.8]], ['signal-cyan', [0.2, 1, 1]], ['signal-white', [1, 1, 1]]];
        let col: [number, number, number] | null = null;
        for (const [k, v] of cols) if ((inp.get(k) || 0) > 0) { col = v; break; }
        x.color = col;
      } else x.color = null;
    }
  }

  // ---- drawing ----
  draw(r: Renderer, x0: number, y0: number, x1: number, y1: number) {
    const a = r.atlas, wire = a.get('wire');
    const vis = (e: Entity) => e.x > x0 - 12 && e.x < x1 + 12 && e.y > y0 - 12 && e.y < y1 + 12;
    for (const ed of this.edges) {
      if (!vis(ed.a) && !vis(ed.b)) continue;
      const [ax, ay] = this.wirePoint(ed.a, ed.at, ed.color), [bx, by] = this.wirePoint(ed.b, ed.bt, ed.color);
      const col = ed.color === 'red' ? rgba(0.85, 0.15, 0.1, 1) : rgba(0.15, 0.75, 0.2, 1);
      catenary(r, wire, ax, ay, bx, by, col);
    }
    if (this.pending && G.game.ui?.input) {
      const inp = G.game.ui.input;
      const p = this.pending;
      if (p.e.dead) { this.pending = null; return; }
      const cur = G.game.player.cursorItem();
      if (cur !== 'red-wire' && cur !== 'green-wire') { this.pending = null; return; }
      const [ax, ay] = this.wirePoint(p.e, p.t, p.color);
      const col = p.color === 'red' ? rgba(0.9, 0.2, 0.15, 0.8) : rgba(0.2, 0.8, 0.25, 0.8);
      catenary(r, wire, ax, ay, inp.wx, inp.wy, col);
    }
  }

  // ---- GUI: generic circuit section in entity windows ----
  buildCircuitGUI(win: any, P: HTMLElement, e: Entity) {
    if (!this.isWired(e) || (e as any).buildGUI && TWO_TERMINALS.has(e.type)) return;
    const x = e as any;
    x.control = x.control || {};
    const c: Control = x.control;
    const box = h('div', 'col circuit-box', P);
    h('div', 'subtitle', box, 'Circuit network');
    const conn = h('div', 'mini-label', box);
    win.updaters.push(() => {
      const r = this.netOf(e, 1, 'red'), g = this.netOf(e, 1, 'green');
      conn.textContent = `Connected to: ${[r ? 'red #' + r.id : '', g ? 'green #' + g.id : ''].filter(Boolean).join(', ') || 'nothing'}`;
    });
    if (CONTROLLABLE.has(e.type)) {
      const row = h('label', 'row mini-label', box);
      const cb = h('input', '', row) as HTMLInputElement; cb.type = 'checkbox'; cb.checked = !!c.en;
      row.append(e.type === 'lamp' || e.type === 'power-switch' ? ' Enable/disable' : ' Enable/disable');
      const ce = condEditor(win, box, () => c.cond || (c.cond = { a: null, op: '>', b: null, k: 0 }));
      ce.classList.toggle('hidden', !c.en);
      cb.onchange = () => { c.en = cb.checked; ce.classList.toggle('hidden', !c.en); if (!c.en) e.active = true; };
    }
    const readLabel: Record<string, string> = { 'inserter': 'Read hand contents', 'mining-drill': 'Read resources', 'assembling-machine': 'Read contents', 'furnace': 'Read contents', 'roboport': 'Read logistic network', 'transport-belt': 'Read belt contents', 'container': 'Read contents', 'logistic-container': 'Read contents' };
    if (readLabel[e.type]) {
      const row = h('label', 'row mini-label', box);
      const cb = h('input', '', row) as HTMLInputElement; cb.type = 'checkbox';
      const def = e.type === 'container' || e.type === 'logistic-container';
      cb.checked = c.read ?? def;
      cb.onchange = () => { c.read = cb.checked; };
      row.append(' ' + readLabel[e.type]);
    }
    if (e.type === 'lamp') {
      const row = h('label', 'row mini-label', box);
      const cb = h('input', '', row) as HTMLInputElement; cb.type = 'checkbox'; cb.checked = !!c.color;
      cb.onchange = () => { c.color = cb.checked; };
      row.append(' Use colors');
    }
    // live signal readout
    const sig = h('div', 'signal-grid', box);
    win.updaters.push(() => signalGrid(win.ui, sig, this.input(e, 1)));
  }

  serialize() { return { e: this.edges.filter(x => !x.a.dead && !x.b.dead).map(x => [x.a.id, x.at, x.b.id, x.bt, x.color === 'red' ? 0 : 1]) }; }
  load(d: any) {
    if (!d) return;
    const W = G.game.world.entities;
    for (const [a, at, b, bt, c] of d.e || []) {
      const ea = W.get(a), eb = W.get(b);
      if (ea && eb) this.edges.push({ a: ea, at, b: eb, bt, color: c ? 'green' : 'red' });
    }
    this.dirty = true;
  }
}

function catenary(r: Renderer, wire: any, ax: number, ay: number, bx: number, by: number, col: number) {
  const n = 8;
  const dist = Math.hypot(bx - ax, by - ay);
  const sag = Math.min(0.8, dist * 0.05);
  let px = ax, py = ay;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t + Math.sin(t * Math.PI) * sag;
    r.line('wires', wire, px, py, x, y, 0.06, col);
    px = x; py = y;
  }
}

// ---- GUI helpers ----
export function signalSlot(win: any, parent: HTMLElement, get: () => string | null, set: (v: string | null) => void, opts: { wildcards?: string[] } = {}) {
  const ui = win.ui;
  const s = ui.slot(parent, {
    onLeft: () => {
      const cur = ui.g.player.cursor;
      if (cur && cur.id !== 'red-wire' && cur.id !== 'green-wire') { set(cur.id); return; }
      ui.pickItem((id: string) => set(id), { fluids: true, signals: true, title: 'Select signal' });
    },
    onRight: () => set(null),
    tooltip: () => { const v = get(); return v ? `<div class="tt-title">${sigName(v)}</div>` : '<div class="tt-title">Select signal</div>'; },
  });
  win.updaters.push(() => ui.setSlot(s, null, get(), ''));
  return s;
}
export function sigName(id: string) {
  if (id.startsWith('signal-')) { const k = id.slice(7); return k.length === 1 ? 'Signal ' + k : k[0].toUpperCase() + k.slice(1); }
  return itemName(id);
}
export function condEditor(win: any, parent: HTMLElement, get: () => Cond) {
  const row = h('div', 'row cond-row', parent);
  signalSlot(win, row, () => get().a, v => get().a = v);
  const sel = h('select', '', row) as HTMLSelectElement;
  for (const o of OPS) { const op = h('option', '', sel, o) as HTMLOptionElement; op.value = o; }
  sel.value = get().op; sel.onchange = () => get().op = sel.value;
  signalSlot(win, row, () => get().b, v => get().b = v);
  const num = h('input', '', row) as HTMLInputElement; num.type = 'number'; num.style.width = '70px'; num.value = String(get().k);
  num.oninput = () => get().k = i32(parseInt(num.value || '0', 10));
  win.updaters.push(() => { num.disabled = !!get().b; num.style.opacity = get().b ? '0.4' : '1'; });
  return row;
}
export function signalGrid(ui: any, el: HTMLElement, s: Signals) {
  const key = [...s.entries()].map(([k, v]) => k + v).join('|');
  if ((el as any)._k === key) return;
  (el as any)._k = key;
  el.innerHTML = '';
  for (const [k, v] of [...s.entries()].slice(0, 40)) {
    const d = h('div', 'sig', el);
    ui.icon(k, 26, d);
    h('span', '', d, fmtNum(Math.abs(v)) === String(Math.abs(v)) ? String(v) : (v < 0 ? '-' : '') + fmtNum(Math.abs(v)));
  }
}

// ---------------- Combinators ----------------
class CombinatorBase extends Entity {
  out: Signals = new Map();
  get phase() { return PHASE.CIRCUIT; }
  onPlaced() { if (ENTITIES[this.name]?.source === 'electric') G.game.power.addElectric(this); }
  onRemoved() { if (ENTITIES[this.name]?.source === 'electric') G.game.power.removeElectric(this); }
  update() { this.demand = (this.proto.energy || 0) / 60; }
  get powered() { return !!this.elecNet && this.power > 0; }
  circuitOutput(t: number): Signals | null { return t === 2 && this.powered ? this.out : null; }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get(`${this.name}-${this.dir}`), this.x, this.y, WHITE, 0, 1, this.y);
    r.draw('shadow', a.get(`${this.name}-${this.dir}-shadow`), this.x, this.y);
    if (this.powered && this.out.size) r.draw('light', a.get('light'), this.x, this.y, additive(0.3, 0.8, 0.4, 0.4), 0, 1.5);
  }
  ioGrids(win: any, P: HTMLElement) {
    const io = h('div', 'col', P);
    h('div', 'mini-label', io, 'Input signals');
    const gi = h('div', 'signal-grid', io);
    h('div', 'mini-label', io, 'Output signals');
    const go = h('div', 'signal-grid', io);
    win.updaters.push(() => { signalGrid(win.ui, gi, G.game.circuits.input(this, 1)); signalGrid(win.ui, go, this.out); });
  }
}

export const ARITH_OPS = ['*', '/', '+', '-', '%', '^', '<<', '>>', 'AND', 'OR', 'XOR'];
function arith(a: number, op: string, b: number): number {
  switch (op) {
    case '*': return Math.imul(a, b);
    case '/': return b === 0 ? 0 : i32(a / b);
    case '+': return i32(a + b);
    case '-': return i32(a - b);
    case '%': return b === 0 ? 0 : i32(a % b);
    case '^': return i32(Math.pow(a, b));
    case '<<': return a << (b & 31);
    case '>>': return a >> (b & 31);
    case 'AND': return a & b;
    case 'OR': return a | b;
    default: return a ^ b;
  }
}
export class ArithmeticCombinator extends CombinatorBase {
  cfg = { a: null as string | null, ak: 0, op: '*', b: null as string | null, bk: 1, out: null as string | null };
  onCircuit(inp: Signals) {
    const c = this.cfg;
    const out: Signals = new Map();
    if (!this.powered) { this.out = out; return; }
    const bv = c.b ? (inp.get(c.b) || 0) : c.bk;
    if (c.a === 'signal-each') {
      for (const [k, v] of inp) {
        const r = arith(v, c.op, c.b === 'signal-each' ? v : bv);
        if (c.out === 'signal-each') add(out, k, r); else if (c.out) add(out, c.out, r);
      }
    } else {
      const av = c.a ? (inp.get(c.a) || 0) : c.ak;
      if (c.out && c.out !== 'signal-each') add(out, c.out, arith(av, c.op, bv));
    }
    this.out = out;
  }
  bpSettings() { return { cfg: { ...this.cfg } }; }
  applyBp(s: any) { if (s.cfg) this.cfg = { ...s.cfg }; }
  serialize() { return { c: this.cfg }; }
  load(d: any) { if (d.c) this.cfg = d.c; }
  buildGUI(win: any, P: HTMLElement) {
    win.status(P); win.powerInfo(P);
    const c = this.cfg;
    h('div', 'subtitle', P, 'Input');
    const row = h('div', 'row cond-row', P);
    signalSlot(win, row, () => c.a, v => c.a = v);
    const ak = h('input', '', row) as HTMLInputElement; ak.type = 'number'; ak.style.width = '60px'; ak.value = String(c.ak); ak.oninput = () => c.ak = i32(+ak.value);
    const sel = h('select', '', row) as HTMLSelectElement;
    for (const o of ARITH_OPS) (h('option', '', sel, o) as HTMLOptionElement).value = o;
    sel.value = c.op; sel.onchange = () => c.op = sel.value;
    signalSlot(win, row, () => c.b, v => c.b = v);
    const bk = h('input', '', row) as HTMLInputElement; bk.type = 'number'; bk.style.width = '60px'; bk.value = String(c.bk); bk.oninput = () => c.bk = i32(+bk.value);
    win.updaters.push(() => { ak.style.display = c.a ? 'none' : ''; bk.style.display = c.b ? 'none' : ''; });
    h('div', 'subtitle', P, 'Output');
    const orow = h('div', 'row', P);
    signalSlot(win, orow, () => c.out, v => c.out = v);
    this.ioGrids(win, P);
  }
}

export class DeciderCombinator extends CombinatorBase {
  cfg = { cond: { a: null, op: '>', b: null, k: 0 } as Cond, out: null as string | null, copy: false };
  onCircuit(inp: Signals) {
    const c = this.cfg;
    const out: Signals = new Map();
    if (!this.powered) { this.out = out; return; }
    const cd = c.cond;
    if (cd.a === 'signal-each') {
      const bv = cd.b ? (inp.get(cd.b) || 0) : cd.k;
      for (const [k, v] of inp) if (cmp(v, cd.op, bv)) {
        if (c.out === 'signal-each') add(out, k, c.copy ? v : 1);
        else if (c.out) add(out, c.out, c.copy ? v : 1);
      }
    } else if (evalCond(cd, inp)) {
      if (c.out === 'signal-everything') for (const [k, v] of inp) add(out, k, c.copy ? v : 1);
      else if (c.out === 'signal-anything') { const f = inp.entries().next(); if (!f.done) add(out, f.value[0], c.copy ? f.value[1] : 1); }
      else if (c.out) add(out, c.out, c.copy ? (inp.get(c.out) || 0) : 1);
    }
    this.out = out;
  }
  bpSettings() { return { cfg: JSON.parse(JSON.stringify(this.cfg)) }; }
  applyBp(s: any) { if (s.cfg) this.cfg = JSON.parse(JSON.stringify(s.cfg)); }
  serialize() { return { c: this.cfg }; }
  load(d: any) { if (d.c) this.cfg = d.c; }
  buildGUI(win: any, P: HTMLElement) {
    win.status(P); win.powerInfo(P);
    const c = this.cfg;
    h('div', 'subtitle', P, 'Condition');
    condEditor(win, P, () => c.cond);
    h('div', 'subtitle', P, 'Output');
    const orow = h('div', 'row', P);
    signalSlot(win, orow, () => c.out, v => c.out = v);
    const m = h('div', 'btn small', orow, '');
    m.onclick = () => c.copy = !c.copy;
    win.updaters.push(() => m.textContent = c.copy ? 'Input count' : '1');
    this.ioGrids(win, P);
  }
}

export class SelectorCombinator extends CombinatorBase {
  cfg = { mode: 'max', index: 0, out: null as string | null };
  onCircuit(inp: Signals) {
    const c = this.cfg;
    const out: Signals = new Map();
    if (!this.powered) { this.out = out; return; }
    const arr = [...inp.entries()].filter(([, v]) => v !== 0);
    if (c.mode === 'max' || c.mode === 'min') {
      arr.sort((x, y) => c.mode === 'max' ? y[1] - x[1] : x[1] - y[1]);
      const e = arr[c.index]; if (e) add(out, e[0], e[1]);
    } else if (c.mode === 'count') { if (c.out) add(out, c.out, arr.length); }
    else if (c.mode === 'random') { if (arr.length) { const e = arr[(G.game.tick * 2654435761 >>> 0) % arr.length]; add(out, e[0], e[1]); } }
    else if (c.mode === 'stack-size') { for (const [k] of arr) if (ITEMS[k]) add(out, k, ITEMS[k].stack); }
    this.out = out;
  }
  bpSettings() { return { cfg: { ...this.cfg } }; }
  applyBp(s: any) { if (s.cfg) this.cfg = { ...s.cfg }; }
  serialize() { return { c: this.cfg }; }
  load(d: any) { if (d.c) this.cfg = d.c; }
  buildGUI(win: any, P: HTMLElement) {
    win.status(P); win.powerInfo(P);
    const c = this.cfg;
    const row = h('div', 'row', P);
    const sel = h('select', '', row) as HTMLSelectElement;
    for (const [v, l] of [['max', 'Select input (descending)'], ['min', 'Select input (ascending)'], ['count', 'Count inputs'], ['random', 'Random input'], ['stack-size', 'Stack size']]) { const o = h('option', '', sel, l) as HTMLOptionElement; o.value = v; }
    sel.value = c.mode; sel.onchange = () => c.mode = sel.value;
    const idx = h('input', '', row) as HTMLInputElement; idx.type = 'number'; idx.min = '0'; idx.style.width = '60px'; idx.value = String(c.index); idx.oninput = () => c.index = Math.max(0, i32(+idx.value));
    signalSlot(win, row, () => c.out, v => c.out = v);
    this.ioGrids(win, P);
  }
}

export class ConstantCombinator extends Entity {
  sigs: ({ id: string; n: number } | null)[] = new Array(20).fill(null);
  on = true;
  get phase() { return PHASE.NONE; }
  circuitOutput(): Signals | null {
    if (!this.on) return null;
    const s: Signals = new Map();
    for (const q of this.sigs) if (q) add(s, q.id, q.n);
    return s;
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get('constant-combinator'), this.x, this.y, WHITE, 0, 1, this.y);
    r.draw('shadow', a.get('constant-combinator-shadow'), this.x, this.y);
  }
  bpSettings() { return { sigs: this.sigs.map(q => q ? { ...q } : null), on: this.on }; }
  applyBp(s: any) { if (s.sigs) this.sigs = s.sigs.map((q: any) => q ? { ...q } : null); this.on = s.on !== false; }
  serialize() { return { s: this.sigs, o: this.on }; }
  load(d: any) { if (d.s) this.sigs = d.s; this.on = d.o !== false; }
  buildGUI(win: any, P: HTMLElement) {
    const ui = win.ui;
    const t = h('div', 'btn small', P, '');
    t.onclick = () => this.on = !this.on;
    win.updaters.push(() => t.textContent = this.on ? 'On' : 'Off');
    const grid = h('div', 'grid', P); grid.style.gridTemplateColumns = 'repeat(10, var(--slot))';
    const editor = h('div', 'row hidden', P);
    const num = h('input', '', editor) as HTMLInputElement; num.type = 'number'; num.style.width = '100px';
    let ei = -1;
    num.oninput = () => { if (ei >= 0 && this.sigs[ei]) this.sigs[ei]!.n = i32(+num.value); };
    for (let i = 0; i < 20; i++) {
      const s = ui.slot(grid, {
        onLeft: () => {
          if (!this.sigs[i]) ui.pickItem((id: string) => { this.sigs[i] = { id, n: 1 }; ei = i; num.value = '1'; editor.classList.remove('hidden'); }, { fluids: true, signals: true, title: 'Select signal' });
          else { ei = i; num.value = String(this.sigs[i]!.n); editor.classList.remove('hidden'); num.focus(); }
        },
        onRight: () => { this.sigs[i] = null; },
        tooltip: () => { const q = this.sigs[i]; return q ? `<div class="tt-title">${sigName(q.id)}</div><div class="tt-body">${q.n}</div>` : null; },
      });
      win.updaters.push(() => { const q = this.sigs[i]; ui.setSlot(s, null, q?.id || null, q ? fmtNum(Math.abs(q.n)) : ''); });
    }
  }
}

export class PowerSwitch extends Entity {
  get phase() { return PHASE.NONE; }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get('power-switch'), this.x, this.y, WHITE, 0, 1, this.y);
    r.draw('shadow', a.get('power-switch-shadow'), this.x, this.y);
    r.draw('objects', a.get('switch-lever'), this.x, this.y - 0.3, this.active ? rgba(0.4, 1, 0.4, 1) : rgba(1, 0.4, 0.3, 1), this.active ? -0.5 : 0.5, 0.6, this.y + 0.01);
  }
  buildGUI(win: any, P: HTMLElement) {
    const b = h('div', 'btn', P, '');
    b.onclick = () => this.active = !this.active;
    win.updaters.push(() => b.textContent = this.active ? 'Switch: ON' : 'Switch: OFF');
  }
}

export class ProgrammableSpeaker extends Entity {
  was = false;
  get phase() { return PHASE.MISC; }
  onPlaced() { G.game.power.addElectric(this); }
  onRemoved() { G.game.power.removeElectric(this); }
  update() {
    this.demand = (this.proto.energy || 0) / 60;
    const c = (this as any).control as Control | undefined;
    const now = !!c?.en && this.active && this.power > 0;
    if (now && !this.was) { G.game.sound.play('alert', 0.6, this.x, this.y); if (c?.alert) G.game.ui?.showMessage(c.alertText || 'Speaker alert', 3000); }
    this.was = now;
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get('programmable-speaker'), this.x, this.y, WHITE, 0, 1, this.y);
    r.draw('shadow', a.get('programmable-speaker-shadow'), this.x, this.y);
  }
}

export class DisplayPanel extends Entity {
  icon: string | null = null;
  text = '';
  get phase() { return PHASE.NONE; }
  draw(r: Renderer, alt: boolean) {
    const a = r.atlas;
    r.draw('objects', a.get('display-panel'), this.x, this.y, WHITE, 0, 1, this.y);
    const c = (this as any).control as Control | undefined;
    const show = !c?.en || this.active;
    if (this.icon && show) r.draw('objects', a.get('icon:' + this.icon), this.x, this.y - 0.15, WHITE, 0, 0.5, this.y + 0.01);
  }
  bpSettings() { return { icon: this.icon, text: this.text, ctl: (this as any).control }; }
  applyBp(s: any) { this.icon = s.icon || null; this.text = s.text || ''; if (s.ctl) (this as any).control = JSON.parse(JSON.stringify(s.ctl)); }
  serialize() { return { i: this.icon, t: this.text, c: (this as any).control }; }
  load(d: any) { this.icon = d.i || null; this.text = d.t || ''; if (d.c) (this as any).control = d.c; }
  buildGUI(win: any, P: HTMLElement) {
    const row = h('div', 'row', P);
    h('div', 'label', row, 'Icon');
    signalSlot(win, row, () => this.icon, v => this.icon = v);
    const t = h('input', '', row) as HTMLInputElement; t.placeholder = 'Text'; t.value = this.text; t.oninput = () => this.text = t.value;
  }
}

registerEntity(['arithmetic-combinator'], ArithmeticCombinator);
registerEntity(['decider-combinator'], DeciderCombinator);
registerEntity(['selector-combinator'], SelectorCombinator);
registerEntity(['constant-combinator'], ConstantCombinator);
registerEntity(['power-switch'], PowerSwitch);
registerEntity(['programmable-speaker'], ProgrammableSpeaker);
registerEntity(['display-panel'], DisplayPanel);
void FLUIDS;
