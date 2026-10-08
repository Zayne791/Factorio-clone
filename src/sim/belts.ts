// Transport belt simulation: lanes with 1/256-tile positions, items spaced 64 apart (4 per lane per tile).
import { Entity, PHASE, registerEntity } from './entity';
import { G, DIRS, Dir, opposite, rotOffset } from '../core';
import type { Renderer } from '../engine/renderer';
import { rgba, WHITE } from '../engine/renderer';
import { BELT_FRAMES } from '../art/sprites-logistics';
import { Stack } from './inventory';

export const GAP = 64;
const LANE_OFF = 0.23;

export class Lane {
  len: number;
  pos: number[] = [];
  ids: string[] = [];
  next: Lane | null = null;
  nextEntry = 0;
  sideload = false;
  owner: BeltBase;
  k: number;          // 0 = left lane, 1 = right lane
  part = 0;           // for splitters: 0 input, 1 output; side index stored in `side`
  side = 0;
  depth = 0;
  constructor(owner: BeltBase, k: number, len: number) { this.owner = owner; this.k = k; this.len = len; }
  get speed() { return this.owner.speed; }
  get count() { return this.pos.length; }
  hasSpaceAt(p: number): boolean {
    for (let i = 0; i < this.pos.length; i++) if (Math.abs(this.pos[i] - p) < GAP) return false;
    if (p < GAP && this.owner.feedersEnd(this, p)) return false;
    if (this.next && !this.sideload && p > this.len - GAP) {
      const nl = this.next;
      if (nl.pos.length) { const q = nl.pos[nl.pos.length - 1]; if ((this.len - p) + (q - this.nextEntry) < GAP) return false; }
    }
    return true;
  }
  insertAt(p: number, id: string) {
    let i = 0;
    while (i < this.pos.length && this.pos[i] > p) i++;
    this.pos.splice(i, 0, p); this.ids.splice(i, 0, id);
    G.game.belts.wake(this);
  }
  removeAt(i: number): string {
    const id = this.ids[i];
    this.pos.splice(i, 1); this.ids.splice(i, 1);
    return id;
  }
  // Advance items one tick
  step() {
    const n = this.pos.length;
    if (n === 0) return;
    const sp = this.speed * this.owner.power;
    const pos = this.pos;
    let prevVirt: number;
    const next = this.next;
    // limit for the front item
    if (next && !this.owner.blockedOutput) {
      if (this.sideload) prevVirt = this.len + GAP;
      else if (next.pos.length) prevVirt = this.len + (next.pos[next.pos.length - 1] - this.nextEntry);
      else prevVirt = 1e9;
    } else prevVirt = this.owner.endStop(this) + GAP;
    let i = 0;
    while (i < pos.length) {
      let np = Math.min(pos[i] + sp, prevVirt - GAP);
      if (np < pos[i]) np = pos[i];
      if (i === 0 && next && np >= this.len && !this.owner.blockedOutput) {
        if (this.sideload) {
          if (next.hasSpaceAt(this.nextEntry)) {
            const id = this.removeAt(0);
            next.insertAt(this.nextEntry, id);
            prevVirt = this.len + GAP;
            continue;
          }
          np = Math.min(np, this.len);
        } else {
          const id = this.removeAt(0);
          const q = this.nextEntry + (np - this.len);
          next.insertAt(q, id);
          prevVirt = this.len + (q - this.nextEntry);
          continue;
        }
      }
      if (this.part === 0 && this.owner.type === 'splitter' && i === 0 && np >= this.len) {
        np = this.len;
      }
      pos[i] = np;
      prevVirt = np;
      i++;
    }
  }
  serialize() { return [this.pos.slice(), this.ids.slice()]; }
}

// Shared base for belt-like entities
export class BeltBase extends Entity {
  lanes: Lane[] = [];
  speed: number;
  tier: number;
  blockedOutput = false;
  get phase() { return PHASE.BELT; }
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.speed = this.proto.beltSpeed!;
    this.tier = this.proto.tier!;
  }
  endStop(l: Lane) { return l.len - 30; }
  feedersEnd(l: Lane, p: number): boolean { return false; }
  // The lanes items can enter when fed from neighbour `from` tile direction
  onPlaced() { G.game.belts.add(this); }
  onRemoved() { G.game.belts.remove(this); }
  contents(): Stack[] {
    const m = new Map<string, number>();
    for (const l of this.lanes) for (const id of l.ids) m.set(id, (m.get(id) || 0) + 1);
    return [...m].map(([id, n]) => ({ id, n }));
  }
  // world position of an item on a lane
  lanePos(l: Lane, p: number): [number, number] { return [this.x, this.y]; }
  laneVisible(l: Lane, p: number) { return true; }
  // lanes covering a world point (for inserters)
  lanesAt(px: number, py: number): Lane[] { return this.lanes; }
  // Lane for dropping at world point (nearest)
  dropLane(px: number, py: number, fromX: number, fromY: number): [Lane, number] | null { return null; }
  // pick nearest item on lanes covering point
  takeItemNear(px: number, py: number, filter?: (id: string) => boolean): string | null {
    let best: Lane | null = null, bi = -1, bd = 1e9;
    for (const l of this.lanesAt(px, py)) {
      for (let i = 0; i < l.pos.length; i++) {
        if (!this.laneVisible(l, l.pos[i])) continue;
        if (filter && !filter(l.ids[i])) continue;
        const [wx, wy] = this.lanePos(l, l.pos[i]);
        if (Math.abs(wx - px) > 0.55 || Math.abs(wy - py) > 0.55) continue;
        const d = Math.hypot(wx - px, wy - py);
        if (d < bd) { bd = d; best = l; bi = i; }
      }
    }
    if (!best) return null;
    return best.removeAt(bi);
  }
  peekItemNear(px: number, py: number, filter?: (id: string) => boolean): string | null {
    for (const l of this.lanesAt(px, py)) for (let i = 0; i < l.pos.length; i++) {
      if (!this.laneVisible(l, l.pos[i])) continue;
      if (filter && !filter(l.ids[i])) continue;
      const [wx, wy] = this.lanePos(l, l.pos[i]);
      if (Math.abs(wx - px) <= 0.55 && Math.abs(wy - py) <= 0.55) return l.ids[i];
    }
    return null;
  }
  serialize(): any { return { l: this.lanes.map(l => l.serialize()) }; }
  load(d: any) {
    if (!d?.l) return;
    d.l.forEach((ld: any, i: number) => { if (this.lanes[i]) { this.lanes[i].pos = ld[0]; this.lanes[i].ids = ld[1]; } });
  }
  drawItems(r: Renderer) {
    const atlas = r.atlas;
    for (const l of this.lanes) {
      for (let i = 0; i < l.pos.length; i++) {
        if (!this.laneVisible(l, l.pos[i])) continue;
        const [wx, wy] = this.lanePos(l, l.pos[i]);
        r.draw('beltItems', atlas.get('icon:' + l.ids[i]), wx, wy, WHITE, 0, 0.42);
      }
    }
  }
}

// Where does an item travelling in direction d from tile (x,y) go?
export interface FeedTarget { lanes: Lane[]; entry: number[]; sideload: boolean; }

function laneOffsetVec(d: number, k: number): [number, number] {
  // right vector of direction d
  const rv = DIRS[(d + 1) & 3];
  const s = k === 0 ? -LANE_OFF : LANE_OFF;
  return [rv[0] * s, rv[1] * s];
}

export class TransportBelt extends BeltBase {
  shape: 0 | 1 | 2 = 0; // 0 straight, 1 fed from left (curve), 2 fed from right
  hasInputBehind = false;
  hasOut = false;
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.lanes = [new Lane(this, 0, 256), new Lane(this, 1, 256)];
  }
  setShape(s: 0 | 1 | 2) {
    if (s === this.shape) return;
    const old = this.lanes.map(l => ({ pos: l.pos, ids: l.ids, len: l.len }));
    this.shape = s;
    const lens = s === 0 ? [256, 256] : s === 1 ? [106, 295] : [295, 106];
    this.lanes.forEach((l, i) => {
      l.len = lens[i];
      const f = lens[i] / old[i].len;
      l.pos = old[i].pos.map(p => p * f);
      // re-space
      for (let j = 1; j < l.pos.length; j++) if (l.pos[j] > l.pos[j - 1] - GAP) l.pos[j] = l.pos[j - 1] - GAP;
      const keep = l.pos.findIndex(p => p < 0);
      if (keep >= 0) { const drop = l.ids.splice(keep); l.pos.splice(keep); for (const id of drop) G.game.spillItem(this.x, this.y, id, 1); }
    });
  }
  lanePos(l: Lane, p: number): [number, number] {
    const d = this.dir;
    const t = Math.max(0, Math.min(1, p / l.len));
    if (this.shape === 0) {
      const f = DIRS[d];
      const [ox, oy] = laneOffsetVec(d, l.k);
      return [this.x + f[0] * (t - 0.5) + ox, this.y + f[1] * (t - 0.5) + oy];
    }
    // curve in local north-facing coords; fed from left (west): corner at (-0.5,-0.5)
    const left = this.shape === 1;
    const r = left ? (l.k === 0 ? 0.5 - LANE_OFF : 0.5 + LANE_OFF) : (l.k === 1 ? 0.5 - LANE_OFF : 0.5 + LANE_OFF);
    const phi = Math.PI / 2 * (1 - t);
    let lx = -0.5 + r * Math.cos(phi), ly = -0.5 + r * Math.sin(phi);
    if (!left) lx = -lx;
    const [rx, ry] = rotOffset(lx, ly, d);
    return [this.x + rx, this.y + ry];
  }
  dropLane(px: number, py: number, fromX: number, fromY: number): [Lane, number] | null {
    // Inserters drop onto the far lane; if parallel to the belt, onto the belt's right lane.
    const d = this.dir;
    const rv = DIRS[(d + 1) & 3], f = DIRS[d];
    const dx = fromX - this.x, dy = fromY - this.y;
    const side = dx * rv[0] + dy * rv[1];
    const along = dx * f[0] + dy * f[1];
    let k: number;
    if (this.shape !== 0) {
      const [ax, ay] = this.lanePos(this.lanes[0], this.lanes[0].len / 2);
      const [bx, by] = this.lanePos(this.lanes[1], this.lanes[1].len / 2);
      k = Math.hypot(ax - fromX, ay - fromY) > Math.hypot(bx - fromX, by - fromY) ? 0 : 1;
    } else if (Math.abs(along) > Math.abs(side)) k = 1;
    else k = side > 0 ? 0 : 1;
    const l = this.lanes[k];
    return [l, l.len / 2];
  }
  feedersEnd(l: Lane, p: number) { return false; }
  endStop(l: Lane) { return l.len - 30; }
  update() { }
  draw(r: Renderer) {
    const a = r.atlas;
    const t = G.game.renderTime;
    const f = Math.floor(t * this.speed * 60 / 256 * 64 * (BELT_FRAMES / 16)) % BELT_FRAMES;
    const fr = this.power > 0 ? f : 0;
    const rot = this.dir * Math.PI / 2;
    if (this.shape === 0) r.draw('ground', a.get(`belt-${this.tier}-s-${fr}`), this.x, this.y, WHITE, rot);
    else r.draw('ground', a.get(`belt-${this.tier}-c-${fr}`), this.x, this.y, WHITE, rot, 1, undefined, this.shape === 2);
    // caps
    if (!this.hasInputBehind && this.shape === 0) {
      const b = DIRS[opposite(this.dir)];
      r.draw('ground2', a.get(`belt-${this.tier}-cap`), this.x + b[0] * 0.5, this.y + b[1] * 0.5, WHITE, rot + Math.PI);
    }
    if (!this.hasOut) {
      const f2 = DIRS[this.dir];
      r.draw('ground2', a.get(`belt-${this.tier}-cap`), this.x + f2[0] * 0.5, this.y + f2[1] * 0.5, WHITE, rot);
    }
    this.drawItems(r);
  }
}

export class UndergroundBelt extends BeltBase {
  kind: 'in' | 'out' = 'in';
  partner: UndergroundBelt | null = null;
  dist = 0;
  hasInputBehind = true;
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.lanes = [new Lane(this, 0, 128), new Lane(this, 1, 128)];
  }
  // 'in': items flow from back (opposite dir) and dive at center. 'out': emerge at center and leave at front.
  lanePos(l: Lane, p: number): [number, number] {
    const f = DIRS[this.dir];
    const [ox, oy] = laneOffsetVec(this.dir, l.k);
    let along: number;
    if (this.kind === 'in') along = -0.5 + Math.min(p, 128) / 256;
    else along = p / 256;
    return [this.x + f[0] * along + ox, this.y + f[1] * along + oy];
  }
  laneVisible(l: Lane, p: number) { return this.kind === 'out' || p <= 128; }
  lanesAt() { return this.lanes; }
  endStop(l: Lane) { return this.kind === 'in' ? 128 - 40 : l.len - 30; }
  setPartner(pt: UndergroundBelt | null) {
    this.partner = pt;
    if (this.kind === 'in') {
      const newLen = pt ? 128 + 256 * this.dist : 128;
      for (const l of this.lanes) {
        l.len = newLen;
        if (!pt) {
          // items underground get dropped
          const idx = l.pos.findIndex(p => p <= 128);
          const cut = idx < 0 ? l.pos.length : idx;
          if (cut > 0) { const dropped = l.ids.splice(0, cut); l.pos.splice(0, cut); for (const id of dropped) G.game.spillItem(this.x, this.y, id, 1); }
        }
      }
    }
  }
  dropLane(px: number, py: number, fromX: number, fromY: number): [Lane, number] | null {
    const rv = DIRS[(this.dir + 1) & 3];
    const side = (fromX - this.x) * rv[0] + (fromY - this.y) * rv[1];
    const l = this.lanes[side > 0 ? 0 : 1];
    return [l, this.kind === 'in' ? 64 : 64];
  }
  draw(r: Renderer) {
    const a = r.atlas;
    const t = G.game.renderTime;
    const f = this.power > 0 ? Math.floor(t * this.speed * 60 / 256 * 64) % BELT_FRAMES : 0;
    const rot = this.dir * Math.PI / 2;
    // visible belt half
    const half = a.get(`belt-${this.tier}-h-${f}`);
    // 'h' sprite = bottom half visible (pointing north). For 'in', the visible half is the back (south when facing north).
    r.draw('ground', half, this.x, this.y, WHITE, this.kind === 'in' ? rot : rot + Math.PI);
    this.drawItems(r);
    r.draw('objects', a.get(`ug-${this.tier}-${this.kind}-${this.dir}`), this.x, this.y, WHITE, 0, 1, this.y - 0.2);
    r.draw('shadow', a.get(`ug-${this.tier}-${this.kind}-${this.dir}-shadow`), this.x, this.y);
  }
  serialize() { return { ...super.serialize(), k: this.kind }; }
  load(d: any) { if (d.k) this.kind = d.k; super.load(d); }
}

export class Splitter extends BeltBase {
  // lanes: [in0L,in0R,in1L,in1R,out0L,out0R,out1L,out1R]; side 0 = left half
  toggle = [0, 0];
  inToggle = [0, 0];
  outPriority: 'none' | 'left' | 'right' = 'none';
  inPriority: 'none' | 'left' | 'right' = 'none';
  filter: string | null = null;
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    for (let part = 0; part < 2; part++) for (let side = 0; side < 2; side++) for (let k = 0; k < 2; k++) {
      const l = new Lane(this, k, 128); l.part = part; l.side = side; this.lanes.push(l);
    }
  }
  lane(part: number, side: number, k: number) { return this.lanes[part * 4 + side * 2 + k]; }
  halfCenter(side: number): [number, number] {
    const rv = DIRS[(this.dir + 1) & 3];
    const s = side === 0 ? -0.5 : 0.5;
    return [this.x + rv[0] * s, this.y + rv[1] * s];
  }
  lanePos(l: Lane, p: number): [number, number] {
    const [cx, cy] = this.halfCenter(l.side);
    const f = DIRS[this.dir];
    const [ox, oy] = laneOffsetVec(this.dir, l.k);
    const along = l.part === 0 ? -0.5 + p / 256 : p / 256;
    return [cx + f[0] * along + ox, cy + f[1] * along + oy];
  }
  lanesAt(px: number, py: number) {
    const rv = DIRS[(this.dir + 1) & 3];
    const s = (px - this.x) * rv[0] + (py - this.y) * rv[1];
    const side = s < 0 ? 0 : 1;
    return this.lanes.filter(l => l.side === side);
  }
  dropLane(px: number, py: number, fromX: number, fromY: number): [Lane, number] | null { return null; }
  endStop(l: Lane) { return l.part === 0 ? 128 : l.len - 30; }
  // Route items from input lanes to output lanes (called after lanes stepped)
  route() {
    if (this.power <= 0) return;
    for (let k = 0; k < 2; k++) {
      const sides = this.inPriority === 'left' ? [0, 1] : this.inPriority === 'right' ? [1, 0] : (this.inToggle[k] ? [1, 0] : [0, 1]);
      for (const s of sides) {
        const inl = this.lane(0, s, k);
        if (!inl.pos.length || inl.pos[0] < 128) continue;
        const id = inl.ids[0];
        let order: number[];
        if (this.filter) {
          const pr = this.outPriority === 'right' ? 1 : 0;
          order = id === this.filter ? [pr] : [1 - pr];
        } else if (this.outPriority === 'left') order = [0, 1];
        else if (this.outPriority === 'right') order = [1, 0];
        else order = this.toggle[k] ? [1, 0] : [0, 1];
        for (const o of order) {
          const out = this.lane(1, o, k);
          if (out.pos.length === 0 || out.pos[out.pos.length - 1] >= GAP) {
            inl.removeAt(0);
            out.insertAt(0, id);
            if (!this.filter && this.outPriority === 'none') this.toggle[k] = o === 0 ? 1 : 0;
            if (this.inPriority === 'none') this.inToggle[k] = s === 0 ? 1 : 0;
            break;
          }
        }
      }
    }
  }
  draw(r: Renderer) {
    const a = r.atlas;
    const t = G.game.renderTime;
    const f = this.power > 0 ? Math.floor(t * this.speed * 60 / 256 * 64) % BELT_FRAMES : 0;
    const rot = this.dir * Math.PI / 2;
    for (const side of [0, 1]) {
      const [cx, cy] = this.halfCenter(side);
      r.draw('ground', a.get(`belt-${this.tier}-s-${f}`), cx, cy, WHITE, rot);
    }
    this.drawItems(r);
    r.draw('objects', a.get(`splitter-${this.tier}-${this.dir}`), this.x, this.y, WHITE, 0, 1, this.y);
    r.draw('shadow', a.get(`splitter-${this.tier}-${this.dir}-shadow`), this.x, this.y);
  }
  serialize() { return { ...super.serialize(), op: this.outPriority, ip: this.inPriority, f: this.filter }; }
  load(d: any) { super.load(d); this.outPriority = d.op || 'none'; this.inPriority = d.ip || 'none'; this.filter = d.f || null; }
}

registerEntity(['transport-belt'], TransportBelt);
registerEntity(['underground-belt'], UndergroundBelt);
registerEntity(['splitter'], Splitter);

// ---------------- Belt system: topology + ordered stepping ----------------
export class BeltSystem {
  belts = new Set<BeltBase>();
  lanes: Lane[] = [];
  dirty = true;
  splitters: Splitter[] = [];

  add(b: BeltBase) { this.belts.add(b); this.markDirtyAround(b); }
  remove(b: BeltBase) {
    this.belts.delete(b);
    if (b instanceof UndergroundBelt && b.partner) { const p = b.partner; b.partner = null; p.partner = null; }
    this.markDirtyAround(b);
  }
  markDirtyAround(b: Entity) { this.dirty = true; }
  wake(l: Lane) { }

  beltAt(x: number, y: number): BeltBase | null {
    const e = G.game.world.occAt(Math.floor(x), Math.floor(y));
    return e instanceof BeltBase ? e : null;
  }

  // Does entity e output into tile (tx,ty) travelling in direction d? Returns true for belts pointing at that tile.
  private outputsInto(e: BeltBase, tx: number, ty: number): Dir | -1 {
    if (e instanceof TransportBelt) {
      const f = DIRS[e.dir];
      if (Math.floor(e.x) + f[0] === tx && Math.floor(e.y) + f[1] === ty) return e.dir;
    } else if (e instanceof UndergroundBelt && e.kind === 'out') {
      const f = DIRS[e.dir];
      if (Math.floor(e.x) + f[0] === tx && Math.floor(e.y) + f[1] === ty) return e.dir;
    } else if (e instanceof Splitter) {
      const f = DIRS[e.dir];
      for (const side of [0, 1]) {
        const [cx, cy] = e.halfCenter(side);
        if (Math.floor(cx) + f[0] === tx && Math.floor(cy) + f[1] === ty) return e.dir;
      }
    }
    return -1;
  }

  rebuild() {
    this.dirty = false;
    const world = G.game.world;
    // 1. Underground pairing
    for (const b of this.belts) if (b instanceof UndergroundBelt) { b.partner = null; }
    for (const b of this.belts) {
      if (!(b instanceof UndergroundBelt) || b.kind !== 'in' || b.partner) continue;
      const f = DIRS[b.dir];
      const max = b.proto.ugMax!;
      let found: UndergroundBelt | null = null, dist = 0;
      for (let i = 1; i <= max; i++) {
        const e = world.occAt(Math.floor(b.x) + f[0] * i, Math.floor(b.y) + f[1] * i);
        if (e instanceof UndergroundBelt && e.name === b.name && e.dir === b.dir) {
          if (e.kind === 'out') { found = e; dist = i; }
          break;
        }
      }
      b.dist = dist;
      if (found && !found.partner) { b.setPartner(found); found.partner = b; } else b.setPartner(null);
    }
    // 2. Shapes for transport belts
    for (const b of this.belts) {
      if (!(b instanceof TransportBelt)) continue;
      const tx = Math.floor(b.x), ty = Math.floor(b.y);
      const back = DIRS[opposite(b.dir)], left = DIRS[(b.dir + 3) & 3], right = DIRS[(b.dir + 1) & 3];
      const feeds = (dx: number, dy: number) => { const e = this.beltAt(tx + dx, ty + dy); return e ? this.outputsInto(e, tx, ty) !== -1 : false; };
      const fb = feeds(back[0], back[1]), fl = feeds(left[0], left[1]), fr = feeds(right[0], right[1]);
      b.hasInputBehind = fb || (fl && fr);
      let shape: 0 | 1 | 2 = 0;
      if (!fb && fl && !fr) shape = 1;
      else if (!fb && fr && !fl) shape = 2;
      b.setShape(shape);
      if (shape !== 0) b.hasInputBehind = true;
    }
    // 3. Connections
    const allLanes: Lane[] = [];
    this.splitters = [];
    for (const b of this.belts) {
      for (const l of b.lanes) { l.next = null; l.sideload = false; l.nextEntry = 0; allLanes.push(l); }
      if (b instanceof Splitter) this.splitters.push(b);
    }
    for (const b of this.belts) {
      if (b instanceof TransportBelt) {
        b.hasOut = this.connectOutput(b.lanes, Math.floor(b.x), Math.floor(b.y), b.dir);
      } else if (b instanceof UndergroundBelt) {
        if (b.kind === 'in') {
          if (b.partner) { b.lanes[0].next = b.partner.lanes[0]; b.lanes[1].next = b.partner.lanes[1]; }
        } else this.connectOutput(b.lanes, Math.floor(b.x), Math.floor(b.y), b.dir);
      } else if (b instanceof Splitter) {
        for (const side of [0, 1]) {
          const [cx, cy] = b.halfCenter(side);
          this.connectOutput([b.lane(1, side, 0), b.lane(1, side, 1)], Math.floor(cx), Math.floor(cy), b.dir);
        }
      }
    }
    // 4. Order lanes downstream-first
    const depth = new Map<Lane, number>();
    const visit = (l: Lane): number => {
      if (depth.has(l)) return depth.get(l)!;
      depth.set(l, 0);
      let d = 0, cur = l.next, guard = 0;
      // iterative chain walk
      const chain: Lane[] = [l];
      while (cur && guard++ < 100000) {
        if (depth.has(cur)) { d = depth.get(cur)! + 1; break; }
        depth.set(cur, 0); chain.push(cur); cur = cur.next;
      }
      for (let i = chain.length - 1; i >= 0; i--) { depth.set(chain[i], d); d++; }
      return depth.get(l)!;
    };
    for (const l of allLanes) visit(l);
    // splitter input lanes must step before their outputs are filled? outputs are downstream: give inputs depth = max(out)+1
    for (const s of this.splitters) for (let side = 0; side < 2; side++) for (let k = 0; k < 2; k++) {
      const outD = Math.max(depth.get(s.lane(1, 0, k))!, depth.get(s.lane(1, 1, k))!);
      depth.set(s.lane(0, side, k), outD + 1);
    }
    allLanes.sort((a, b) => depth.get(a)! - depth.get(b)!);
    this.lanes = allLanes;
  }

  // Connect output lanes of a belt at tile (tx,ty) moving in dir d to whatever is in front.
  private connectOutput(lanes: Lane[], tx: number, ty: number, d: Dir): boolean {
    const f = DIRS[d];
    const nx = tx + f[0], ny = ty + f[1];
    const e = this.beltAt(nx, ny);
    if (!e) return false;
    if (e instanceof TransportBelt) {
      if (e.dir === opposite(d)) return false;
      // side of e we come from
      const relSide = ((d - e.dir) & 3); // 0 = from behind, 1 = we move right relative to e => we're on e's left side, 3 = on e's right side
      if (relSide === 0) { lanes[0].next = e.lanes[0]; lanes[1].next = e.lanes[1]; return true; }
      const fromLeft = relSide === 1;
      if ((fromLeft && e.shape === 1) || (!fromLeft && e.shape === 2)) {
        lanes[0].next = e.lanes[0]; lanes[1].next = e.lanes[1]; return true;
      }
      // sideload onto the near lane
      const target = fromLeft ? e.lanes[0] : e.lanes[1];
      // upstream lane of feeder enters early (68), downstream lane late (188)
      // Feeder moving in dir d onto e: which of feeder lanes is upstream wrt e? e's backward direction = opposite(e.dir).
      // Feeder's left lane is on the side of (d+3); it's upstream if (d+3) == opposite(e.dir)
      const leftIsUpstream = ((d + 3) & 3) === opposite(e.dir);
      lanes[0].next = target; lanes[1].next = target;
      lanes[0].sideload = lanes[1].sideload = true;
      lanes[0].nextEntry = leftIsUpstream ? 68 : 188;
      lanes[1].nextEntry = leftIsUpstream ? 188 : 68;
      if (target.len !== 256) { lanes[0].nextEntry *= target.len / 256; lanes[1].nextEntry *= target.len / 256; }
      return true;
    }
    if (e instanceof UndergroundBelt) {
      if (e.kind === 'in') {
        if (e.dir === d) { lanes[0].next = e.lanes[0]; lanes[1].next = e.lanes[1]; return true; }
        if (e.dir === opposite(d)) return false;
        const fromLeft = ((d - e.dir) & 3) === 1;
        const target = fromLeft ? e.lanes[0] : e.lanes[1];
        lanes[0].next = target; lanes[1].next = target; lanes[0].sideload = lanes[1].sideload = true;
        lanes[0].nextEntry = 40; lanes[1].nextEntry = 90;
        return true;
      } else {
        if (e.dir === d || e.dir === opposite(d)) return false;
        const fromLeft = ((d - e.dir) & 3) === 1;
        const target = fromLeft ? e.lanes[0] : e.lanes[1];
        lanes[0].next = target; lanes[1].next = target; lanes[0].sideload = lanes[1].sideload = true;
        lanes[0].nextEntry = 60; lanes[1].nextEntry = 60;
        return true;
      }
    }
    if (e instanceof Splitter) {
      if (e.dir !== d) return false;
      const rv = DIRS[(e.dir + 1) & 3];
      const s = (nx + 0.5 - e.x) * rv[0] + (ny + 0.5 - e.y) * rv[1];
      const side = s < 0 ? 0 : 1;
      lanes[0].next = e.lane(0, side, 0); lanes[1].next = e.lane(0, side, 1);
      return true;
    }
    return false;
  }

  tick() {
    if (this.dirty) this.rebuild();
    const lanes = this.lanes;
    for (let i = 0; i < lanes.length; i++) {
      const l = lanes[i];
      if (l.pos.length) l.step();
    }
    for (const s of this.splitters) s.route();
  }
}
