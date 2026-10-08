// Character window: equipment, inventory and crafting menu.
import { Win, h, UI } from './ui';
import { GROUPS, GROUP_NAMES, SUBGROUP_ORDER, RECIPES, ITEMS, RecipeProto } from '../data/protos';
import { Inventory, Stack } from '../sim/inventory';
import { G, fmtNum } from '../core';

export class InventoryPanel {
  el: HTMLDivElement; ui: UI; slots: HTMLDivElement[] = []; grid: HTMLDivElement;
  inv: () => Inventory; ver = -1; size = -1;
  other: () => { insert: (s: Stack) => number } | null;
  constructor(ui: UI, parent: HTMLElement, title: string, inv: () => Inventory, other: () => { insert: (s: Stack) => number } | null, cols = 10, showSort = true) {
    this.ui = ui; this.inv = inv; this.other = other;
    this.el = h('div', 'col', parent);
    const hdr = h('div', 'row', this.el);
    h('div', 'subtitle', hdr, title);
    h('div', 'spacer', hdr);
    if (showSort) { const sb = h('div', 'btn small', hdr, 'Sort'); sb.onclick = () => this.inv().sort(); }
    const sc = h('div', 'scroll', this.el);
    sc.style.maxHeight = 'calc(100vh - 210px)';
    this.grid = h('div', 'grid', sc);
    this.grid.style.gridTemplateColumns = `repeat(${cols}, var(--slot))`;
    this.rebuild();
  }
  rebuild() {
    const inv = this.inv();
    this.grid.innerHTML = ''; this.slots = [];
    for (let i = 0; i < inv.size; i++) this.slots.push(this.ui.invSlot(this.grid, this.inv, i, this.other));
    this.size = inv.size; this.ver = inv.version;
  }
  update() {
    const inv = this.inv();
    if (inv.size !== this.size) this.rebuild();
    for (const s of this.slots) (s as any)._bind();
  }
}

export class CharacterWindow extends Win {
  inv: InventoryPanel;
  group = 'logistics';
  recipeGrid!: HTMLDivElement;
  tabs: HTMLDivElement[] = [];
  recipeSlots: { el: HTMLDivElement; r: RecipeProto }[] = [];
  search = '';
  trashPanel: InventoryPanel | null = null;
  equipSlots: HTMLDivElement[] = [];
  constructor(ui: UI) {
    super(ui, 'Character', 'charwin', 'character');
    const g = ui.g, p = g.player;
    const cols = h('div', 'cols', this.body);
    // equipment column
    const eq = h('div', 'panel equip-col', cols);
    h('div', 'subtitle', eq, 'Equipment');
    const port = h('div', 'char-portrait', eq);
    ui.icon(p.armor.slots[0]?.id || 'light-armor', 64, port);
    (this as any)._port = port;
    const ar = h('div', 'col', eq); ar.style.alignItems = 'center';
    h('div', 'mini-label', ar, 'Armor');
    const armSlot = ui.invSlot(ar, () => p.armor, 0, () => ({ insert: s => p.main.insertStack(s) }));
    (p.armor as any).accepts = (id: string) => !!ITEMS[id]?.armor;
    this.equipSlots.push(armSlot);
    const gb = h('div', 'btn small', ar, 'Equipment grid'); gb.onclick = () => (ui as any).openArmorGrid?.();
    h('div', 'mini-label', eq, 'Weapons & ammo');
    const wg = h('div', 'grid', eq); wg.style.gridTemplateColumns = 'repeat(3, var(--slot))';
    (p.guns as any).accepts = (id: string) => !!ITEMS[id]?.gun;
    (p.ammo as any).accepts = (id: string) => !!ITEMS[id]?.ammo;
    for (let i = 0; i < 3; i++) this.equipSlots.push(ui.invSlot(wg, () => p.guns, i, () => ({ insert: s => p.main.insertStack(s) })));
    for (let i = 0; i < 3; i++) this.equipSlots.push(ui.invSlot(wg, () => p.ammo, i, () => ({ insert: s => p.main.insertStack(s) })));
    const st = h('div', 'col', eq); st.style.width = '100%'; st.style.marginTop = '4px';
    (this as any)._stats = st;
    // inventory
    const ip = h('div', 'panel', cols);
    this.inv = new InventoryPanel(ui, ip, 'Inventory', () => p.main, () => null);
    // crafting
    const cp = h('div', 'panel col', cols);
    const ch = h('div', 'row', cp);
    h('div', 'subtitle', ch, 'Crafting');
    h('div', 'spacer', ch);
    const sb = h('input', 'searchbox', ch) as HTMLInputElement;
    sb.placeholder = 'Search...';
    sb.oninput = () => { this.search = sb.value.toLowerCase(); this.buildRecipes(); };
    const tabs = h('div', 'tabs', cp);
    const tabIcon: Record<string, string> = { 'logistics': 'transport-belt', 'production': 'assembling-machine-1', 'intermediate-products': 'electronic-circuit', 'combat': 'submachine-gun' };
    for (const gid of GROUPS) {
      const t = h('div', 'tab', tabs);
      ui.icon(tabIcon[gid], 56, t);
      t.onclick = () => { this.group = gid; this.buildRecipes(); };
      t.addEventListener('pointerenter', () => ui.showTooltip(`<div class="tt-title">${GROUP_NAMES[gid]}</div>`, t));
      t.addEventListener('pointerleave', () => ui.hideTooltip(t));
      (t as any)._g = gid;
      this.tabs.push(t);
    }
    const rs = h('div', 'scroll', cp); rs.style.maxHeight = 'calc(100vh - 270px)';
    this.recipeGrid = h('div', 'recipe-grid', rs);
    this.buildRecipes();
  }
  buildRecipes() {
    const ui = this.ui, g = ui.g, p = g.player;
    for (const t of this.tabs) t.classList.toggle('active', (t as any)._g === this.group);
    this.recipeGrid.innerHTML = '';
    this.recipeSlots = [];
    const enabled = g.research.enabledRecipes;
    const recipes = Object.values(RECIPES).filter(r => enabled.has(r.id) && !r.hidden && (this.search ? r.name.toLowerCase().includes(this.search) : r.group === this.group));
    recipes.sort((a, b) => SUBGROUP_ORDER.indexOf(a.subgroup) - SUBGROUP_ORDER.indexOf(b.subgroup) || a.order - b.order);
    let col = 0, lastSub = '';
    for (const r of recipes) {
      if (r.subgroup !== lastSub && col !== 0 && !this.search) { while (col % 10 !== 0) { h('div', 'slot dark', this.recipeGrid); col++; } }
      lastSub = r.subgroup;
      const s = ui.slot(this.recipeGrid, {
        onLeft: e => this.craft(r, (e as any).shiftKey ? 'all' : 1),
        onRight: () => this.craft(r, 5),
        tooltip: () => ui.recipeTooltip(r),
      });
      ui.setSlot(s, { id: r.main, n: 1 }, null, '');
      ui.setIcon((s as any)._icon, ui.recipeIconKey(r), 32);
      this.recipeSlots.push({ el: s, r });
      col++;
    }
    while (col % 10 !== 0 || col < 70) { h('div', 'slot dark', this.recipeGrid); col++; }
    this.refreshCounts();
  }
  craft(r: RecipeProto, n: number | 'all') {
    const p = this.ui.g.player;
    if (!r.hand) { this.ui.flyText(p.x, p.y, 'Cannot be crafted by hand', '#ff8a6a'); return; }
    const count = n === 'all' ? p.craftableCount(r.id) : n;
    if (count <= 0) { this.ui.flyText(p.x, p.y, 'Missing ingredients', '#ff8a6a'); this.ui.g.sound.play('cannot-build', 0.4); return; }
    p.queueCraft(r.id, count);
    this.refreshCounts();
  }
  refreshCounts() {
    const p = this.ui.g.player;
    for (const { el, r } of this.recipeSlots) {
      if (!r.hand) { el.classList.add('red'); (el as any)._count.textContent = ''; continue; }
      const c = p.craftableCount(r.id);
      el.classList.toggle('red', c === 0);
      (el as any)._count.textContent = c > 0 ? fmtNum(c) : '';
    }
  }
  t = 0;
  update() {
    this.inv.update();
    for (const s of this.equipSlots) (s as any)._bind();
    if (++this.t % 10 === 0) {
      this.refreshCounts();
      const p = this.ui.g.player;
      const st = (this as any)._stats as HTMLDivElement;
      const eq = p.equipmentStats();
      st.innerHTML = `<div class="kv"><span>Health</span><b>${Math.ceil(p.character.health)}/250</b></div><div class="kv"><span>Inventory</span><b>${p.main.size}</b></div>` + (eq.shieldMax ? `<div class="kv"><span>Shield</span><b>${Math.floor(p.shieldHP)}/${eq.shieldMax}</b></div>` : '');
      const port = (this as any)._port as HTMLDivElement;
      this.ui.setIcon(port.firstChild as HTMLElement, p.armor.slots[0]?.id || 'light-armor', 64);
    }
  }
}
