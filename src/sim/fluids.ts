// Fluid system (Factorio 2.0 style): connected pass-through boxes form segments that act as one vessel.
// Machine input/output boxes are ports exchanging fluid with their segment each tick.
import { Entity, PHASE, registerEntity } from './entity';
import { FluidBoxDef, FLUIDS } from '../data/protos';
import { G, Dir, DIRS, rotOffset, opposite, tileKey } from '../core';
import type { Renderer } from '../engine/renderer';
import { WHITE, rgba } from '../engine/renderer';

export class FluidBox {
  owner: Entity;
  def: FluidBoxDef;
  index: number;
  fluid: string | null = null;
  amount = 0;          // for ports (and cached share for pass boxes)
  temp = 15;
  segment: Segment | null = null;
  filter: string | null;
  linked = false;      // has at least one connection
  conns: { tx: number; ty: number; dir: number; nx: number; ny: number; ug: boolean; other: FluidBox | null }[] = [];
  constructor(owner: Entity, def: FluidBoxDef, index: number) {
    this.owner = owner; this.def = def; this.index = index; this.filter = def.filter ?? null;
  }
  get volume() { return this.def.volume; }
  get kind() { return this.def.kind; }
  get space() { return this.volume - this.amount; }
  // Effective content (for pass boxes, share of segment)
  get content(): number { return this.def.kind === 'pass' && this.segment ? this.segment.fill * this.volume : this.amount; }
  get contentFluid(): string | null { return this.def.kind === 'pass' && this.segment ? this.segment.fluid : this.fluid; }
  computeConns() {
    const e = this.owner;
    this.conns = [];
    for (const c of this.def.conns) {
      const [rx, ry] = rotOffset(c.x, c.y, e.dir);
      const tx = Math.floor(e.x + rx), ty = Math.floor(e.y + ry);
      let d = (c.dir + e.dir) & 3;
      if ((e.flags & 1) && (d === 1 || d === 3)) d = (d + 2) & 3;
      this.conns.push({ tx, ty, dir: d, nx: tx + DIRS[d][0], ny: ty + DIRS[d][1], ug: !!c.underground, other: null });
    }
  }
}

export class Segment {
  boxes: FluidBox[] = [];
  ports: FluidBox[] = [];
  fluid: string | null = null;
  amount = 0;
  capacity = 0;
  temp = 15;
  get fill() { return this.capacity > 0 ? this.amount / this.capacity : 0; }
  get space() { return Math.max(0, this.capacity - this.amount); }
  add(fluid: string, n: number, temp: number): number {
    if (this.fluid && this.fluid !== fluid && this.amount > 0.001) return 0;
    const k = Math.min(n, this.space);
    if (k <= 0) return 0;
    this.temp = this.amount + k > 0 ? (this.temp * this.amount + temp * k) / (this.amount + k) : temp;
    this.fluid = fluid;
    this.amount += k;
    return k;
  }
  take(n: number): number {
    const k = Math.min(n, this.amount);
    this.amount -= k;
    if (this.amount < 1e-6) { this.amount = 0; }
    return k;
  }
}

// Entities that own fluid boxes implement this
export interface FluidOwner { fluidBoxes: FluidBox[]; }

export class FluidSystem {
  owners = new Set<Entity & FluidOwner>();
  segments: Segment[] = [];
  ports: FluidBox[] = [];
  dirty = true;
  add(e: Entity & FluidOwner) { this.owners.add(e); this.dirty = true; }
  remove(e: Entity & FluidOwner) {
    this.owners.delete(e);
    // spill fluid back into connected segment(s) proportionally: simply drop it
    this.dirty = true;
  }
  boxAtTile(tx: number, ty: number): FluidBox[] {
    const e = G.game.world.occAt(tx, ty) as any;
    if (!e || !e.fluidBoxes) return [];
    return e.fluidBoxes;
  }
  rebuild() {
    this.dirty = false;
    // preserve pass box amounts
    for (const s of this.segments) for (const b of s.boxes) { b.amount = s.capacity > 0 ? s.amount * b.volume / s.capacity : 0; b.fluid = s.fluid; b.temp = s.temp; }
    const all: FluidBox[] = [];
    for (const e of this.owners) for (const b of e.fluidBoxes) { b.computeConns(); b.segment = null; b.linked = false; all.push(b); }
    // connect
    const byTile = new Map<number, FluidBox[]>();
    for (const b of all) for (const c of b.conns) {
      const k = tileKey(c.tx, c.ty);
      let arr = byTile.get(k); if (!arr) byTile.set(k, arr = []);
      if (!arr.includes(b)) arr.push(b);
    }
    for (const b of all) for (const c of b.conns) {
      c.other = null;
      if (c.ug) {
        // underground: find partner pipe-to-ground
        const e = b.owner;
        const max = e.proto.ugMax ?? 11;
        for (let i = 1; i < max; i++) {
          const tx = c.tx + DIRS[c.dir][0] * i, ty = c.ty + DIRS[c.dir][1] * i;
          const cand = byTile.get(tileKey(tx, ty));
          if (!cand) continue;
          const o = cand.find(x => x.owner.name === e.name && x.conns.some(cc => cc.ug && cc.dir === opposite(c.dir)));
          if (o) { c.other = o; break; }
          const blocker = cand.find(x => x.owner.name === e.name);
          if (blocker) break;
        }
        continue;
      }
      const cand = byTile.get(tileKey(c.nx, c.ny));
      if (!cand) continue;
      for (const o of cand) {
        if (o === b) continue;
        if (o.conns.some(cc => !cc.ug && cc.tx === c.nx && cc.ty === c.ny && cc.nx === c.tx && cc.ny === c.ty)) { c.other = o; break; }
      }
    }
    // union pass boxes
    const parent = new Map<FluidBox, FluidBox>();
    const find = (x: FluidBox): FluidBox => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; let y = x; while (parent.get(y) !== r) { const n = parent.get(y)!; parent.set(y, r); y = n; } return r; };
    for (const b of all) parent.set(b, b);
    for (const b of all) for (const c of b.conns) {
      if (!c.other) continue;
      b.linked = true; c.other.linked = true;
      if (b.kind === 'pass' && c.other.kind === 'pass') parent.set(find(b), find(c.other));
    }
    const segs = new Map<FluidBox, Segment>();
    this.segments = [];
    for (const b of all) {
      if (b.kind !== 'pass') continue;
      const r = find(b);
      let s = segs.get(r);
      if (!s) { s = new Segment(); segs.set(r, s); this.segments.push(s); }
      s.boxes.push(b); s.capacity += b.volume;
    }
    // aggregate fluid amounts
    for (const s of this.segments) {
      const byFluid = new Map<string, number>();
      let tempSum = 0, tot = 0;
      for (const b of s.boxes) if (b.fluid && b.amount > 0) { byFluid.set(b.fluid, (byFluid.get(b.fluid) || 0) + b.amount); tempSum += b.temp * b.amount; tot += b.amount; }
      let best: string | null = null, bn = 0;
      for (const [f, n] of byFluid) if (n > bn) { bn = n; best = f; }
      s.fluid = best; s.amount = Math.min(bn, s.capacity); s.temp = tot > 0 ? tempSum / tot : 15;
      for (const b of s.boxes) { b.segment = s; if (b.filter && !s.fluid) s.fluid = null; }
    }
    // ports
    this.ports = [];
    for (const b of all) {
      if (b.kind === 'pass') continue;
      for (const c of b.conns) {
        if (!c.other) continue;
        if (c.other.kind === 'pass') { b.segment = c.other.segment; break; }
        // direct port-to-port: virtual segment
        if (!c.other.segment) {
          const s = new Segment(); s.capacity = Math.min(b.volume, c.other.volume) * 0.5;
          this.segments.push(s); c.other.segment = s; b.segment = s;
        } else b.segment = c.other.segment;
        break;
      }
      if (b.segment) { this.ports.push(b); b.segment.ports.push(b); }
    }
    for (const e of this.owners) (e as any).onFluidRebuild?.();
  }
  tick() {
    if (this.dirty) this.rebuild();
    for (const p of this.ports) {
      const s = p.segment!;
      if (p.kind === 'output') {
        if (p.amount <= 0 || !p.fluid) continue;
        if (s.fluid && s.fluid !== p.fluid && s.amount > 0.01) continue;
        const rate = 100 * (1 - s.fill * 0.6);
        const k = Math.min(p.amount, s.space, rate);
        if (k > 0) { s.add(p.fluid, k, p.temp); p.amount -= k; if (p.amount < 1e-6) { p.amount = 0; } }
      } else {
        const want = p.filter || (p as any).wantFluid;
        if (!s.fluid || s.amount <= 0) continue;
        if (want && s.fluid !== want) continue;
        if (p.fluid && p.fluid !== s.fluid && p.amount > 0.01) continue;
        const rate = 100 * Math.min(1, 0.3 + s.fill);
        const k = Math.min(p.space, s.amount, rate);
        if (k > 0) {
          p.temp = p.amount + k > 0 ? (p.temp * p.amount + s.temp * k) / (p.amount + k) : s.temp;
          p.fluid = s.fluid; s.take(k); p.amount += k;
        }
      }
    }
    // reset fluid type of empty segments (no filters)
    for (const s of this.segments) if (s.amount <= 0.0001 && s.boxes.length && !s.boxes.some(b => b.filter)) s.fluid = null;
  }
  // Fluid mixing check for placement: would placing entity e connect segments with different fluids?
  wouldMix(e: Entity & FluidOwner): string | null {
    const fluids = new Set<string>();
    for (const b of e.fluidBoxes) {
      b.computeConns();
      for (const c of b.conns) {
        if (c.ug) continue;
        for (const o of this.boxAtTile(c.nx, c.ny)) {
          if (!o.conns.length) o.computeConns();
          if (!o.conns.some(cc => cc.tx === c.nx && cc.ty === c.ny && cc.nx === c.tx && cc.ny === c.ty)) continue;
          const f = o.contentFluid || o.filter;
          if (f && o.content > 0.1 || o.filter) { if (b.kind === 'pass' || !b.filter) fluids.add(o.content > 0.1 ? o.contentFluid! : o.filter!); }
        }
      }
    }
    // filtered boxes in the entity itself
    for (const b of e.fluidBoxes) if (b.filter && b.kind === 'pass') fluids.add(b.filter);
    const real = [...fluids].filter(Boolean);
    if (e.type === 'pipe' || e.type === 'pipe-to-ground' || e.type === 'storage-tank') {
      if (new Set(real).size > 1) return 'Cannot mix fluids';
    }
    return null;
  }
}

// ---------------- Pipe-like entities ----------------
export class Pipe extends Entity implements FluidOwner {
  fluidBoxes: FluidBox[];
  mask = 0;
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.fluidBoxes = this.proto.fluidBoxes!.map((fb, i) => new FluidBox(this, fb, i));
  }
  onPlaced() { G.game.fluids.add(this); }
  onRemoved() { G.game.fluids.remove(this); }
  onFluidRebuild() {
    this.mask = 0;
    for (const c of this.fluidBoxes[0].conns) if (c.other && !c.ug) this.mask |= 1 << c.dir;
  }
  draw(r: Renderer, alt: boolean) {
    const a = r.atlas;
    if (this.type === 'pipe-to-ground') {
      r.draw('objects', a.get(`pipe-to-ground-${this.dir}`), this.x, this.y, WHITE, 0, 1, this.y - 0.3);
      r.draw('shadow', a.get(`pipe-to-ground-${this.dir}-shadow`), this.x, this.y);
    } else {
      r.draw('objects', a.get(`pipe-${this.mask}`), this.x, this.y, WHITE, 0, 1, this.y - 0.3);
      r.draw('shadow', a.get(`pipe-${this.mask}-shadow`), this.x, this.y);
    }
    const b = this.fluidBoxes[0];
    const f = b.contentFluid;
    if (f && b.content > 0.5 && (this.mask === 5 || this.mask === 10)) {
      const c = FLUIDS[f].color;
      const lvl = Math.min(1, b.content / b.volume);
      const horiz = this.mask === 10;
      r.drawRect('high', a.get('white'), this.x, this.y, horiz ? 0.18 : 0.12, horiz ? 0.12 : 0.18, rgba(c[0] * 1.2, c[1] * 1.2, c[2] * 1.2, 0.35 + 0.6 * lvl), 0, this.y);
    }
  }
  description() { const b = this.fluidBoxes[0]; return b.contentFluid ? [`${FLUIDS[b.contentFluid].name}: ${b.content.toFixed(1)}/${b.volume}`] : ['Empty']; }
}

export class StorageTank extends Pipe {
  draw(r: Renderer, alt: boolean) {
    const a = r.atlas;
    const v = this.dir & 1;
    r.draw('objects', a.get(`storage-tank-${v}`), this.x, this.y, WHITE, 0, 1, this.y);
    r.draw('shadow', a.get(`storage-tank-${v}-shadow`), this.x, this.y);
    const b = this.fluidBoxes[0];
    if (alt && b.contentFluid) {
      const c = FLUIDS[b.contentFluid].color;
      const lvl = b.content / b.volume;
      r.drawRect('overlay', a.get('white'), this.x, this.y + 0.9, 1.6, 0.18, rgba(0, 0, 0, 0.7));
      r.drawRect('overlay', a.get('white'), this.x - 0.8 + 0.8 * lvl, this.y + 0.9, 1.6 * lvl, 0.14, rgba(c[0], c[1], c[2], 1));
    }
  }
}

export class Pump extends Entity implements FluidOwner {
  fluidBoxes: FluidBox[];
  get phase() { return PHASE.MACHINE; }
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.fluidBoxes = this.proto.fluidBoxes!.map((fb, i) => new FluidBox(this, fb, i));
  }
  onPlaced() { G.game.fluids.add(this); }
  onRemoved() { G.game.fluids.remove(this); }
  update() {
    const [inp, out] = this.fluidBoxes;
    const working = this.active && inp.amount > 0 && out.space > 0;
    this.demand = working ? this.proto.energy! / 60 : 0;
    if (!working || this.power <= 0) return;
    if (out.fluid && out.fluid !== inp.fluid && out.amount > 0.01) return;
    const k = Math.min(20 * this.power, inp.amount, out.space);
    out.temp = inp.temp; out.fluid = inp.fluid; out.amount += k; inp.amount -= k;
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get(`pump-${this.dir}`), this.x, this.y, WHITE, 0, 1, this.y);
    r.draw('shadow', a.get(`pump-${this.dir}-shadow`), this.x, this.y);
  }
}

export class OffshorePump extends Entity implements FluidOwner {
  fluidBoxes: FluidBox[];
  get phase() { return PHASE.MACHINE; }
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.fluidBoxes = this.proto.fluidBoxes!.map((fb, i) => new FluidBox(this, fb, i));
  }
  onPlaced() { G.game.fluids.add(this); }
  onRemoved() { G.game.fluids.remove(this); }
  update() {
    if (!this.active) return;
    const b = this.fluidBoxes[0];
    const k = Math.min(20, b.space);
    if (k > 0) { b.fluid = 'water'; b.temp = 15; b.amount += k; G.game.stats.produce('water', k); }
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get(`offshore-pump-${this.dir}`), this.x, this.y, WHITE, 0, 1, this.y);
    r.draw('shadow', a.get(`offshore-pump-${this.dir}-shadow`), this.x, this.y);
  }
}

registerEntity(['pipe', 'pipe-to-ground'], Pipe);
registerEntity(['storage-tank'], StorageTank);
registerEntity(['pump'], Pump);
registerEntity(['offshore-pump'], OffshorePump);
