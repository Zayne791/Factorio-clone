// Additional windows: armor equipment grid, item/signal picker.
import { Win, h, UI } from './ui';
import { InventoryPanel } from './char-window';
import { ITEMS, FLUIDS, GROUPS, GROUP_NAMES, SUBGROUP_ORDER, itemName } from '../data/protos';
import { Stack } from '../sim/inventory';
import { fmtEnergy } from '../core';
import { VIRTUAL_SIGNALS } from '../art/icons';

const CELL = 40;

export class ArmorGridWindow extends Win {
  inv: InventoryPanel;
  gridEl: HTMLDivElement;
  info: HTMLDivElement;
  ver = '';
  constructor(ui: UI) {
    super(ui, 'Armor equipment', 'armorwin', 'armor');
    const p = ui.g.player;
    const row = h('div', 'row', this.body); row.style.alignItems = 'flex-start';
    const left = h('div', 'panel', row);
    this.inv = new InventoryPanel(ui, left, 'Inventory', () => p.main, () => ({ insert: (s: Stack) => this.insertEquipment(s) }));
    const right = h('div', 'panel col', row);
    h('div', 'subtitle', right, 'Equipment grid');
    this.gridEl = h('div', 'equip-grid', right);
    this.info = h('div', 'mini-label', right);
    this.rebuild();
  }
  get dims(): [number, number] | null {
    const arm = this.ui.g.player.armor.slots[0];
    return arm ? ITEMS[arm.id].armor?.grid || null : null;
  }
  fits(id: string, x: number, y: number, ignore?: any): boolean {
    const d = this.dims; const q = ITEMS[id]?.equip;
    if (!d || !q) return false;
    if (x < 0 || y < 0 || x + q.w > d[0] || y + q.h > d[1]) return false;
    for (const e of this.ui.g.player.armorGrid) {
      if (e === ignore) continue;
      const o = ITEMS[e.id].equip!;
      if (x < e.x + o.w && x + q.w > e.x && y < e.y + o.h && y + q.h > e.y) return false;
    }
    return true;
  }
  insertEquipment(s: Stack): number {
    const d = this.dims; if (!d || !ITEMS[s.id]?.equip) return 0;
    for (let y = 0; y < d[1]; y++) for (let x = 0; x < d[0]; x++) if (this.fits(s.id, x, y)) { this.ui.g.player.armorGrid.push({ id: s.id, x, y, energy: 0 }); this.rebuild(); return 1; }
    return 0;
  }
  rebuild() {
    const ui = this.ui, p = ui.g.player;
    const d = this.dims;
    this.gridEl.innerHTML = '';
    if (!d) { h('div', 'mini-label', this.gridEl, 'Equip modular armor or better to use equipment.'); return; }
    this.gridEl.style.width = d[0] * CELL + 'px'; this.gridEl.style.height = d[1] * CELL + 'px';
    for (let y = 0; y < d[1]; y++) for (let x = 0; x < d[0]; x++) {
      const c = h('div', 'equip-cell', this.gridEl);
      c.style.left = x * CELL + 'px'; c.style.top = y * CELL + 'px';
      c.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        const cur = p.cursor;
        if (cur && ITEMS[cur.id]?.equip && this.fits(cur.id, x, y)) {
          p.armorGrid.push({ id: cur.id, x, y, energy: 0 });
          cur.n--; if (cur.n <= 0) p.cursor = null;
          ui.g.sound.play('inventory-move', 0.5);
          this.rebuild();
        }
      });
    }
    for (const e of p.armorGrid) {
      const q = ITEMS[e.id].equip!;
      const el = h('div', 'equip-item', this.gridEl);
      el.style.left = e.x * CELL + 'px'; el.style.top = e.y * CELL + 'px';
      el.style.width = q.w * CELL + 'px'; el.style.height = q.h * CELL + 'px';
      ui.icon(e.id, Math.min(q.w, q.h) * CELL - 8, el);
      el.addEventListener('pointerenter', ev => { if (ev.pointerType !== 'touch') ui.showTooltip(ui.itemTooltip(e.id), el); });
      el.addEventListener('pointerleave', () => ui.hideTooltip(el));
      el.addEventListener('pointerdown', ev => {
        ev.preventDefault(); ev.stopPropagation();
        if (p.cursor) return;
        p.armorGrid.splice(p.armorGrid.indexOf(e), 1);
        if (ev.shiftKey) p.main.insert(e.id, 1); else p.cursor = { id: e.id, n: 1 };
        ui.g.sound.play('inventory-pick', 0.5);
        ui.hideTooltip(el);
        this.rebuild();
      });
    }
    const arm = p.armor.slots[0];
    if (arm) { if (!arm.data) arm.data = {}; arm.data.grid = p.armorGrid; }
  }
  update() {
    this.inv.update();
    const p = this.ui.g.player;
    const v = (p.armor.slots[0]?.id || '') + ':' + p.armorGrid.length;
    if (v !== this.ver) { this.ver = v; this.rebuild(); }
    const st = p.equipmentStats();
    const parts: string[] = [];
    if (st.gen) parts.push(`Generation ${(st.gen / 1e3).toFixed(0)} kW`);
    if (st.cap) parts.push(`Battery ${fmtEnergy(p.battery)} / ${fmtEnergy(st.cap)}`);
    if (st.shieldMax) parts.push(`Shield ${Math.round(p.shieldHP)} / ${st.shieldMax}`);
    if (st.move) parts.push(`Movement +${Math.round(st.move * 100)}%`);
    if (st.robots) parts.push(`Robot slots ${st.robots}`);
    this.info.textContent = parts.join(' · ') || 'No equipment';
  }
}

// Item / signal picker (used by filters, combinators, requests)
export class ItemPicker extends Win {
  cb: (id: string) => void;
  group = GROUPS[0];
  search = '';
  list: HTMLDivElement;
  opts: { fluids?: boolean; signals?: boolean; filter?: (id: string) => boolean };
  constructor(ui: UI, cb: (id: string) => void, opts: { fluids?: boolean; signals?: boolean; filter?: (id: string) => boolean; title?: string } = {}) {
    super(ui, opts.title || 'Select item', 'pickerwin', 'picker');
    this.cb = cb; this.opts = opts;
    const top = h('div', 'row', this.body);
    const tabs = h('div', 'row', top);
    const groups = [...GROUPS]; if (opts.fluids) groups.push('fluids'); if (opts.signals) groups.push('signals');
    for (const g of groups) {
      const t = h('div', 'btn small tab', tabs, g === 'fluids' ? 'Fluids' : g === 'signals' ? 'Signals' : GROUP_NAMES[g]);
      t.onclick = () => { this.group = g; this.render(); for (const c of Array.from(tabs.children)) c.classList.remove('on'); t.classList.add('on'); };
      if (g === this.group) t.classList.add('on');
    }
    const inp = h('input', 'search', top) as HTMLInputElement;
    inp.placeholder = 'Search';
    inp.oninput = () => { this.search = inp.value.toLowerCase(); this.render(); };
    const sc = h('div', 'scroll', this.body); sc.style.maxHeight = '60vh';
    this.list = h('div', 'col', sc);
    this.render();
  }
  ids(): string[][] {
    const s = this.search;
    if (s) {
      const all = [...Object.values(ITEMS).filter(i => !i.hidden).map(i => i.id)];
      if (this.opts.fluids) all.push(...Object.keys(FLUIDS));
      if (this.opts.signals) all.push(...VIRTUAL_SIGNALS);
      return [all.filter(id => itemName(id).toLowerCase().includes(s) && (!this.opts.filter || this.opts.filter(id)))];
    }
    if (this.group === 'fluids') return [Object.keys(FLUIDS)];
    if (this.group === 'signals') return [VIRTUAL_SIGNALS.slice(0, 36), VIRTUAL_SIGNALS.slice(36)];
    const rows: string[][] = [];
    for (const sg of SUBGROUP_ORDER) {
      const r = Object.values(ITEMS).filter(i => i.group === this.group && i.subgroup === sg && !i.hidden && (!this.opts.filter || this.opts.filter(i.id))).sort((a, b) => a.order - b.order).map(i => i.id);
      if (r.length) rows.push(r);
    }
    return rows;
  }
  render() {
    const ui = this.ui;
    this.list.innerHTML = '';
    for (const row of this.ids()) {
      const g = h('div', 'grid', this.list);
      g.style.gridTemplateColumns = 'repeat(10, var(--slot))';
      for (const id of row) {
        const s = ui.slot(g, { onLeft: () => { ui.closeWindow(this); this.cb(id); }, tooltip: () => `<div class="tt-title">${itemName(id)}</div>` });
        ui.setSlot(s, null, id);
        ((s as any)._icon as HTMLElement).classList.remove('ghost');
      }
    }
  }
}

export { VIRTUAL_SIGNALS };
