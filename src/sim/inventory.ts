// Slot-based inventory with stack sizes, filters and change notification.
import { ITEMS } from '../data/protos';

export interface Stack { id: string; n: number; data?: any; }

export const stackSize = (id: string) => ITEMS[id]?.stack ?? 50;

export class Inventory {
  slots: (Stack | null)[];
  filters: (string | null)[] | null = null;
  bar = -1; // limit: slots >= bar are not insertable by machines
  version = 0;
  onChange?: () => void;
  constructor(n: number) { this.slots = new Array(n).fill(null); }

  get size() { return this.slots.length; }
  resize(n: number): Stack[] {
    const spill: Stack[] = [];
    if (n < this.slots.length) {
      for (let i = n; i < this.slots.length; i++) if (this.slots[i]) spill.push(this.slots[i]!);
      this.slots.length = n;
    } else while (this.slots.length < n) this.slots.push(null);
    if (this.filters) { this.filters.length = n; for (let i = 0; i < n; i++) if (this.filters[i] === undefined) this.filters[i] = null; }
    this.changed();
    return spill;
  }
  changed() { this.version++; this.onChange && this.onChange(); }

  count(id: string): number {
    let c = 0;
    for (const s of this.slots) if (s && s.id === id) c += s.n;
    return c;
  }
  has(id: string, n = 1) { return this.count(id) >= n; }
  isEmpty() { return this.slots.every(s => !s); }
  freeSlots() { let c = 0; for (let i = 0; i < this.slots.length; i++) if (!this.slots[i] && (!this.filters || !this.filters[i]) && (this.bar < 0 || i < this.bar)) c++; return c; }

  // How many of id could be inserted
  space(id: string, limitBar = false): number {
    const ss = stackSize(id);
    let sp = 0;
    const end = limitBar && this.bar >= 0 ? this.bar : this.slots.length;
    for (let i = 0; i < end; i++) {
      const s = this.slots[i];
      if (this.filters && this.filters[i] && this.filters[i] !== id) continue;
      if (!s) sp += ss; else if (s.id === id && !s.data) sp += ss - s.n;
    }
    return sp;
  }
  canInsert(id: string, n = 1, limitBar = false) { return this.space(id, limitBar) >= n; }

  insert(id: string, n: number, limitBar = false, data?: any): number {
    if (n <= 0) return 0;
    const ss = stackSize(id);
    let left = n;
    const end = limitBar && this.bar >= 0 ? this.bar : this.slots.length;
    if (!data) {
      for (let i = 0; i < end && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && !s.data && s.n < ss) { const k = Math.min(ss - s.n, left); s.n += k; left -= k; }
      }
    }
    for (let i = 0; i < end && left > 0; i++) {
      if (this.slots[i]) continue;
      if (this.filters && this.filters[i] && this.filters[i] !== id) continue;
      const k = Math.min(ss, left);
      this.slots[i] = { id, n: k, data };
      left -= k;
    }
    if (left !== n) this.changed();
    return n - left;
  }
  insertStack(st: Stack, limitBar = false): number { return this.insert(st.id, st.n, limitBar, st.data); }

  remove(id: string, n: number): number {
    let left = n;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) { const k = Math.min(s.n, left); s.n -= k; left -= k; if (s.n <= 0) this.slots[i] = null; }
    }
    if (left !== n) this.changed();
    return n - left;
  }
  // remove first available stack-ish chunk (for inserters): returns item id taken
  takeAny(max: number, filter?: (id: string) => boolean): Stack | null {
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const s = this.slots[i];
      if (s && (!filter || filter(s.id))) {
        const k = Math.min(s.n, max);
        s.n -= k;
        const out = { id: s.id, n: k, data: s.data };
        if (s.n <= 0) this.slots[i] = null;
        this.changed();
        return out;
      }
    }
    return null;
  }
  firstItem(filter?: (id: string) => boolean): string | null {
    for (const s of this.slots) if (s && (!filter || filter(s.id))) return s.id;
    return null;
  }
  contents(): Map<string, number> {
    const m = new Map<string, number>();
    for (const s of this.slots) if (s) m.set(s.id, (m.get(s.id) || 0) + s.n);
    return m;
  }
  clear() { this.slots.fill(null); this.changed(); }
  sort() {
    const items = this.slots.filter(s => s) as Stack[];
    const merged: Stack[] = [];
    const byId = new Map<string, number>();
    for (const s of items) {
      if (s.data) { merged.push(s); continue; }
      byId.set(s.id, (byId.get(s.id) || 0) + s.n);
    }
    const ids = [...byId.keys()].sort((a, b) => {
      const A = ITEMS[a], B = ITEMS[b];
      const ga = ['logistics', 'production', 'intermediate-products', 'combat'].indexOf(A?.group ?? ''), gb = ['logistics', 'production', 'intermediate-products', 'combat'].indexOf(B?.group ?? '');
      return ga - gb || (A?.order ?? 0) - (B?.order ?? 0);
    });
    const out: Stack[] = [];
    for (const id of ids) { let n = byId.get(id)!; const ss = stackSize(id); while (n > 0) { const k = Math.min(ss, n); out.push({ id, n: k }); n -= k; } }
    out.push(...merged);
    if (this.filters) {
      // keep filtered slots: simple approach—fill unfiltered slots only
      const res: (Stack | null)[] = new Array(this.slots.length).fill(null);
      let oi = 0;
      for (let i = 0; i < res.length && oi < out.length; i++) if (!this.filters[i]) res[i] = out[oi++];
      for (let i = 0; i < res.length && oi < out.length; i++) if (!res[i] && this.filters[i] === out[oi].id) res[i] = out[oi++];
      this.slots = res;
    } else {
      this.slots.fill(null);
      for (let i = 0; i < out.length && i < this.slots.length; i++) this.slots[i] = out[i];
    }
    this.changed();
  }
  serialize() { return { s: this.slots.map(s => s ? [s.id, s.n, s.data] : 0), f: this.filters, b: this.bar }; }
  load(d: any) {
    if (!d) return;
    this.slots = d.s.map((x: any) => x ? { id: x[0], n: x[1], data: x[2] } : null);
    this.filters = d.f || null; this.bar = d.b ?? -1;
    this.changed();
  }
}
