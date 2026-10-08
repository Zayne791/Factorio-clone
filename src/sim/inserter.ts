// Inserters: swing arm moving items between belts, machines, chests and the ground.
import { Entity, PHASE, registerEntity, Burner } from './entity';
import { BeltBase, TransportBelt } from './belts';
import { G, Dir, DIRS } from '../core';
import { ITEMS } from '../data/protos';
import type { Renderer } from '../engine/renderer';
import { WHITE, rgba } from '../engine/renderer';
import { Stack } from './inventory';

const S_PICK = 0, S_TO_DROP = 1, S_DROP = 2, S_TO_PICK = 3;

export class Inserter extends Entity {
  state = S_PICK;
  angle = 0;          // 0 at pickup, PI at drop
  hand: Stack | null = null;
  halfTicks: number;
  burner: Burner | null = null;
  filters: string[] = [];
  filterMode: 'whitelist' | 'blacklist' = 'whitelist';
  useFilters = false;
  stackOverride = 0;
  waitTicks = 0;
  pickX = 0; pickY = 0; dropX = 0; dropY = 0;
  idleTicks = 0;
  get phase() { return PHASE.INSERTER; }
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    const rs = this.proto.rotSpeed!;
    this.halfTicks = this.name === 'long-handed-inserter' ? 24 : Math.floor(0.5 / rs);
    if (this.proto.source === 'burner') this.burner = new Burner(1);
    this.updatePositions();
  }
  updatePositions() {
    const [px, py] = this.local(this.proto.pickup![0], this.proto.pickup![1]);
    const [dx, dy] = this.local(this.proto.drop![0], this.proto.drop![1]);
    this.pickX = px; this.pickY = py; this.dropX = dx; this.dropY = dy;
  }
  get handSize(): number {
    const g = G.game;
    let n = this.proto.bulk ? 2 + g.bonus.bulkInserterCapacity : 1 + g.bonus.inserterCapacity;
    if (this.stackOverride > 0) n = Math.min(n, this.stackOverride);
    return n;
  }
  inventories() { return this.burner ? [this.burner.fuel] : []; }
  contents(): Stack[] { const c = super.contents(); if (this.hand) c.push({ ...this.hand }); return c; }
  wantsFuel(id: string) { return this.burner ? this.burner.wantsFuel(id) : 0; }
  insertItem(id: string, n: number, src: any): number {
    if (this.burner && this.burner.isFuel(id)) return this.burner.fuel.insert(id, n);
    return 0;
  }

  private target(x: number, y: number): Entity | null {
    return G.game.world.occAt(Math.floor(x), Math.floor(y));
  }
  private passesFilter(id: string): boolean {
    if (!this.useFilters || !this.proto.filterable) return true;
    const inList = this.filters.includes(id);
    return this.filterMode === 'whitelist' ? inList : !inList;
  }

  // Energy for this tick; returns speed factor
  private energy(moving: boolean): number {
    if (this.burner) {
      if (!moving) return 1;
      const need = this.proto.energy! / 60;
      const got = this.burner.consume(need);
      if (got < 1 && this.hand && this.burner.isFuel(this.hand.id) && this.burner.fuel.space(this.hand.id) > 0) {
        // leech fuel from hand
        this.burner.fuel.insert(this.hand.id, 1);
        this.hand.n--; if (this.hand.n <= 0) this.hand = null;
      }
      return got;
    }
    const drain = (this.proto.drain ?? 0) / 60;
    this.demand = drain + (moving ? this.proto.energy! / 60 : 0);
    return this.power;
  }

  update() {
    if (!this.active) { this.energy(false); return; }
    const step = Math.PI / this.halfTicks;
    switch (this.state) {
      case S_PICK: {
        this.energy(false);
        if (this.burner && !this.burner.hasFuel && !this.tryPickFuelForSelf()) { this.warnIcon = 'warn-no-fuel'; return; }
        this.warnIcon = this.burner && !this.burner.hasFuel ? 'warn-no-fuel' : null;
        if (this.power < 0.05 && !this.burner) { this.status = 'no-power'; return; }
        if (this.tryPickup()) {
          // continue gathering for bulk from belts
          const src = this.target(this.pickX, this.pickY);
          if (this.hand && this.hand.n < this.handSize && src instanceof BeltBase && this.waitTicks < 18) { this.waitTicks++; return; }
          this.waitTicks = 0;
          this.state = S_TO_DROP;
        } else if (this.hand) {
          if (this.waitTicks++ > 18) { this.waitTicks = 0; this.state = S_TO_DROP; }
        } else this.status = 'waiting-source';
        break;
      }
      case S_TO_DROP: {
        const f = this.energy(true);
        this.angle += step * f;
        if (this.angle >= Math.PI) { this.angle = Math.PI; this.state = S_DROP; }
        break;
      }
      case S_DROP: {
        this.energy(false);
        if (this.tryDrop()) { this.state = S_TO_PICK; }
        else this.status = 'waiting-target';
        break;
      }
      case S_TO_PICK: {
        const f = this.energy(true);
        this.angle -= step * f;
        if (this.angle <= 0) { this.angle = 0; this.state = S_PICK; }
        break;
      }
    }
  }

  private tryPickFuelForSelf(): boolean {
    // burner inserter with no fuel can grab fuel from pickup to refuel itself
    if (!this.burner || this.hand) return false;
    const src = this.target(this.pickX, this.pickY);
    if (!src) return false;
    let got: Stack | null = null;
    if (src instanceof BeltBase) { const id = src.takeItemNear(this.pickX, this.pickY, i => this.burner!.isFuel(i)); if (id) got = { id, n: 1 }; }
    else got = src.takeOutput(1, i => this.burner!.isFuel(i));
    if (got) { this.burner.fuel.insert(got.id, got.n); return true; }
    return false;
  }

  // Decide what the drop target accepts
  private acceptFilter(): ((id: string) => boolean) {
    const t = this.target(this.dropX, this.dropY);
    if (!t || t instanceof BeltBase || t.type === 'container' || t.type === 'item-on-ground' || t.type === 'cargo-wagon' || t.type === 'car') {
      if (t && (t.type === 'container' || t.type === 'cargo-wagon' || t.type === 'car')) return id => this.passesFilter(id) && t.wants(id) > 0;
      return id => this.passesFilter(id);
    }
    return id => this.passesFilter(id) && (t.wants(id) > 0 || t.wantsFuel(id) > 0);
  }

  private tryPickup(): boolean {
    const src = this.target(this.pickX, this.pickY);
    if (!src || src === this) {
      // ground items
      const items = G.game.world.entitiesIn(this.pickX - 0.5, this.pickY - 0.5, this.pickX + 0.5, this.pickY + 0.5, e => e.type === 'item-on-ground', 1);
      const accept = this.acceptFilter();
      for (const it of items as any[]) {
        if (!accept(it.item)) continue;
        if (this.hand && this.hand.id !== it.item) continue;
        G.game.removeEntity(it);
        if (this.hand) this.hand.n++; else this.hand = { id: it.item, n: 1 };
        return true;
      }
      return false;
    }
    const accept = this.acceptFilter();
    const max = this.handSize - (this.hand?.n ?? 0);
    if (max <= 0) return true;
    if (src instanceof BeltBase) {
      const f = this.hand ? ((id: string) => id === this.hand!.id) : accept;
      // preference: nearest lane handled by takeItemNear distance
      const id = src.takeItemNear(this.pickX, this.pickY, f);
      if (!id) return !!this.hand;
      if (this.hand) this.hand.n++; else this.hand = { id, n: 1 };
      return true;
    }
    const dropT = this.target(this.dropX, this.dropY);
    let lim = max;
    const f = (id: string) => {
      if (this.hand && id !== this.hand.id) return false;
      return accept(id);
    };
    const s = src.takeOutput(lim, f);
    if (!s) return !!this.hand;
    // don't take more than target wants (for machines), limited to hand size
    if (dropT && !(dropT instanceof BeltBase) && dropT.type !== 'container') {
      const want = Math.max(dropT.wants(s.id), dropT.wantsFuel(s.id));
      if (want < s.n && want > 0) {
        const back = s.n - want;
        src.insertItem(s.id, back, 'inserter');
        s.n = want;
      }
    }
    if (this.hand) this.hand.n += s.n; else this.hand = s;
    return true;
  }

  private tryDrop(): boolean {
    if (!this.hand) return true;
    const t = this.target(this.dropX, this.dropY);
    if (t instanceof BeltBase) {
      const dl = t.dropLane(this.dropX, this.dropY, this.x, this.y);
      if (!dl) return false;
      const [lane, p] = dl;
      if (!lane.hasSpaceAt(p)) return false;
      lane.insertAt(p, this.hand.id);
      this.hand.n--;
      if (this.hand.n <= 0) { this.hand = null; return true; }
      return false;
    }
    if (!t) {
      // drop on ground (one item per free spot)
      const g = G.game;
      const existing = g.world.entitiesIn(this.dropX - 0.3, this.dropY - 0.3, this.dropX + 0.3, this.dropY + 0.3, e => e.type === 'item-on-ground', 1);
      if (existing.length) return false;
      g.spillItem(this.dropX, this.dropY, this.hand.id, 1, true);
      this.hand.n--;
      if (this.hand.n <= 0) { this.hand = null; return true; }
      return false;
    }
    const id = this.hand.id;
    let n = 0;
    if (t.wantsFuel(id) > 0) n = t.insertItem(id, this.hand.n, 'inserter');
    else n = t.insertItem(id, this.hand.n, 'inserter');
    if (n > 0) { this.hand.n -= n; }
    if (this.hand.n <= 0) { this.hand = null; return true; }
    return false;
  }

  handPos(): [number, number, number] {
    const t = (1 - Math.cos(this.angle)) / 2; // 0 at pickup, 1 at drop
    const hx = this.pickX + (this.dropX - this.pickX) * t;
    const hy = this.pickY + (this.dropY - this.pickY) * t;
    const lift = Math.sin(this.angle) * (this.name === 'long-handed-inserter' ? 1.0 : 0.6);
    return [hx, hy, lift];
  }

  draw(r: Renderer, alt: boolean) {
    const a = r.atlas;
    r.draw('objects', a.get(`${this.name}-base`), this.x, this.y, WHITE, 0, 1, this.y - 0.3);
    r.draw('shadow', a.get(`${this.name}-base-shadow`), this.x, this.y);
    const [hx, hy, lift] = this.handPos();
    // pull hand position slightly towards base so it sits over the tile edge
    const bx = this.x, by = this.y - 0.18;
    const ex = (bx + hx) / 2, ey = (by + hy) / 2 - 0.25 - lift * 0.55;
    const hsy = hy - lift * 0.45;
    const arm = a.get(`${this.name}-arm`);
    // shadow of arm
    r.line('shadow', arm, bx + 0.25, by + 0.3, hx + 0.25 + lift * 0.5, hy + 0.3, 0.14, WHITE);
    r.line('high', arm, bx, by, ex, ey, 0.17, WHITE);
    r.line('high', arm, ex, ey, hx, hsy, 0.15, WHITE);
    r.draw('high', a.get('inserter-joint'), ex, ey, WHITE, 0, 0.6, by + 0.1);
    const hand = a.get(`${this.name}-hand`);
    const ang = Math.atan2(hsy - ey, hx - ex);
    r.draw('high', hand, hx, hsy, WHITE, ang, 0.9, by + 0.11);
    if (this.hand) r.draw('high', a.get('icon:' + this.hand.id), hx, hsy, WHITE, 0, 0.4, by + 0.12);
    if (alt) {
      // direction arrow
      r.draw('overlay', a.get('arrow-small'), this.dropX * 0.5 + this.x * 0.5, this.dropY * 0.5 + this.y * 0.5, rgba(1, 1, 1, 0.8), this.dir * Math.PI / 2 + Math.PI, 0.5);
    }
  }
  serialize() {
    return { st: this.state, a: this.angle, h: this.hand, b: this.burner?.serialize(), f: this.filters, fm: this.filterMode, uf: this.useFilters, so: this.stackOverride };
  }
  load(d: any) {
    this.state = d.st || 0; this.angle = d.a || 0; this.hand = d.h || null;
    if (this.burner && d.b) this.burner.load(d.b);
    this.filters = d.f || []; this.filterMode = d.fm || 'whitelist'; this.useFilters = !!d.uf; this.stackOverride = d.so || 0;
  }
}
registerEntity(['inserter'], Inserter);
