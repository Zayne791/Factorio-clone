// Rail network: Factorio 1.1 style rails on a 2x2 grid (straight, diagonal and 45° curved pieces), the connection
// graph trains travel along, rail blocks split by signals, rail signals / chain signals / train stops,
// the drag rail planner and batched rail rendering.
//
// Coordinates: world tiles, y down. Rail "joints" (connection points) are integer points on the edge midpoints of
// the 2x2 rail cells (cells have even top-left corners): (odd, even) or (even, odd). Directions are 8-way
// (0=N, 1=NE, 2=E, ... 7=NW). Angles are radians, 0 = north, clockwise (vehicle sprites point north, so an angle
// can be passed straight to Renderer.draw as `rot`).
import { Entity, PHASE, registerEntity, createEntity } from './entity';
import { G, Dir, tileKey } from '../core';
import { CHUNK } from '../world/mapgen';
import { chunkKey, Chunk } from '../world/world';
import { isWaterTile } from '../world/tiles';
import type { Renderer } from '../engine/renderer';
import { WHITE, rgba, additive } from '../engine/renderer';
import type { Preview } from '../render/world-render';
import { h } from '../util/dom';

// ---------------------------------------------------------------- directions
export const DX8 = [0, 1, 1, 1, 0, -1, -1, -1];
export const DY8 = [-1, -1, 0, 1, 1, 1, 0, -1];
const R2 = Math.SQRT1_2;
/** Unit vector of an 8-way direction. */
export const dirX = (d: number) => (d & 1 ? DX8[d & 7] * R2 : DX8[d & 7]);
export const dirY = (d: number) => (d & 1 ? DY8[d & 7] * R2 : DY8[d & 7]);
/** Heading angle of an 8-way direction (radians, 0 = north, clockwise). */
export const dirAngle = (d: number) => (d & 7) * Math.PI / 4;

// Curved rail (Factorio 1.1 proportions): leaves an orthogonal joint, turns 45°, and ends 7 tiles forward and
// 3 tiles to the side on a diagonal joint: a 45° arc of radius CURVE_R followed by a short diagonal tail.
export const CURVE_R = 4 * (Math.SQRT2 + 1);
export const CURVE_ARC = CURVE_R * Math.PI / 4;
export const CURVE_TAIL = (3 - CURVE_R * (1 - R2)) * Math.SQRT2;
export const CURVE_LEN = CURVE_ARC + CURVE_TAIL;

/** Joint key: integer point + 8-way direction. */
export const jointKey = (x: number, y: number, d: number) => ((x + 0x8000) * 0x10000 + (y + 0x8000)) * 8 + (d & 7);

// ---------------------------------------------------------------- piece shapes
// 12 canonical shapes, all relative to end A (an integer joint):
//  0..3  straight, heading ad = 0 (N, length 2), 1 (NE, √2), 2 (E, 2), 3 (SE, √2)
//  4..11 curve, ad ∈ {0,2,4,6} (heading at the orthogonal end A), turn -1 (left) / +1 (right): id = 4 + ad + (turn > 0)
export interface Shape {
  id: number; ad: number; bd: number; turn: number; len: number;
  bx: number; by: number;             // end B relative to A
  n: number; pts: Float32Array;       // centerline samples (n+1 points, uniform in s) relative to A
  tiles: Int16Array;                  // footprint tiles relative to A (dx, dy pairs)
  x0: number; y0: number; x1: number; y1: number; // centerline bbox relative to A
  bed: Float32Array;                  // [x, y, len, rot] ballast quads
  ties: Float32Array;                 // [x, y, rot] sleepers
  railL: Float32Array; railR: Float32Array; // steel rail polylines [x, y, ...]
}
const GAUGE = 0.5;                    // half distance between the two steel rails
const shapeIdOf = (ad: number, turn: number) => (turn ? 4 + ad + (turn > 0 ? 1 : 0) : ad);

function shapeAt(ad: number, turn: number, s: number, out: number[]) {
  const fx = dirX(ad), fy = dirY(ad), rx = -fy, ry = fx;
  if (!turn) { out[0] = fx * s; out[1] = fy * s; out[2] = dirAngle(ad); return; }
  let along: number, side: number, ang: number;
  if (s <= CURVE_ARC) { const p = s / CURVE_R; along = CURVE_R * Math.sin(p); side = CURVE_R * (1 - Math.cos(p)); ang = p; }
  else { const t = s - CURVE_ARC; along = CURVE_R * R2 + t * R2; side = CURVE_R * (1 - R2) + t * R2; ang = Math.PI / 4; }
  side *= turn;
  out[0] = fx * along + rx * side; out[1] = fy * along + ry * side; out[2] = dirAngle(ad) + turn * ang;
}

function distPointPolyline(px: number, py: number, pts: Float32Array, ox: number, oy: number): number {
  let best = 1e9;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i] + ox, ay = pts[i + 1] + oy, bx = pts[i + 2] + ox, by = pts[i + 3] + oy;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - px, ey = ay + dy * t - py;
    const d = ex * ex + ey * ey;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function makeShape(id: number): Shape {
  let ad: number, turn: number;
  if (id < 4) { ad = id; turn = 0; } else { const k = id - 4; ad = k & 6; turn = k & 1 ? 1 : -1; }
  const len = turn ? CURVE_LEN : ad & 1 ? Math.SQRT2 : 2;
  const o = [0, 0, 0];
  shapeAt(ad, turn, len, o);
  const bx = Math.round(o[0]), by = Math.round(o[1]);
  const bd = (ad + turn) & 7;
  const n = turn ? 32 : 1;
  const pts = new Float32Array((n + 1) * 2);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i <= n; i++) {
    shapeAt(ad, turn, len * i / n, o);
    if (i === n) { o[0] = bx; o[1] = by; }
    pts[i * 2] = o[0]; pts[i * 2 + 1] = o[1];
    x0 = Math.min(x0, o[0]); y0 = Math.min(y0, o[1]); x1 = Math.max(x1, o[0]); y1 = Math.max(y1, o[1]);
  }
  // footprint: tiles whose centre lies within 0.95 of the centerline, excluding tiles beyond either end
  const tiles: number[] = [];
  const fax = dirX(ad), fay = dirY(ad), fbx = dirX(bd), fby = dirY(bd);
  for (let ty = Math.floor(y0 - 2); ty <= Math.ceil(y1 + 2); ty++) for (let tx = Math.floor(x0 - 2); tx <= Math.ceil(x1 + 2); tx++) {
    const cx = tx + 0.5, cy = ty + 0.5;
    if (cx * fax + cy * fay < -0.01) continue;
    if ((cx - bx) * fbx + (cy - by) * fby > 0.01) continue;
    if (distPointPolyline(cx, cy, pts, 0, 0) < 0.95) tiles.push(tx, ty);
  }
  // drawing templates
  const bed: number[] = [], ties: number[] = [], railL: number[] = [], railR: number[] = [];
  const nb = Math.max(1, Math.round(len / 0.5));
  for (let i = 0; i < nb; i++) {
    shapeAt(ad, turn, (i + 0.5) * len / nb, o);
    bed.push(o[0], o[1], len / nb + 0.03, o[2] - Math.PI / 2);
  }
  const nt = Math.max(1, Math.round(len / 0.5));
  for (let i = 0; i < nt; i++) {
    shapeAt(ad, turn, (i + 0.5) * len / nt, o);
    ties.push(o[0], o[1], o[2]);
  }
  const nr = turn ? 32 : 1;
  for (let i = 0; i <= nr; i++) {
    shapeAt(ad, turn, len * i / nr, o);
    const rx = Math.cos(o[2]), ry = Math.sin(o[2]);
    railL.push(o[0] - rx * GAUGE, o[1] - ry * GAUGE);
    railR.push(o[0] + rx * GAUGE, o[1] + ry * GAUGE);
  }
  return {
    id, ad, bd, turn, len, bx, by, n, pts, tiles: new Int16Array(tiles), x0, y0, x1, y1,
    bed: new Float32Array(bed), ties: new Float32Array(ties), railL: new Float32Array(railL), railR: new Float32Array(railR),
  };
}
export const SHAPES: Shape[] = [];
for (let i = 0; i < 12; i++) SHAPES.push(makeShape(i));

// ---------------------------------------------------------------- graph types
/** A rail piece traversed in one direction: dir 0 = from end A to end B, dir 1 = from B to A. */
export interface RailRef { rail: RailPiece; dir: 0 | 1; }
export interface RailPoint { x: number; y: number; angle: number; }
/** A joint with a travel direction. */
export interface Joint { x: number; y: number; d: number; }

/** Set of rails between signals. Rebuilt (new objects) whenever the network or its signals change. */
export class RailBlock {
  id: number;
  rails: RailPiece[] = [];
  /** Signals that guard the entry into this block. */
  signals: RailSignal[] = [];
  /** Free for the trains system (occupancy / reservation bookkeeping); reset on rebuild. */
  occupied = 0;
  reservedBy: any = null;
  constructor(id: number) { this.id = id; }
}

// ---------------------------------------------------------------- rail entities
export class RailPiece extends Entity {
  isRail = true;
  shape: Shape = SHAPES[0];
  ax = 0; ay = 0;             // end A (integer joint)
  bx = 0; by = 0;             // end B (integer joint)
  /** Persistent directed references (no allocation during traversal): refs[0] = A→B, refs[1] = B→A. */
  refs: [RailRef, RailRef];
  block: RailBlock | null = null;
  /** Rails that physically cross or overlap this one (always in the same block). */
  conflicts: RailPiece[] = [];
  registered = false;
  chunkKeys: number[] = [];
  stamp = 0;
  uf = 0;
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, 0);
    this.refs = [{ rail: this, dir: 0 }, { rail: this, dir: 1 }];
  }
  get ad() { return this.shape.ad; }
  get bd() { return this.shape.bd; }
  get turn() { return this.shape.turn; }
  get length() { return this.shape.len; }
  get isCurve() { return this.shape.turn !== 0; }
  get phase() { return PHASE.NONE; }
  get blocksMovement() { return false; }
  get minable() { return !G.game?.trains?.isRailOccupied?.(this); }

  /** Set geometry from end A and a shape id (only while not placed). */
  setGeom(ax: number, ay: number, shapeId: number) {
    const sh = SHAPES[shapeId];
    this.shape = sh; this.ax = ax; this.ay = ay; this.bx = ax + sh.bx; this.by = ay + sh.by;
    if (!sh.turn) {
      if (!(sh.ad & 1)) { this.x = ax + DX8[sh.ad]; this.y = ay + DY8[sh.ad]; }
      else {
        // diagonal: the 2x2 cell (odd centre) whose corner the piece cuts
        const mx = (ax + this.bx) / 2, my = (ay + this.by) / 2;
        const c1x = mx + 0.5, c1y = my + 0.5;
        if ((((c1x % 2) + 2) % 2) === 1 && (((c1y % 2) + 2) % 2) === 1) { this.x = c1x; this.y = c1y; } else { this.x = mx - 0.5; this.y = my - 0.5; }
      }
      this.w = 2; this.h = 2;
    } else {
      this.x = ax + (sh.x0 + sh.x1) / 2; this.y = ay + (sh.y0 + sh.y1) / 2;
      const vert = (sh.ad & 2) === 0;
      this.w = vert ? 4 : 8; this.h = vert ? 8 : 4;
    }
  }
  /** Position and heading at distance s from the start of the traversal `dir` (0 = from A, 1 = from B). */
  pointAt(s: number, dir: 0 | 1 = 0, out?: RailPoint): RailPoint {
    const sh = this.shape, L = sh.len;
    s = s < 0 ? 0 : s > L ? L : s;
    const o = TMP3;
    shapeAt(sh.ad, sh.turn, dir ? L - s : s, o);
    const r = out || { x: 0, y: 0, angle: 0 };
    r.x = this.ax + o[0]; r.y = this.ay + o[1]; r.angle = dir ? o[2] + Math.PI : o[2];
    return r;
  }
  /** Joint where the traversal `dir` starts, with its travel direction. */
  entry(dir: 0 | 1): Joint { return dir ? { x: this.bx, y: this.by, d: (this.shape.bd + 4) & 7 } : { x: this.ax, y: this.ay, d: this.shape.ad }; }
  /** Joint where the traversal `dir` ends, with its travel direction. */
  exit(dir: 0 | 1): Joint { return dir ? { x: this.ax, y: this.ay, d: (this.shape.ad + 4) & 7 } : { x: this.bx, y: this.by, d: this.shape.bd }; }
  /** Distance from a point to the centerline. */
  distTo(px: number, py: number) { return distPointPolyline(px, py, this.shape.pts, this.ax, this.ay); }
  minedItems() { return [{ id: 'rail', n: this.isCurve ? 4 : 1 }]; }
  onPlaced() { G.game.rails?.addRail(this); }
  onRemoved() { G.game.rails?.removeRail(this); }
  draw() { /* drawn in bulk by RailSystem.draw */ }
  serialize() { return { g: [this.ax, this.ay, this.shape.id] }; }
  load(d: any) { if (d?.g && !this.registered) this.setGeom(d.g[0], d.g[1], d.g[2]); }
}
const TMP3 = [0, 0, 0];
export class StraightRail extends RailPiece { }
export class CurvedRail extends RailPiece { }
registerEntity(['straight-rail'], StraightRail);
registerEntity(['curved-rail'], CurvedRail);

// ---------------------------------------------------------------- signals & stops
/** Signal tile centre relative to the guarded joint, for each travel direction (right-hand side, just before the joint). */
export const SIGNAL_OFFSET: [number, number][] = [[1.5, 0.5], [0.5, 1.5], [-0.5, 1.5], [-1.5, 0.5], [-1.5, -0.5], [-0.5, -1.5], [0.5, -1.5], [1.5, -0.5]];
/** Train stop centre relative to its stop joint, for travel directions 0,2,4,6 (right-hand side). */
export const STOP_OFFSET: [number, number][] = [[2, 0], [0, 0], [0, 2], [0, 0], [-2, 0], [0, 0], [0, -2], [0, 0]];
const DIAG_FLAG = 8;           // entity flag: signal guards a diagonal direction (dir*2 + 1)

export type SignalState = 'green' | 'yellow' | 'red' | 'blue';

export class RailSignal extends Entity {
  /** Guarded joint: trains travelling in direction jd through (jx, jy) obey this signal. jd = -1 while unbound. */
  jx = 0; jy = 0; jd = -1;
  /** Display state, set by the trains system each tick (default green). */
  state: SignalState = 'green';
  /** Block entered after passing the signal (null if no rail continues), and the block before it. */
  block: RailBlock | null = null;
  blockBehind: RailBlock | null = null;
  registered = false;
  constructor(p: string, x: number, y: number, d: Dir) { super(p, x, y, d); }
  get isChain() { return this.type === 'rail-chain-signal'; }
  get phase() { return PHASE.NONE; }
  /** True when a circuit condition closes the signal (trains should treat it as red). */
  get circuitClosed() { return !this.active; }
  get joint(): Joint { return { x: this.jx, y: this.jy, d: this.jd }; }
  /** Preferred 8-way direction from rotation + diagonal flag. */
  get prefDir() { return (this.dir * 2 + (this.flags & DIAG_FLAG ? 1 : 0)) & 7; }
  resolveBinding() {
    const rs: RailSystem | null = G.game?.rails;
    const pref = this.prefDir;
    let best = pref;
    if (rs) for (let k = 0; k < 8; k++) {
      const d = (pref + k) & 7;
      const jx = Math.round(this.x - SIGNAL_OFFSET[d][0]), jy = Math.round(this.y - SIGNAL_OFFSET[d][1]);
      if (rs.hasJoint(jx, jy, d)) { best = d; break; }
    }
    this.jx = Math.round(this.x - SIGNAL_OFFSET[best][0]); this.jy = Math.round(this.y - SIGNAL_OFFSET[best][1]); this.jd = best;
  }
  setBinding(jx: number, jy: number, jd: number) {
    const rs: RailSystem | null = G.game?.rails;
    const was = this.registered;
    if (was) rs?.removeSignal(this);
    this.jx = jx; this.jy = jy; this.jd = jd & 7;
    if (was) rs?.addSignal(this);
  }
  onPlaced() { if (this.jd < 0) this.resolveBinding(); G.game.rails?.addSignal(this); }
  onRemoved() { G.game.rails?.removeSignal(this); }
  serialize() { return { j: [this.jx, this.jy, this.jd] }; }
  load(d: any) { if (d?.j && d.j[2] >= 0) this.setBinding(d.j[0], d.j[1], d.j[2]); }
  circuitOutput() {
    const s = new Map<string, number>();
    s.set(this.state === 'red' ? 'signal-red' : this.state === 'yellow' ? 'signal-yellow' : this.state === 'blue' ? 'signal-blue' : 'signal-green', 1);
    return s;
  }
  description() { return [this.isChain ? 'Chain signal' : 'Rail signal', 'State: ' + this.state]; }
  draw(r: Renderer, alt: boolean) {
    const a = r.atlas;
    if (this.jd < 0) this.resolveBinding();
    r.draw('objects', a.get(this.name), this.x, this.y, WHITE, 0, 1, this.y + 0.2);
    r.draw('shadow', a.get(this.name + '-shadow'), this.x, this.y);
    const lamp = a.get('signal-lamp');
    const chain = this.isChain;
    const order: SignalState[] = chain ? ['red', 'yellow', 'green', 'blue'] : ['red', 'yellow', 'green'];
    const y0 = chain ? -1.19 : -1.2, step = chain ? 0.19 : 0.2;
    const bound = !!G.game?.rails?.hasJoint(this.jx, this.jy, this.jd);
    const dark = G.game ? G.game.darkness : 0;
    for (let i = 0; i < order.length; i++) {
      const st = order[i];
      const on = bound && this.state === st && r.redirect === null;
      const c = LAMP_COLORS[st];
      const col = on ? rgba(c[0], c[1], c[2], 1) : rgba(c[0] * 0.18 + 0.05, c[1] * 0.18 + 0.05, c[2] * 0.18 + 0.05, 1);
      r.draw('objects', lamp, this.x, this.y + y0 + i * step, col, 0, 0.62, this.y + 0.21);
      if (on && dark > 0.05) r.draw('light', a.get('light'), this.x, this.y + y0 + i * step, additive(c[0], c[1], c[2], 0.8), 0, 1.4);
    }
    if (alt || r.redirect) {
      // travel direction the signal guards
      const d = this.jd < 0 ? this.prefDir : this.jd;
      const ax = this.jx + dirX(d) * 0.1, ay = this.jy + dirY(d) * 0.1;
      if (r.redirect) r.draw('top', a.get('arrow'), ax, ay, WHITE, dirAngle(d), 0.7);
      else r.draw('overlay', a.get('arrow-small'), this.x, this.y, rgba(1, 1, 1, 0.8), dirAngle(d), 0.45);
    }
  }
}
const LAMP_COLORS: Record<SignalState, [number, number, number]> = { red: [1, 0.16, 0.1], yellow: [1, 0.78, 0.1], green: [0.25, 1, 0.3], blue: [0.3, 0.55, 1] };
registerEntity(['rail-signal', 'rail-chain-signal'], RailSignal);

export class TrainStop extends Entity {
  stationName = '';
  /** Stop joint: a train travelling in direction jd halts with its front at (jx, jy). */
  jx = 0; jy = 0; jd = 0;
  /** Train limit (-1 = no limit). */
  trainLimit = -1;
  registered = false;
  constructor(p: string, x: number, y: number, d: Dir) { super(p, x, y, d); this.bind(); }
  get phase() { return PHASE.NONE; }
  get joint(): Joint { return { x: this.jx, y: this.jy, d: this.jd }; }
  bind() {
    const d = (this.dir * 2) & 7;
    this.jd = d; this.jx = Math.round(this.x - STOP_OFFSET[d][0]); this.jy = Math.round(this.y - STOP_OFFSET[d][1]);
  }
  /** Directed rails whose traversal ends at the stop joint heading jd; a stopped train's front is at s = rail.length. */
  targets(): RailRef[] { return G.game?.rails ? G.game.rails.arrivals(this.jx, this.jy, this.jd) : []; }
  onPlaced() {
    this.bind();
    const rs: RailSystem | null = G.game.rails;
    if (!this.stationName) this.stationName = rs ? rs.defaultStopName() : 'Stop';
    rs?.addStop(this);
  }
  onRemoved() { G.game.rails?.removeStop(this); }
  serialize() { return { n: this.stationName, l: this.trainLimit }; }
  load(d: any) { if (!d) return; if (typeof d.n === 'string') this.stationName = d.n; this.trainLimit = d.l ?? -1; }
  description() { return ['Station: ' + this.stationName]; }
  buildGUI(win: any, P: HTMLElement) {
    const row = h('div', 'row', P);
    h('div', 'label', row, 'Station name');
    const inp = h('input', '', row) as HTMLInputElement;
    inp.value = this.stationName; inp.maxLength = 60; inp.style.flex = '1';
    const commit = () => { const v = inp.value.trim(); if (v) { this.stationName = v; win.setTitle?.(v); } else inp.value = this.stationName; };
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { commit(); inp.blur(); } e.stopPropagation(); });
    const lrow = h('div', 'row', P);
    const cb = h('input', '', lrow) as HTMLInputElement; cb.type = 'checkbox'; cb.checked = this.trainLimit >= 0;
    h('div', 'label', lrow, 'Train limit');
    const lim = h('input', '', lrow) as HTMLInputElement; lim.type = 'number'; lim.min = '0'; lim.style.width = '70px';
    lim.value = String(this.trainLimit >= 0 ? this.trainLimit : 1); lim.disabled = this.trainLimit < 0;
    cb.onchange = () => { lim.disabled = !cb.checked; this.trainLimit = cb.checked ? Math.max(0, parseInt(lim.value, 10) || 0) : -1; };
    lim.onchange = () => { if (cb.checked) this.trainLimit = Math.max(0, parseInt(lim.value, 10) || 0); };
    const info = h('div', 'mini-label', P);
    win.updaters?.push(() => {
      const bound = this.targets().length > 0;
      const n = G.game?.trains?.trainsHeadingTo?.(this);
      info.textContent = !bound ? 'Not connected to a rail' : typeof n === 'number' ? `Trains heading here: ${n}` : '';
    });
  }
  draw(r: Renderer, alt: boolean) {
    const a = r.atlas;
    r.draw('objects', a.get('train-stop-' + this.dir), this.x, this.y, WHITE, 0, 1, this.y + 0.4);
    r.draw('shadow', a.get('train-stop-' + this.dir + '-shadow'), this.x, this.y);
    const g = G.game;
    if (g && g.darkness > 0.05 && r.redirect === null) r.draw('light', a.get('light'), this.x, this.y - 0.3, additive(1, 0.9, 0.7, 0.9), 0, 8);
    if (alt || r.redirect) {
      const d = this.jd;
      r.draw(r.redirect ? 'top' : 'overlay', a.get('arrow'), this.jx - dirX(d) * 0.6, this.jy - dirY(d) * 0.6, rgba(1, 1, 1, 0.75), dirAngle(d), 0.8);
    }
  }
}
registerEntity(['train-stop'], TrainStop);

// ---------------------------------------------------------------- planner helpers
interface Spec {
  sh: Shape; ax: number; ay: number; key: number; dir: 0 | 1;
  sx: number; sy: number; sd: number;   // start joint + heading of this traversal
  ex: number; ey: number; ed: number;   // end joint + heading
}
const pieceKey = (ax: number, ay: number, id: number) => jointKey(ax, ay, 0) * 16 + id;
function specFor(ax: number, ay: number, id: number, dir: 0 | 1): Spec {
  const sh = SHAPES[id];
  const bx = ax + sh.bx, by = ay + sh.by;
  return dir === 0
    ? { sh, ax, ay, key: pieceKey(ax, ay, id), dir, sx: ax, sy: ay, sd: sh.ad, ex: bx, ey: by, ed: sh.bd }
    : { sh, ax, ay, key: pieceKey(ax, ay, id), dir, sx: bx, sy: by, sd: (sh.bd + 4) & 7, ex: ax, ey: ay, ed: (sh.ad + 4) & 7 };
}
/** The piece leaving joint (x, y) heading d: move 0 = straight, -1/+1 = curve left/right. */
function moveSpec(x: number, y: number, d: number, move: number): Spec {
  if (move === 0) {
    if (d < 4) return specFor(x, y, d, 0);
    const sh = SHAPES[d - 4];
    return specFor(x - sh.bx, y - sh.by, d - 4, 1);
  }
  if (!(d & 1)) return specFor(x, y, shapeIdOf(d, move), 0);
  const ad = (d + move + 4) & 7, id = shapeIdOf(ad, -move), sh = SHAPES[id];
  return specFor(x - sh.bx, y - sh.by, id, 1);
}

class Heap<T> {
  a: T[] = []; k: number[] = [];
  get size() { return this.a.length; }
  push(v: T, key: number) {
    const a = this.a, k = this.k; let i = a.length; a.push(v); k.push(key);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; a[i] = a[p]; k[i] = k[p]; i = p; }
    a[i] = v; k[i] = key;
  }
  pop(): T {
    const a = this.a, k = this.k, top = a[0];
    const v = a.pop()!, key = k.pop()!;
    if (a.length) {
      let i = 0; const n = a.length;
      for (;;) {
        let c = i * 2 + 1; if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= key) break;
        a[i] = a[c]; k[i] = k[c]; i = c;
      }
      a[i] = v; k[i] = key;
    }
    return top;
  }
}

interface PlanNode { x: number; y: number; d: number; g: number; parent: PlanNode | null; spec: Spec | null; }

// ---------------------------------------------------------------- the rail system
export class RailSystem {
  rails = new Set<RailPiece>();
  /** jointKey(x, y, d) → directed rails that start at joint (x, y) travelling in direction d. */
  entries = new Map<number, RailRef[]>();
  byKey = new Map<number, RailPiece>();
  tileCount = new Map<number, number>();
  chunkRails = new Map<number, RailPiece[]>();
  /** jointKey(x, y, d) → signal guarding trains travelling d through (x, y). */
  signals = new Map<number, RailSignal>();
  allSignals = new Set<RailSignal>();
  stops = new Set<TrainStop>();
  stopAtKey = new Map<number, TrainStop>();
  /** Bumped on any change to rails, signals or stops. */
  version = 0;
  /** Bumped every time blocks are rebuilt. */
  blockVersion = 0;
  blocks: RailBlock[] = [];
  private blocksDirty = true;
  /** Called after a rail has been removed from the network (rail.dead is true). */
  onRemoveHooks: ((rail: RailPiece) => void)[] = [];
  /** Called after any topology change (rail/signal/stop added or removed). */
  onChangeHooks: (() => void)[] = [];
  private frame = 0;
  // planner state
  private plan: { head: Joint | null; cands: Joint[]; pending: Spec[] } | null = null;
  private pv: { specs: Spec[]; ok: boolean[]; end: Joint | null } | null = null;
  private searchCache: { k: string; path: Spec[] | null } | null = null;
  private accPv: { proto: string; x: number; y: number; d: number; jx: number; jy: number; ok: boolean } | null = null;
  private accPreviewEnts = new Map<string, Entity>();

  onRemove(fn: (rail: RailPiece) => void) { this.onRemoveHooks.push(fn); }
  private changed() { this.version++; this.blocksDirty = true; for (const f of this.onChangeHooks) try { f(); } catch (e) { console.warn(e); } }

  // ---------------- registration ----------------
  addRail(r: RailPiece) {
    if (r.registered) return;
    r.registered = true;
    this.rails.add(r);
    this.byKey.set(pieceKey(r.ax, r.ay, r.shape.id), r);
    const sh = r.shape;
    this.addEntry(jointKey(r.ax, r.ay, sh.ad), r.refs[0]);
    this.addEntry(jointKey(r.bx, r.by, (sh.bd + 4) & 7), r.refs[1]);
    const ck = new Set<number>();
    for (let i = 0; i < sh.tiles.length; i += 2) {
      const tx = r.ax + sh.tiles[i], ty = r.ay + sh.tiles[i + 1];
      const k = tileKey(tx, ty);
      this.tileCount.set(k, (this.tileCount.get(k) || 0) + 1);
      ck.add(chunkKey(Math.floor(tx / CHUNK), Math.floor(ty / CHUNK)));
    }
    ck.add(chunkKey(Math.floor(r.x / CHUNK), Math.floor(r.y / CHUNK)));
    r.chunkKeys = [...ck];
    for (const k of r.chunkKeys) {
      let l = this.chunkRails.get(k); if (!l) this.chunkRails.set(k, l = []);
      l.push(r);
      const c = G.game?.world.chunks.get(k); if (c) c.mapDirty = true;
    }
    // overlapping / crossing rails
    const near = this.railsIn(r.ax + sh.x0 - 2, r.ay + sh.y0 - 2, r.ax + sh.x1 + 2, r.ay + sh.y1 + 2);
    for (const o of near) if (o !== r && railsConflict(r, o)) { r.conflicts.push(o); o.conflicts.push(r); }
    this.changed();
  }
  removeRail(r: RailPiece) {
    if (!r.registered) return;
    r.registered = false;
    this.rails.delete(r);
    if (this.byKey.get(pieceKey(r.ax, r.ay, r.shape.id)) === r) this.byKey.delete(pieceKey(r.ax, r.ay, r.shape.id));
    const sh = r.shape;
    this.delEntry(jointKey(r.ax, r.ay, sh.ad), r.refs[0]);
    this.delEntry(jointKey(r.bx, r.by, (sh.bd + 4) & 7), r.refs[1]);
    for (let i = 0; i < sh.tiles.length; i += 2) {
      const k = tileKey(r.ax + sh.tiles[i], r.ay + sh.tiles[i + 1]);
      const n = (this.tileCount.get(k) || 0) - 1;
      if (n > 0) this.tileCount.set(k, n); else this.tileCount.delete(k);
    }
    for (const k of r.chunkKeys) {
      const l = this.chunkRails.get(k);
      if (l) { const i = l.indexOf(r); if (i >= 0) { l[i] = l[l.length - 1]; l.pop(); } if (!l.length) this.chunkRails.delete(k); }
      const c = G.game?.world.chunks.get(k); if (c) c.mapDirty = true;
    }
    for (const o of r.conflicts) { const i = o.conflicts.indexOf(r); if (i >= 0) o.conflicts.splice(i, 1); }
    r.conflicts = [];
    r.block = null;
    this.changed();
    for (const f of this.onRemoveHooks) try { f(r); } catch (e) { console.warn(e); }
  }
  private addEntry(k: number, ref: RailRef) { let l = this.entries.get(k); if (!l) this.entries.set(k, l = []); l.push(ref); }
  private delEntry(k: number, ref: RailRef) {
    const l = this.entries.get(k); if (!l) return;
    const i = l.indexOf(ref); if (i >= 0) l.splice(i, 1);
    if (!l.length) this.entries.delete(k);
  }
  /** Used by save.ts when loading a rail entity. */
  restore(e: Entity, d: any) {
    const r = e as RailPiece;
    if (d?.g) r.setGeom(d.g[0], d.g[1], d.g[2]);
    G.game.addEntity(r);
  }
  addSignal(s: RailSignal) {
    if (s.registered || s.jd < 0) return;
    s.registered = true;
    this.allSignals.add(s);
    const k = jointKey(s.jx, s.jy, s.jd);
    if (!this.signals.has(k)) this.signals.set(k, s);
    this.changed();
  }
  removeSignal(s: RailSignal) {
    if (!s.registered) return;
    s.registered = false;
    this.allSignals.delete(s);
    const k = jointKey(s.jx, s.jy, s.jd);
    if (this.signals.get(k) === s) {
      this.signals.delete(k);
      for (const o of this.allSignals) if (o.jx === s.jx && o.jy === s.jy && o.jd === s.jd) { this.signals.set(k, o); break; }
    }
    s.block = s.blockBehind = null;
    this.changed();
  }
  addStop(t: TrainStop) {
    if (t.registered) return;
    t.registered = true;
    this.stops.add(t);
    const k = jointKey(t.jx, t.jy, t.jd);
    if (!this.stopAtKey.has(k)) this.stopAtKey.set(k, t);
    this.changed();
  }
  removeStop(t: TrainStop) {
    if (!t.registered) return;
    t.registered = false;
    this.stops.delete(t);
    const k = jointKey(t.jx, t.jy, t.jd);
    if (this.stopAtKey.get(k) === t) {
      this.stopAtKey.delete(k);
      for (const o of this.stops) if (jointKey(o.jx, o.jy, o.jd) === k) { this.stopAtKey.set(k, o); break; }
    }
    this.changed();
  }
  defaultStopName() {
    const used = new Set<string>();
    for (const s of this.stops) used.add(s.stationName);
    let n = 1;
    while (used.has('Stop ' + n)) n++;
    return 'Stop ' + n;
  }
  stopsNamed(name: string): TrainStop[] { const out: TrainStop[] = []; for (const s of this.stops) if (s.stationName === name) out.push(s); return out; }
  stationNames(): string[] { return [...new Set([...this.stops].map(s => s.stationName))].sort(); }

  // ---------------- graph queries ----------------
  /** Directed rails starting at joint (x, y) travelling d (i.e. what a train leaving that joint heading d can enter). */
  departures(x: number, y: number, d: number): RailRef[] { return this.entries.get(jointKey(x, y, d)) || EMPTY; }
  /** Directed rails whose traversal ends at joint (x, y) heading d. */
  arrivals(x: number, y: number, d: number): RailRef[] {
    const l = this.entries.get(jointKey(x, y, (d + 4) & 7));
    return l ? l.map(r => r.rail.refs[r.dir ^ 1]) : [];
  }
  /** Successors of a directed rail: the directed rails a train can continue onto at its exit. */
  next(rail: RailPiece, dir: 0 | 1): RailRef[] {
    const sh = rail.shape;
    return dir === 0 ? this.entries.get(jointKey(rail.bx, rail.by, sh.bd)) || EMPTY : this.entries.get(jointKey(rail.ax, rail.ay, (sh.ad + 4) & 7)) || EMPTY;
  }
  /** Predecessors of a directed rail (directed rails that lead into it). */
  prev(rail: RailPiece, dir: 0 | 1): RailRef[] {
    const sh = rail.shape;
    const l = dir === 0 ? this.entries.get(jointKey(rail.ax, rail.ay, (sh.ad + 4) & 7)) : this.entries.get(jointKey(rail.bx, rail.by, sh.bd));
    return l ? l.map(r => r.rail.refs[r.dir ^ 1]) : [];
  }
  /** Joint at the end of a directed rail. */
  exitOf(ref: RailRef): Joint { return ref.rail.exit(ref.dir); }
  entryOf(ref: RailRef): Joint { return ref.rail.entry(ref.dir); }
  /** Is there any rail end at (x, y) along the axis of direction d? */
  hasJoint(x: number, y: number, d: number) { return this.entries.has(jointKey(x, y, d)) || this.entries.has(jointKey(x, y, (d + 4) & 7)); }
  /** Signal facing trains travelling d through joint (x, y). */
  signalAt(x: number, y: number, d: number): RailSignal | null { return this.signals.get(jointKey(x, y, d)) || null; }
  /** Signal a train meets when leaving a directed rail (at its exit joint). */
  exitSignal(rail: RailPiece, dir: 0 | 1): RailSignal | null { const j = rail.exit(dir); return this.signals.get(jointKey(j.x, j.y, j.d)) || null; }
  /** Signal for the opposite direction at a directed rail's exit joint (a train entering the next block "against" it). */
  exitBackSignal(rail: RailPiece, dir: 0 | 1): RailSignal | null { const j = rail.exit(dir); return this.signals.get(jointKey(j.x, j.y, j.d + 4)) || null; }
  /** Train stop whose stop joint is (x, y) for travel direction d. */
  stopAt(x: number, y: number, d: number): TrainStop | null { return this.stopAtKey.get(jointKey(x, y, d)) || null; }
  /** Train stop at the exit of a directed rail (a train whose front reaches s = length is at the stop). */
  exitStop(rail: RailPiece, dir: 0 | 1): TrainStop | null { const j = rail.exit(dir); return this.stopAtKey.get(jointKey(j.x, j.y, j.d)) || null; }
  pieceAt(ax: number, ay: number, shapeId: number) { return this.byKey.get(pieceKey(ax, ay, shapeId)) || null; }

  /** Rails whose centerline bbox overlaps the rect. */
  railsIn(x0: number, y0: number, x1: number, y1: number): RailPiece[] {
    const out: RailPiece[] = [];
    const st = ++this.frame;
    const cx0 = Math.floor((x0 - 1) / CHUNK), cx1 = Math.floor((x1 + 1) / CHUNK), cy0 = Math.floor((y0 - 1) / CHUNK), cy1 = Math.floor((y1 + 1) / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const l = this.chunkRails.get(chunkKey(cx, cy));
      if (!l) continue;
      for (const r of l) {
        if (r.stamp === st) continue;
        r.stamp = st;
        const sh = r.shape;
        if (r.ax + sh.x1 + 1.4 < x0 || r.ax + sh.x0 - 1.4 > x1 || r.ay + sh.y1 + 1.4 < y0 || r.ay + sh.y0 - 1.4 > y1) continue;
        out.push(r);
      }
    }
    return out;
  }
  /** Rail under a world point (within 1 tile of its centerline), nearest first. */
  railAt(px: number, py: number): RailPiece | null {
    let best: RailPiece | null = null, bd = 1.0;
    for (const r of this.railsIn(px - 1, py - 1, px + 1, py + 1)) {
      const d = r.distTo(px, py);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }
  /** Nearest point on any rail centerline within maxDist: s is measured from end A (use dir 0 with pointAt). */
  project(px: number, py: number, maxDist = 2): { rail: RailPiece; s: number; dist: number; x: number; y: number; angle: number } | null {
    let best: any = null, bd = maxDist;
    for (const r of this.railsIn(px - maxDist, py - maxDist, px + maxDist, py + maxDist)) {
      const pts = r.shape.pts, n = r.shape.n, L = r.shape.len;
      for (let i = 0; i < n; i++) {
        const ax = pts[i * 2] + r.ax, ay = pts[i * 2 + 1] + r.ay, bx = pts[i * 2 + 2] + r.ax, by = pts[i * 2 + 3] + r.ay;
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(ax + dx * t - px, ay + dy * t - py);
        if (d < bd) { bd = d; best = { rail: r, s: (i + t) * L / n, dist: d }; }
      }
    }
    if (!best) return null;
    const p = best.rail.pointAt(best.s, 0);
    best.x = p.x; best.y = p.y; best.angle = p.angle;
    return best;
  }
  /** True if any rail passes through the tile rect (buildings cannot be placed there). */
  blocksArea(x0: number, y0: number, w: number, hh: number): boolean {
    if (!this.tileCount.size) return false;
    for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + w; x++) if (this.tileCount.has(tileKey(x, y))) return true;
    return false;
  }

  // ---------------- blocks ----------------
  /** Block containing a rail (blocks are rebuilt lazily after changes). */
  blockOf(rail: RailPiece): RailBlock | null { this.ensureBlocks(); return rail.block; }
  getBlocks(): RailBlock[] { this.ensureBlocks(); return this.blocks; }
  ensureBlocks() {
    if (!this.blocksDirty) return;
    this.blocksDirty = false;
    const list = [...this.rails];
    const par = new Int32Array(list.length);
    for (let i = 0; i < list.length; i++) { list[i].uf = i; par[i] = i; }
    const find = (i: number) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const uni = (a: number, b: number) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
    for (const [k, l] of this.entries) {
      for (let i = 1; i < l.length; i++) uni(l[0].rail.uf, l[i].rail.uf);
      const d = k & 7;
      if (d < 4) {
        const k2 = k + 4;
        const l2 = this.entries.get(k2);
        if (l2 && !this.signals.has(k) && !this.signals.has(k2)) uni(l[0].rail.uf, l2[0].rail.uf);
      }
    }
    for (const r of list) for (const o of r.conflicts) uni(r.uf, o.uf);
    const map = new Map<number, RailBlock>();
    this.blocks = [];
    let id = 1;
    for (const r of list) {
      const root = find(r.uf);
      let b = map.get(root);
      if (!b) { b = new RailBlock(id++); map.set(root, b); this.blocks.push(b); }
      b.rails.push(r); r.block = b;
    }
    for (const s of this.allSignals) {
      const ahead = this.entries.get(jointKey(s.jx, s.jy, s.jd));
      const behind = this.entries.get(jointKey(s.jx, s.jy, s.jd + 4));
      s.block = ahead ? ahead[0].rail.block : null;
      s.blockBehind = behind ? behind[0].rail.block : null;
      if (s.block && this.signals.get(jointKey(s.jx, s.jy, s.jd)) === s) s.block.signals.push(s);
    }
    this.blockVersion++;
  }

  // ---------------- path finding (for trains) ----------------
  /**
   * Shortest path over directed rails (Dijkstra). `starts` are directed rails with an initial cost (e.g. the
   * remaining length of the rail the train is on); `isGoal(ref)` marks goal rails (the path ends with that rail
   * fully traversed); `extraCost(ref)` can add penalties (occupied blocks, stations...). Returns the list of
   * directed rails from the start rail to the goal rail inclusive, or null.
   */
  findPath(starts: { ref: RailRef; cost: number }[], isGoal: (ref: RailRef) => boolean, extraCost?: (ref: RailRef) => number, maxNodes = 50000): RailRef[] | null {
    const heap = new Heap<{ ref: RailRef; g: number; parent: any }>();
    const best = new Map<RailRef, number>();
    for (const s of starts) { heap.push({ ref: s.ref, g: s.cost, parent: null }, s.cost); best.set(s.ref, s.cost); }
    let n = 0;
    while (heap.size && n++ < maxNodes) {
      const node = heap.pop();
      if ((best.get(node.ref) ?? Infinity) < node.g) continue;
      if (isGoal(node.ref)) {
        const out: RailRef[] = [];
        for (let p = node; p; p = p.parent) out.push(p.ref);
        return out.reverse();
      }
      for (const nx of this.next(node.ref.rail, node.ref.dir)) {
        const g = node.g + nx.rail.length + (extraCost ? extraCost(nx) : 0);
        if ((best.get(nx) ?? Infinity) <= g) continue;
        best.set(nx, g);
        heap.push({ ref: nx, g, parent: node }, g);
      }
    }
    return null;
  }

  // ---------------- rail planner ----------------
  /** Why a piece can't be placed (null = ok). Existing identical pieces count as ok. */
  private specBlocked(sp: Spec): string | null {
    if (this.byKey.has(sp.key)) return null;
    const w = G.game.world, t = sp.sh.tiles;
    for (let i = 0; i < t.length; i += 2) {
      const tx = sp.ax + t[i], ty = sp.ay + t[i + 1];
      const c = w.chunkAt(tx, ty);
      if (!c) return 'Ungenerated area';
      const ix = ((ty & 31) << 5) | (tx & 31);
      if (isWaterTile(c.tiles[ix])) return 'Cannot build on water';
      const o = c.occ[ix];
      if (o && o.type !== 'ghost' && o.type !== 'item-on-ground') return o.type === 'tree' ? 'Tree in the way' : o.type === 'simple-entity' ? 'Rock in the way' : (o.proto?.name || o.name) + ' in the way';
    }
    return null;
  }
  private specCenter(sp: Spec): [number, number] { return [sp.ax + (sp.sh.x0 + sp.sh.x1) / 2, sp.ay + (sp.sh.y0 + sp.sh.y1) / 2]; }
  private specReach(sp: Spec) { const p = G.game.player; const [cx, cy] = this.specCenter(sp); return p.canReach(cx, cy, p.reach + 3); }
  private specCost(sp: Spec) { return sp.sh.turn ? 4 : 1; }

  /** Straight piece under the cursor in the build orientation (buildDir 0 = N-S, 1 = NE-SW, 2 = E-W, 3 = NW-SE). */
  private cursorSpec(wx: number, wy: number, bd: number): Spec {
    const cx = 2 * Math.floor(wx / 2) + 1, cy = 2 * Math.floor(wy / 2) + 1;
    const u = wx - cx, v = wy - cy;
    let ax = cx, ay = cy + 1;
    switch (bd & 3) {
      case 0: ax = cx; ay = cy + 1; break;
      case 2: ax = cx - 1; ay = cy; break;
      case 1: if (u + v < 0) { ax = cx - 1; ay = cy; } else { ax = cx; ay = cy + 1; } break;
      case 3: if (u - v > 0) { ax = cx; ay = cy - 1; } else { ax = cx - 1; ay = cy; } break;
    }
    return specFor(ax, ay, bd & 3, 0);
  }
  /** Free rail end (exit with no continuation) near a point. */
  freeEndNear(px: number, py: number, rad: number): Joint | null {
    let best: Joint | null = null, bd = rad;
    for (const r of this.railsIn(px - rad, py - rad, px + rad, py + rad)) for (const dir of [0, 1] as const) {
      if (this.next(r, dir).length) continue;
      const j = r.exit(dir);
      const d = Math.hypot(j.x - px, j.y - py);
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  }
  /** A* over rail pieces from a head joint toward a target point. */
  private search(head: Joint, tx: number, ty: number): Spec[] | null {
    const ck = `${head.x},${head.y},${head.d}|${Math.round(tx * 2)},${Math.round(ty * 2)}|${this.version}`;
    if (this.searchCache && this.searchCache.k === ck) return this.searchCache.path;
    // snap onto a free rail end near the cursor (closing loops / joining tracks)
    const fe = this.freeEndNear(tx, ty, 2.5);
    let path: Spec[] | null = null;
    if (fe && !(fe.x === head.x && fe.y === head.y)) path = this.searchFrom(head, fe.x, fe.y, { x: fe.x, y: fe.y, d: (fe.d + 4) & 7 }, 5000);
    if (!path) path = this.searchFrom(head, tx, ty, null, 2500);
    this.searchCache = { k: ck, path };
    return path;
  }
  private searchFrom(head: Joint, tx: number, ty: number, goalJ: Joint | null, maxExp: number): Spec[] | null {
    const GOAL = goalJ ? 0 : 1.5;
    const d0 = Math.hypot(head.x - tx, head.y - ty);
    let path: Spec[] | null = null;
    if (d0 > GOAL) {
      const heap = new Heap<PlanNode>();
      const seen = new Map<number, number>();
      const okCache = new Map<number, boolean>();
      const start: PlanNode = { x: head.x, y: head.y, d: head.d, g: 0, parent: null, spec: null };
      heap.push(start, 0);
      let best = start, bestD = d0, goal: PlanNode | null = null, exp = 0;
      const limit = d0 + 30;
      while (heap.size && exp < maxExp) {
        const n = heap.pop();
        const dn = Math.hypot(n.x - tx, n.y - ty);
        if (goalJ ? n.x === goalJ.x && n.y === goalJ.y && n.d === goalJ.d : dn <= GOAL) { goal = n; break; }
        if (dn < bestD - 0.01) { bestD = dn; best = n; }
        exp++;
        for (let m = -1; m <= 1; m++) {
          const sp = moveSpec(n.x, n.y, n.d, m);
          if (Math.hypot(sp.ex - tx, sp.ey - ty) > limit) continue;
          let ok = okCache.get(sp.key);
          if (ok === undefined) { ok = this.specBlocked(sp) === null; okCache.set(sp.key, ok); }
          if (!ok) continue;
          const exists = this.byKey.has(sp.key);
          const g = n.g + sp.sh.len * (exists ? 0.7 : 1) + (sp.sh.turn ? 1.5 : 0);
          const k = jointKey(sp.ex, sp.ey, sp.ed);
          const prevG = seen.get(k);
          if (prevG !== undefined && prevG <= g) continue;
          seen.set(k, g);
          const hh = Math.max(0, Math.hypot(sp.ex - tx, sp.ey - ty) - GOAL);
          heap.push({ x: sp.ex, y: sp.ey, d: sp.ed, g, parent: n, spec: sp }, g + hh * 1.15);
        }
      }
      const end = goal || (!goalJ && bestD < d0 - 1 ? best : null);
      if (end && end !== start) {
        path = [];
        for (let p: PlanNode | null = end; p && p.spec; p = p.parent) path.push(p.spec);
        path.reverse();
      }
    }
    return path;
  }
  private headFor(wx: number, wy: number): Joint | null {
    const pl = this.plan;
    if (!pl) return null;
    if (pl.head) return pl.head;
    let best: Joint | null = null, bd = 0.5;
    for (const c of pl.cands) {
      const dot = (wx - c.x) * dirX(c.d) + (wy - c.y) * dirY(c.d);
      if (dot > bd) { bd = dot; best = c; }
    }
    return best;
  }
  private buildSpec(sp: Spec): RailPiece | string {
    const g = G.game;
    if (this.byKey.has(sp.key)) return this.byKey.get(sp.key)!;
    const why = this.specBlocked(sp);
    if (why) return why;
    if (!this.specReach(sp)) return 'Out of reach';
    const cost = this.specCost(sp);
    if (g.player.count('rail') < cost) return 'Not enough rails';
    // clear ghosts in the footprint
    const t = sp.sh.tiles;
    for (let i = 0; i < t.length; i += 2) {
      const o = g.world.occAt(sp.ax + t[i], sp.ay + t[i + 1]);
      if (o && o.type === 'ghost') g.removeEntity(o);
    }
    const e = createEntity(sp.sh.turn ? 'curved-rail' : 'straight-rail', 0, 0, 0) as RailPiece;
    e.setGeom(sp.ax, sp.ay, sp.sh.id);
    g.addEntity(e);
    this.takeRails(cost);
    return e;
  }
  private takeRails(n: number) {
    const p = G.game.player;
    let left = n;
    if (p.cursor && p.cursor.id === 'rail') { const k = Math.min(left, p.cursor.n); p.cursor.n -= k; left -= k; if (p.cursor.n <= 0) p.cursor = null; }
    if (left > 0) p.main.remove('rail', left);
    if (!p.cursor) { if (p.main.count('rail') > 0) p.selectItem('rail'); else p.cursorGhost = 'rail'; }
  }

  /** Rail planner: called by input on click (first) and while dragging with rails in the cursor. */
  buildAtCursor(wx: number, wy: number, buildDir: number, first: boolean) {
    const g = G.game;
    if (first) {
      this.plan = null;
      const fe = this.freeEndNear(wx, wy, 1.6);
      if (fe) { this.plan = { head: fe, cands: [], pending: [] }; return; }
      const sp = this.cursorSpec(wx, wy, buildDir);
      const res = this.buildSpec(sp);
      if (typeof res === 'string') {
        g.ui?.flyText(sp.ax + (sp.sh.x0 + sp.sh.x1) / 2, sp.ay + (sp.sh.y0 + sp.sh.y1) / 2, res, '#ff8a6a');
        g.sound.play('cannot-build', 0.5);
        return;
      }
      g.sound.play('build', 0.6, res.x, res.y);
      const b = specFor(sp.ax, sp.ay, sp.sh.id, 1);
      this.plan = { head: null, cands: [{ x: sp.ex, y: sp.ey, d: sp.ed }, { x: b.ex, y: b.ey, d: b.ed }], pending: [] };
      return;
    }
    const head = this.headFor(wx, wy);
    if (!head || !this.plan) return;
    const path = this.search(head, wx, wy) || [];
    this.plan.pending = path;
    // commit the settled part of the path; keep the last stretch flexible so the track can still turn toward the cursor
    let tail = 0;
    for (const sp of path) tail += sp.sh.len;
    let n = 0;
    for (const sp of path) { tail -= sp.sh.len; if (tail < PLAN_KEEP) break; n++; }
    if (n) this.commit(path.slice(0, n), head);
  }
  /** Build a planned path from `head`; advances the plan head past every piece that exists afterwards. */
  private commit(path: Spec[], head: Joint) {
    const g = G.game;
    let cur = head, built = 0, fail: string | null = null, last: RailPiece | null = null;
    for (const sp of path) {
      const existed = this.byKey.has(sp.key);
      const res = this.buildSpec(sp);
      if (typeof res === 'string') { fail = res; break; }
      if (!existed) { built++; last = res; }
      cur = { x: sp.ex, y: sp.ey, d: sp.ed };
    }
    if (this.plan && cur !== head) { this.plan.head = cur; this.plan.cands = []; this.plan.pending = []; }
    if (built && last) g.sound.play('build', 0.5, last.x, last.y);
    if (fail && fail !== 'Out of reach' && this.lastFail !== fail + cur.x + ',' + cur.y) {
      this.lastFail = fail + cur.x + ',' + cur.y;
      g.ui?.flyText(cur.x, cur.y, fail, '#ff8a6a');
      if (!built) g.sound.play('cannot-build', 0.5);
    }
  }
  /** End of a planner drag (pointer released): build the rest of the planned path. */
  finishDrag() {
    const pl = this.plan;
    this.plan = null;
    if (pl && pl.pending.length) {
      const head = pl.head || pl.cands[0];
      this.plan = pl;
      if (head) this.commit(pl.pending, head);
      this.plan = null;
    }
    this.lastFail = '';
  }
  private lastFail = '';

  /** Planner preview (drawn by RailSystem.draw); returns a Preview with no protoId so world-render draws nothing itself. */
  preview(wx: number, wy: number, buildDir: number): Preview {
    const input = G.game.ui?.input;
    if (!input?.leftDown && this.plan) this.finishDrag();
    const dragging = !!input?.leftDown && !!this.plan;
    const specs: Spec[] = [], ok: boolean[] = [];
    let end: Joint | null = null;
    if (dragging) {
      const head = this.headFor(wx, wy);
      const path = head ? this.search(head, wx, wy) : null;
      if (path && this.plan) this.plan.pending = path;
      let items = G.game.player.count('rail');
      if (path) for (const sp of path) {
        if (this.byKey.has(sp.key)) continue;
        const c = this.specCost(sp);
        const good = !this.specBlocked(sp) && this.specReach(sp) && items >= c;
        if (good) items -= c;
        specs.push(sp); ok.push(good);
      }
    } else {
      const fe = this.freeEndNear(wx, wy, 1.6);
      if (fe) end = fe;
      else {
        const sp = this.cursorSpec(wx, wy, buildDir);
        if (!this.byKey.has(sp.key)) { specs.push(sp); ok.push(!this.specBlocked(sp) && this.specReach(sp) && G.game.player.count('rail') >= 1); }
      }
    }
    this.pv = { specs, ok, end };
    return { x: wx, y: wy, dir: (buildDir & 3) as Dir, valid: ok.every(Boolean), extra: [] };
  }

  // ---------------- signals & stops placement ----------------
  isAccessory(proto: string) { return proto === 'rail-signal' || proto === 'rail-chain-signal' || proto === 'train-stop'; }
  /** Snap a signal / chain signal / train stop to the best slot beside a rail near the cursor. */
  snapAccessory(proto: string, wx: number, wy: number): { x: number; y: number; dir: Dir; flags: number; d: number; jx: number; jy: number; ok: boolean; reason?: string } | null {
    const stop = proto === 'train-stop';
    const R = stop ? 3 : 2.2;
    let best: any = null, bd = R;
    const seen = new Set<number>();
    for (const r of this.railsIn(wx - R - 2, wy - R - 2, wx + R + 2, wy + R + 2)) {
      if (stop && (r.isCurve || (r.shape.ad & 1))) continue;
      for (const [jx, jy, axis] of [[r.ax, r.ay, r.shape.ad & 3], [r.bx, r.by, r.shape.bd & 3]]) {
        for (const d of [axis, axis + 4]) {
          const k = jointKey(jx, jy, d);
          if (seen.has(k)) continue;
          seen.add(k);
          const off = stop ? STOP_OFFSET[d] : SIGNAL_OFFSET[d];
          const x = jx + off[0], y = jy + off[1];
          const dist = Math.hypot(x - wx, y - wy);
          if (dist < bd) { bd = dist; best = { x, y, d, jx, jy }; }
        }
      }
    }
    if (!best) return null;
    const dir = (best.d >> 1) as Dir;
    const flags = !stop && (best.d & 1) ? DIAG_FLAG : 0;
    const chk = G.game.world.canPlace(proto, best.x, best.y, dir);
    let ok = chk.ok, reason = chk.reason;
    if (ok && !stop && this.tileCount.has(tileKey(Math.floor(best.x), Math.floor(best.y)))) { ok = false; reason = 'Rail in the way'; }
    return { x: best.x, y: best.y, dir, flags, d: best.d, jx: best.jx, jy: best.jy, ok, reason };
  }
  previewAccessory(proto: string, wx: number, wy: number): Preview {
    const s = this.snapAccessory(proto, wx, wy);
    if (!s) {
      const x = Math.floor(wx) + (proto === 'train-stop' ? 1 : 0.5), y = Math.floor(wy) + (proto === 'train-stop' ? 1 : 0.5);
      this.accPv = { proto, x, y, d: -1, jx: 0, jy: 0, ok: false };
      return { x, y, dir: 0, valid: false, reason: 'Must be placed next to a rail', extra: [] };
    }
    const ok = s.ok;
    this.accPv = { proto, x: s.x, y: s.y, d: s.d, jx: s.jx, jy: s.jy, ok };
    return { x: s.x, y: s.y, dir: s.dir, valid: ok, reason: s.reason, extra: [] };
  }
  /** Place a signal / chain signal / train stop from the cursor (input.tryBuildAtCursor). */
  buildAccessory(proto: string, wx: number, wy: number, forceGhost = false) {
    const g = G.game, p = g.player;
    const s = this.snapAccessory(proto, wx, wy);
    const fail = (msg: string, x = wx, y = wy) => { g.ui?.flyText(x, y, msg, '#ff8a6a'); g.sound.play('cannot-build', 0.5); };
    if (!s) return fail('Must be placed next to a rail');
    if (!s.ok) return fail(s.reason || 'Cannot build here', s.x, s.y);
    const ghost = forceGhost || !p.cursor || !p.canReach(s.x, s.y);
    if (ghost) {
      const res = g.logistics?.placeGhost?.(proto, s.x, s.y, s.dir);
      if (res && res !== true) fail(res, s.x, s.y);
      return;
    }
    const e = g.buildEntity(proto, s.x, s.y, s.dir, { fromPlayer: true, flags: s.flags });
    if (typeof e === 'string') { if (e !== 'Already built') fail(e, s.x, s.y); return; }
    if (e instanceof RailSignal && (e.jx !== s.jx || e.jy !== s.jy || e.jd !== s.d)) e.setBinding(s.jx, s.jy, s.d);
    p.cursor!.n--;
    if (p.cursor!.n <= 0) { p.cursor = null; if (p.main.count(proto) > 0) p.selectItem(proto); else p.cursorGhost = proto; }
  }

  // ---------------- minimap ----------------
  /** Paint rail footprints of a chunk into its minimap image data (called from minimap chunkImage). */
  paintMap(c: Chunk, d: Uint8ClampedArray) {
    const l = this.chunkRails.get(chunkKey(c.cx, c.cy));
    if (!l) return;
    const bx = c.cx * CHUNK, by = c.cy * CHUNK;
    for (const r of l) {
      const t = r.shape.tiles;
      for (let i = 0; i < t.length; i += 2) {
        const x = r.ax + t[i] - bx, y = r.ay + t[i + 1] - by;
        if (x < 0 || y < 0 || x >= CHUNK || y >= CHUNK) continue;
        const k = (y * CHUNK + x) * 4;
        d[k] = 140; d[k + 1] = 140; d[k + 2] = 140;
      }
    }
  }

  // ---------------- rendering ----------------
  draw(r: Renderer, x0: number, y0: number, x1: number, y1: number) {
    const g = G.game;
    const list = this.railsIn(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
    if (list.length) this.drawRails(r, list, false);
    const cursor = g.player.cursorItem();
    const hand = cursor && g.ui?.input?.hasPointer ? cursor : null;
    // block colouring while holding signals / stops (like Factorio)
    if (hand === 'rail-signal' || hand === 'rail-chain-signal' || hand === 'train-stop') {
      this.ensureBlocks();
      const white = r.atlas.get('white');
      for (const rl of list) {
        const id = rl.block ? rl.block.id : 0;
        const hue = (id * 0.618034) % 1;
        const [cr, cg, cb] = hsv(hue, 0.75, 1);
        const pts = rl.shape.pts, col = rgba(cr, cg, cb, 0.55);
        for (let i = 0; i + 3 < pts.length; i += 2) r.line('overlay', white, rl.ax + pts[i], rl.ay + pts[i + 1], rl.ax + pts[i + 2], rl.ay + pts[i + 3], 0.32, col);
      }
      const ap = this.accPv;
      if (ap && ap.proto === hand) this.drawAccessoryPreview(r, ap);
    }
    if (hand === 'rail' && this.pv) {
      const pv = this.pv;
      const a = r.atlas;
      for (let i = 0; i < pv.specs.length; i++) {
        const sp = pv.specs[i];
        r.redirect = 'top';
        r.tint = pv.ok[i] ? rgba(0.45, 0.85, 1, 0.38) : rgba(1, 0.3, 0.25, 0.42);
        this.drawShape(r, sp.sh, sp.ax, sp.ay);
        r.redirect = null;
      }
      if (pv.end) {
        const e = pv.end;
        r.draw('top', a.get('arrow'), e.x + dirX(e.d) * 0.7, e.y + dirY(e.d) * 0.7, rgba(0.5, 1, 0.5, 0.85), dirAngle(e.d), 0.9);
      }
      if (pv.specs.length && this.plan) {
        const last = pv.specs[pv.specs.length - 1];
        r.draw('top', a.get('arrow'), last.ex, last.ey, rgba(1, 1, 1, 0.7), dirAngle(last.ed), 0.7);
      }
    }
  }
  private drawAccessoryPreview(r: Renderer, ap: { proto: string; x: number; y: number; d: number; jx: number; jy: number; ok: boolean }) {
    const a = r.atlas;
    let e = this.accPreviewEnts.get(ap.proto);
    if (!e) { e = createEntity(ap.proto, 0, 0, 0); this.accPreviewEnts.set(ap.proto, e); }
    e.x = ap.x; e.y = ap.y;
    const dd = ap.d < 0 ? 0 : ap.d;
    e.dir = (dd >> 1) as Dir;
    if (e instanceof RailSignal) { e.jx = ap.jx; e.jy = ap.jy; e.jd = dd; e.state = 'green'; }
    if (e instanceof TrainStop) { e.bind(); }
    r.redirect = 'top';
    r.tint = ap.ok ? rgba(0.55, 1, 0.55, 0.62) : rgba(1, 0.35, 0.3, 0.62);
    try { e.draw(r, true); } catch { /* best effort */ }
    r.redirect = null;
    r.drawRect('top', a.get('white'), ap.x, ap.y, e.w, e.h, ap.ok ? rgba(0.4, 1, 0.4, 0.14) : rgba(1, 0.3, 0.3, 0.2));
  }
  /** Draw a single shape at A in the current redirect/tint (used for planner ghosts). */
  private drawShape(r: Renderer, sh: Shape, ax: number, ay: number) {
    const a = r.atlas;
    const bed = a.get('rail-ballast'), tie = a.get('rail-tie2'), steel = a.get('rail-steel2');
    const B = sh.bed;
    for (let i = 0; i < B.length; i += 4) r.drawRect('ground', bed, ax + B[i], ay + B[i + 1], B[i + 2], 2.6, WHITE, B[i + 3]);
    const T = sh.ties;
    for (let i = 0; i < T.length; i += 3) r.drawRect('ground2', tie, ax + T[i], ay + T[i + 1], 1.6, 0.26, WHITE, T[i + 2]);
    for (const L of [sh.railL, sh.railR]) for (let i = 0; i + 3 < L.length; i += 2) r.line('ground2', steel, ax + L[i], ay + L[i + 1], ax + L[i + 2], ay + L[i + 3], 0.14);
  }
  private drawRails(r: Renderer, list: RailPiece[], ghost: boolean) {
    const a = r.atlas;
    const bed = a.get('rail-ballast'), tie = a.get('rail-tie2'), steel = a.get('rail-steel2'), white = a.get('white');
    if (!bed || !tie || !steel || !white) return;
    const tilePx = r.zoom / r.dpr;
    // 1) ballast
    for (const rl of list) {
      const B = rl.shape.bed, ax = rl.ax, ay = rl.ay;
      for (let i = 0; i < B.length; i += 4) r.drawRect('ground', bed, ax + B[i], ay + B[i + 1], B[i + 2], 2.6, WHITE, B[i + 3]);
    }
    // 2) sleepers
    if (tilePx >= 9) for (const rl of list) {
      const T = rl.shape.ties, ax = rl.ax, ay = rl.ay;
      for (let i = 0; i < T.length; i += 3) r.drawRect('ground2', tie, ax + T[i], ay + T[i + 1], 1.6, 0.26, WHITE, T[i + 2]);
    }
    // 3) steel rails (+ subtle shadow to the lower right)
    const shadowCol = rgba(0, 0, 0, 0.75);
    for (const rl of list) {
      const ax = rl.ax, ay = rl.ay;
      for (const L of [rl.shape.railL, rl.shape.railR]) for (let i = 0; i + 3 < L.length; i += 2) {
        const x1 = ax + L[i], y1 = ay + L[i + 1], x2 = ax + L[i + 2], y2 = ay + L[i + 3];
        r.line('ground2', steel, x1, y1, x2, y2, 0.14);
        if (tilePx >= 12) r.line('shadow', white, x1 + 0.07, y1 + 0.06, x2 + 0.07, y2 + 0.06, 0.12, shadowCol);
      }
    }
    void ghost;
  }
}
const EMPTY: RailRef[] = [];
const PLAN_KEEP = 14;     // planner keeps this much path length uncommitted while dragging

function hsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (i % 6) { case 0: return [v, t, p]; case 1: return [q, v, p]; case 2: return [p, v, t]; case 3: return [p, q, v]; case 4: return [t, p, v]; default: return [v, p, q]; }
}

// Segment-segment distance (0 if they intersect).
function segDist(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  const d1x = bx - ax, d1y = by - ay, d2x = dx - cx, d2y = dy - cy;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) > 1e-9) {
    const t = ((cx - ax) * d2y - (cy - ay) * d2x) / den, u = ((cx - ax) * d1y - (cy - ay) * d1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  const ps = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => {
    const ex = rx - qx, ey = ry - qy, l2 = ex * ex + ey * ey;
    let t = l2 > 0 ? ((px - qx) * ex + (py - qy) * ey) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(qx + ex * t - px, qy + ey * t - py);
  };
  return Math.min(ps(ax, ay, cx, cy, dx, dy), ps(bx, by, cx, cy, dx, dy), ps(cx, cy, ax, ay, bx, by), ps(dx, dy, ax, ay, bx, by));
}
/** Rails conflict (same block) when they cross or run closer than 1.2 tiles, unless they meet at a shared joint. */
function railsConflict(p: RailPiece, q: RailPiece): boolean {
  const pe = [[p.ax, p.ay, p.shape.ad & 3], [p.bx, p.by, p.shape.bd & 3]], qe = [[q.ax, q.ay, q.shape.ad & 3], [q.bx, q.by, q.shape.bd & 3]];
  for (const a of pe) for (const b of qe) if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) return false;
  const P = p.shape.pts, Q = q.shape.pts;
  for (let i = 0; i + 3 < P.length; i += 2) for (let j = 0; j + 3 < Q.length; j += 2) {
    if (segDist(p.ax + P[i], p.ay + P[i + 1], p.ax + P[i + 2], p.ay + P[i + 3], q.ax + Q[j], q.ay + Q[j + 1], q.ax + Q[j + 2], q.ay + Q[j + 3]) < 1.2) return true;
  }
  return false;
}
