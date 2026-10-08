// UI core: DOM helpers, windows, tooltips, slots, HUD.
import { G, Dir, DIRS, fmtNum, fmtPower, fmtTime } from '../core';
import { Game } from '../game';
import { Input } from '../input/input';
import { Renderer } from '../engine/renderer';
import { IconSheet } from '../art';
import { ITEMS, RECIPES, TECHS, ENTITIES, FLUIDS, itemName, techLevelCost, RecipeProto } from '../data/protos';
import { Inventory, Stack, stackSize } from '../sim/inventory';
import { Entity, createEntity } from '../sim/entity';
import { BeltBase } from '../sim/belts';
import { Minimap } from './minimap';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement | null, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export class Win {
  el: HTMLDivElement; body: HTMLDivElement; ui: UI; titleEl: HTMLHeadingElement;
  key: string;
  constructor(ui: UI, title: string, cls = '', key = title) {
    this.ui = ui; this.key = key;
    this.el = h('div', 'win ' + cls);
    const tb = h('div', 'win-title', this.el);
    this.titleEl = h('h2', '', tb, title);
    h('div', 'drag-handle', tb);
    const close = h('div', 'close-btn', tb, '×');
    close.onclick = () => ui.closeWindow(this);
    this.body = h('div', 'win-body', this.el);
    this.body.style.minHeight = '0'; this.body.style.display = 'flex'; this.body.style.flexDirection = 'column';
    // drag
    let drag: [number, number, number, number] | null = null;
    tb.addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).classList.contains('close-btn')) return;
      const r = this.el.getBoundingClientRect();
      drag = [e.clientX, e.clientY, r.left, r.top];
      tb.setPointerCapture(e.pointerId);
    });
    tb.addEventListener('pointermove', e => {
      if (!drag) return;
      this.el.style.left = (drag[2] + e.clientX - drag[0]) + 'px';
      this.el.style.top = Math.max(0, drag[3] + e.clientY - drag[1]) + 'px';
      this.el.style.transform = 'none';
    });
    tb.addEventListener('pointerup', () => drag = null);
  }
  update() { }
  onClose() { }
  center() {
    this.el.style.left = '50%'; this.el.style.top = '50%'; this.el.style.transform = 'translate(-50%, -50%)';
  }
}

export interface SlotOpts { onLeft?: (e: PointerEvent) => void; onRight?: (e: PointerEvent) => void; tooltip?: () => string | null; cls?: string; }

export class UI {
  g: Game; input: Input; r: Renderer;
  icons: IconSheet; techs: IconSheet;
  root: HTMLDivElement;
  windows: Win[] = [];
  tooltipEl: HTMLDivElement;
  tooltipOwner: HTMLElement | null = null;
  cursorEl: HTMLDivElement;
  msgEl: HTMLDivElement;
  flyLayer: HTMLDivElement;
  hud: Record<string, HTMLElement> = {};
  qbSlots: HTMLDivElement[] = [];
  minimap!: Minimap;
  tileBrush = 1;
  shootHeld = false;
  blueprintCursor: any = null;
  alerts: { kind: string; e: Entity; t: number }[] = [];
  msgTimer: any = null;
  frame = 0;
  openEntityWin: ((e: Entity) => Win | null) | null = null;
  openCharacter: (() => Win) | null = null;
  openTech: (() => Win) | null = null;
  openMap: (() => Win) | null = null;
  openStats: (() => Win) | null = null;
  openMenu: (() => void) | null = null;
  autosave: (() => void) | null = null;
  copied: { name: string; data: any } | null = null;
  touchUI = false;
  qbRow = 0;

  constructor(g: Game, input: Input, r: Renderer, icons: IconSheet, techs: IconSheet) {
    this.g = g; this.input = input; this.r = r; this.icons = icons; this.techs = techs;
    g.ui = this;
    (g.ui as any).input = input;
    this.root = document.getElementById('ui') as HTMLDivElement;
    this.tooltipEl = h('div', 'hidden', document.body); this.tooltipEl.id = 'tooltip';
    this.cursorEl = h('div', 'hidden', document.body); this.cursorEl.id = 'cursor-stack';
    this.msgEl = h('div', 'hud-el', this.root); this.msgEl.id = 'msg';
    this.flyLayer = h('div', '', this.root); this.flyLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.touchUI = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.buildHUD();
    window.addEventListener('pointermove', e => this.onPointerMove(e));
    input.onOpenEntity = e => this.openEntity(e);
    input.onKey = (k, e) => this.onKey(k, e);
  }

  // ---------- icons ----------
  icon(key: string, size = 32, parent?: HTMLElement, cls = ''): HTMLDivElement {
    const d = h('div', 'icon ' + cls, parent);
    this.setIcon(d, key, size);
    return d;
  }
  setIcon(d: HTMLElement, key: string | null, size = 32) {
    if (!key) { d.style.backgroundImage = 'none'; (d as any)._k = null; return; }
    if ((d as any)._k === key && (d as any)._s === size) return;
    (d as any)._k = key; (d as any)._s = size;
    let k = key;
    if (FLUIDS[key] && !ITEMS[key]) k = 'fluid:' + key;
    const i = this.icons.index.get(k);
    if (i === undefined) { d.style.backgroundImage = 'none'; return; }
    const s = this.icons.size, cols = this.icons.cols;
    const scale = size / s;
    d.style.width = size + 'px'; d.style.height = size + 'px';
    d.style.backgroundImage = `url(${this.icons.url})`;
    d.style.backgroundSize = `${this.icons.w * scale}px ${this.icons.h * scale}px`;
    d.style.backgroundPosition = `${-(i % cols) * s * scale}px ${-Math.floor(i / cols) * s * scale}px`;
  }
  recipeIconKey(r: RecipeProto) { return r.icon ? 'recipe:' + r.id : r.main; }
  techIcon(id: string, size = 64, parent?: HTMLElement): HTMLDivElement {
    const d = h('div', 'icon', parent);
    const i = this.techs.index.get(id) ?? 0;
    const s = this.techs.size, cols = this.techs.cols, scale = size / s;
    d.style.width = size + 'px'; d.style.height = size + 'px';
    d.style.backgroundImage = `url(${this.techs.url})`;
    d.style.backgroundSize = `${this.techs.w * scale}px ${this.techs.h * scale}px`;
    d.style.backgroundPosition = `${-(i % cols) * s * scale}px ${-Math.floor(i / cols) * s * scale}px`;
    return d;
  }

  // ---------- slots ----------
  slot(parent: HTMLElement | null, opts: SlotOpts = {}): HTMLDivElement {
    const s = h('div', 'slot ' + (opts.cls || ''), parent);
    const ic = h('div', 'icon', s);
    const cnt = h('div', 'count', s);
    (s as any)._icon = ic; (s as any)._count = cnt;
    let lpTimer: any = null, lpFired = false;
    s.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      if (e.pointerType === 'mouse') {
        if (e.button === 2) opts.onRight?.(e); else if (e.button === 0) opts.onLeft?.(e);
        return;
      }
      lpFired = false;
      lpTimer = setTimeout(() => { lpFired = true; opts.onRight?.(e); this.haptic(); }, 380);
    });
    s.addEventListener('pointerup', e => {
      if (e.pointerType === 'mouse') return;
      if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
      if (!lpFired) {
        // double-tap = shift-click
        const now = performance.now();
        if ((s as any)._lastTap && now - (s as any)._lastTap < 300) { (s as any)._lastTap = 0; const fake = Object.assign({}, e, { shiftKey: true }) as any; opts.onLeft?.(fake); }
        else { (s as any)._lastTap = now; opts.onLeft?.(e); }
      }
    });
    s.addEventListener('pointerleave', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } this.hideTooltip(s); });
    s.addEventListener('contextmenu', e => e.preventDefault());
    if (opts.tooltip) {
      s.addEventListener('pointerenter', e => { if (e.pointerType === 'touch') return; const t = opts.tooltip!(); if (t) this.showTooltip(t, s); });
    }
    return s;
  }
  setSlot(s: HTMLElement, st: Stack | null | undefined, ghostId?: string | null, countOverride?: string) {
    const ic = (s as any)._icon as HTMLDivElement, cnt = (s as any)._count as HTMLDivElement;
    const id = st?.id ?? ghostId ?? null;
    this.setIcon(ic, id, 32);
    ic.classList.toggle('ghost', !st && !!ghostId);
    const txt = countOverride !== undefined ? countOverride : st && (st.n > 1 || ITEMS[st.id]?.stack > 1) ? fmtNum(st.n) : '';
    if (cnt.textContent !== txt) cnt.textContent = txt;
  }

  // Standard Factorio inventory slot click behaviour bound to inventory slot
  invSlot(parent: HTMLElement, inv: () => Inventory, idx: number, other?: () => { insert: (s: Stack) => number } | null, extra: Partial<SlotOpts> = {}): HTMLDivElement {
    const s = this.slot(parent, {
      ...extra,
      onLeft: e => this.slotLeft(inv(), idx, e as any, other ? other() : null),
      onRight: e => this.slotRight(inv(), idx),
      tooltip: () => { const st = inv().slots[idx]; return st ? this.itemTooltip(st.id, st) : null; },
    });
    (s as any)._bind = () => {
      const I = inv();
      const st = I.slots[idx];
      const f = I.filters ? I.filters[idx] : null;
      this.setSlot(s, st, f);
      s.classList.toggle('empty-filter', !st && !!f);
      s.classList.toggle('hand', I === this.g.player.main && this.g.player.cursor !== null && this.g.player.cursorFrom === idx && !st);
    };
    (s as any)._bind();
    return s;
  }
  slotLeft(inv: Inventory, idx: number, e: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }, other: { insert: (s: Stack) => number } | null) {
    const p = this.g.player;
    const st = inv.slots[idx];
    if ((e.shiftKey || e.ctrlKey || e.metaKey) && st && other) {
      // transfer stack (shift) or all of type (ctrl)
      if (e.ctrlKey || e.metaKey) {
        const id = st.id;
        for (let i = 0; i < inv.slots.length; i++) {
          const s2 = inv.slots[i];
          if (s2 && s2.id === id) { const n = other.insert(s2); s2.n -= n; if (s2.n <= 0) inv.slots[i] = null; }
        }
      } else { const n = other.insert(st); st.n -= n; if (st.n <= 0) inv.slots[idx] = null; }
      inv.changed();
      this.g.sound.play('inventory-move', 0.5);
      return;
    }
    if (p.cursor) {
      const c = p.cursor;
      if (inv.filters && inv.filters[idx] && inv.filters[idx] !== c.id) return;
      if (!this.slotAccepts(inv, idx, c.id)) return;
      if (!st) { inv.slots[idx] = c; p.cursor = null; }
      else if (st.id === c.id && !st.data) {
        const k = Math.min(stackSize(st.id) - st.n, c.n); st.n += k; c.n -= k; if (c.n <= 0) p.cursor = null;
      } else { inv.slots[idx] = c; p.cursor = st; }
      if (inv === p.main) p.cursorFrom = -1;
      inv.changed();
      this.afterInventoryChange(inv);
      this.g.sound.play('inventory-move', 0.4);
      return;
    }
    if (st) {
      p.cursor = st; inv.slots[idx] = null; p.cursorFrom = inv === p.main ? idx : -1;
      inv.changed();
      this.afterInventoryChange(inv);
      this.g.sound.play('inventory-pick', 0.4);
    }
  }
  slotRight(inv: Inventory, idx: number) {
    const p = this.g.player;
    const st = inv.slots[idx];
    if (p.cursor) {
      const c = p.cursor;
      if (inv.filters && inv.filters[idx] && inv.filters[idx] !== c.id) return;
      if (!this.slotAccepts(inv, idx, c.id)) return;
      if (!st) { inv.slots[idx] = { id: c.id, n: 1, data: c.data }; c.n--; }
      else if (st.id === c.id && st.n < stackSize(st.id)) { st.n++; c.n--; }
      if (c.n <= 0) p.cursor = null;
      inv.changed(); this.afterInventoryChange(inv);
      return;
    }
    if (st) {
      const k = Math.ceil(st.n / 2);
      p.cursor = { id: st.id, n: k }; st.n -= k;
      if (st.n <= 0) inv.slots[idx] = null;
      p.cursorFrom = -1;
      inv.changed(); this.afterInventoryChange(inv);
    }
  }
  slotAccepts(inv: Inventory, idx: number, id: string): boolean {
    const v = (inv as any).accepts as ((id: string) => boolean) | undefined;
    return v ? v(id) : true;
  }
  afterInventoryChange(inv: Inventory) {
    const p = this.g.player;
    if (inv === p.armor) p.onArmorChanged();
  }

  // ---------- tooltips ----------
  showTooltip(html: string, anchor: HTMLElement | null, x?: number, y?: number) {
    const t = this.tooltipEl;
    t.innerHTML = html;
    t.classList.remove('hidden');
    this.tooltipOwner = anchor;
    const r = anchor ? anchor.getBoundingClientRect() : { right: x!, top: y!, left: x!, bottom: y! } as any;
    const tw = t.offsetWidth, th = t.offsetHeight;
    let left = r.right + 8, top = r.top;
    if (left + tw > innerWidth - 4) left = r.left - tw - 8;
    if (top + th > innerHeight - 4) top = innerHeight - th - 4;
    t.style.left = Math.max(4, left) + 'px'; t.style.top = Math.max(4, top) + 'px';
  }
  hideTooltip(owner?: HTMLElement) {
    if (owner && this.tooltipOwner !== owner) return;
    this.tooltipEl.classList.add('hidden'); this.tooltipOwner = null;
  }
  iconHTML(key: string, size = 24): string {
    let k = key; if (FLUIDS[key] && !ITEMS[key]) k = 'fluid:' + key;
    const i = this.icons.index.get(k);
    if (i === undefined) return '';
    const s = this.icons.size, cols = this.icons.cols, sc = size / s;
    return `<span class="icon" style="display:inline-block;vertical-align:middle;width:${size}px;height:${size}px;background-image:url(${this.icons.url});background-size:${this.icons.w * sc}px ${this.icons.h * sc}px;background-position:${-(i % cols) * s * sc}px ${-Math.floor(i / cols) * s * sc}px"></span>`;
  }
  itemTooltip(id: string, st?: Stack | null): string {
    const it = ITEMS[id];
    let html = `<div class="tt-title">${it ? it.name : itemName(id)}</div><div class="tt-body">`;
    if (it) {
      const rids = Object.values(RECIPES).filter(r => r.main === id && this.g.research.enabledRecipes.has(r.id));
      if (rids[0]) html += this.recipeBody(rids[0], false);
      if (it.fuel) html += `<div class="tt-row">Fuel value: <b>${it.fuel >= 1e9 ? (it.fuel / 1e9).toFixed(2) + ' GJ' : (it.fuel / 1e6).toFixed(0) + ' MJ'}</b></div>`;
      if (it.place) { const e = ENTITIES[it.place]; if (e) html += this.entityStats(e); }
      if (it.module) { const m = it.module; html += `<div class="tt-sec">Module effects</div>`; if (m.speed) html += `<div class="tt-row">Speed: ${m.speed > 0 ? '+' : ''}${Math.round(m.speed * 100)}%</div>`; if (m.prod) html += `<div class="tt-row">Productivity: +${Math.round(m.prod * 100)}%</div>`; if (m.energy) html += `<div class="tt-row">Consumption: ${m.energy > 0 ? '+' : ''}${Math.round(m.energy * 100)}%</div>`; if (m.pollution) html += `<div class="tt-row">Pollution: +${Math.round(m.pollution * 100)}%</div>`; }
      if (it.ammo) html += `<div class="tt-row">Damage: ${it.ammo.damage}${it.ammo.pellets ? ' × ' + it.ammo.pellets : ''} ${it.ammo.dtype}</div><div class="tt-row">Magazine size: ${it.ammo.magazine}</div>`;
      if (it.gun) html += `<div class="tt-row">Range: ${it.gun.range}</div><div class="tt-row">Shooting speed: ${it.gun.rate}/s</div>`;
      if (it.armor) { html += `<div class="tt-sec">Resistances</div>`; for (const [k, v] of Object.entries(it.armor.resist)) html += `<div class="tt-row">${k[0].toUpperCase() + k.slice(1)}: ${v[0]}/${Math.round(v[1] * 100)}%</div>`; if (it.armor.grid) html += `<div class="tt-row">Equipment grid: ${it.armor.grid[0]}×${it.armor.grid[1]}</div>`; if (it.armor.invBonus) html += `<div class="tt-row">Inventory bonus: +${it.armor.invBonus}</div>`; }
      html += `<div class="tt-row muted">Stack size: ${it.stack}</div>`;
    }
    html += '</div>';
    return html;
  }
  entityStats(e: any): string {
    let s = '';
    if (e.speed && e.type !== 'mining-drill') s += `<div class="tt-row">Crafting speed: <b>${e.speed}</b></div>`;
    if (e.type === 'mining-drill') s += `<div class="tt-row">Mining speed: <b>${e.speed}/s</b></div><div class="tt-row">Mining area: ${e.miningArea}×${e.miningArea}</div>`;
    if (e.energy) s += `<div class="tt-row">${e.source === 'burner' ? 'Max consumption' : 'Energy consumption'}: <b>${fmtPower(e.energy)}</b> ${e.source === 'electric' ? 'electric' : e.source || ''}</div>`;
    if (e.drain) s += `<div class="tt-row muted">Drain: ${fmtPower(e.drain)}</div>`;
    if (e.power && e.type !== 'accumulator') s += `<div class="tt-row">Power output: <b>${fmtPower(e.power)}</b></div>`;
    if (e.type === 'accumulator') s += `<div class="tt-row">Capacity: 5 MJ</div><div class="tt-row">Max in/out: 300 kW</div>`;
    if (e.pollution) s += `<div class="tt-row">Pollution: ${e.pollution}/m</div>`;
    if (e.modules) s += `<div class="tt-row">Module slots: ${e.modules}</div>`;
    if (e.slots && e.type === 'container') s += `<div class="tt-row">Inventory size: ${e.slots}</div>`;
    if (e.beltSpeed) s += `<div class="tt-row">Speed: <b>${e.beltSpeed * 60 / 256 * 8} items/s</b></div>`;
    if (e.rotSpeed) s += `<div class="tt-row">Rotation speed: ${Math.round(e.rotSpeed * 360 * 60)}°/s</div>`;
    if (e.reach) s += `<div class="tt-row">Wire reach: ${e.reach}</div>`;
    if (e.supply && e.type === 'electric-pole') s += `<div class="tt-row">Supply area: ${e.supply * 2}×${e.supply * 2}</div>`;
    if (e.range) s += `<div class="tt-row">Range: ${e.range}</div>`;
    s += `<div class="tt-row muted">Health: ${e.health}</div>`;
    return s;
  }
  recipeBody(r: RecipeProto, full = true): string {
    let s = `<div class="tt-sec">Recipe</div><div class="tt-row">`;
    for (const i of r.ing) s += `${this.iconHTML(i.id)} <span>${i.n} × ${itemName(i.id)}</span><br>`;
    s += `${this.iconHTML('fluid:steam', 0)}<span class="muted">⏱ ${r.time}s</span></div>`;
    if (r.res.length > 1 || r.res[0].n !== 1 || r.res[0].fluid) {
      s += `<div class="tt-sec">Products</div><div class="tt-row">`;
      for (const p of r.res) s += `${this.iconHTML(p.id)} <span>${p.p !== undefined ? (p.p * 100).toFixed(1) + '% ' : ''}${p.n} × ${itemName(p.id)}</span><br>`;
      s += '</div>';
    }
    if (!r.hand) s += `<div class="tt-row warn">Cannot be crafted by hand</div>`;
    return s;
  }
  recipeTooltip(r: RecipeProto): string {
    const p = this.g.player;
    let html = `<div class="tt-title">${r.name}${r.res.length === 1 && r.res[0].n > 1 ? ' (' + r.res[0].n + ')' : ''}</div><div class="tt-body">`;
    html += `<div class="tt-sec">Ingredients:</div>`;
    for (const i of r.ing) {
      const have = i.fluid ? 0 : p.main.count(i.id);
      html += `<div class="tt-row">${this.iconHTML(i.id)} <span class="${!i.fluid && have < i.n ? 'warn' : ''}">${i.n} × ${itemName(i.id)}</span>${i.fluid ? '' : ` <span class="muted">(${have})</span>`}</div>`;
    }
    html += `<div class="tt-row muted">⏱ ${r.time}s crafting time</div>`;
    if (r.res.length > 1 || r.res[0].fluid) { html += `<div class="tt-sec">Products:</div>`; for (const pr of r.res) html += `<div class="tt-row">${this.iconHTML(pr.id)} ${pr.p !== undefined ? (pr.p * 100).toFixed(1) + '% ' : ''}${pr.n} × ${itemName(pr.id)}</div>`; }
    const it = ITEMS[r.main];
    if (it?.place) html += this.entityStats(ENTITIES[it.place]);
    if (!r.hand) html += `<div class="tt-row warn">Must be crafted in a machine</div>`;
    else { const c = p.craftableCount(r.id); html += `<div class="tt-row ${c ? 'ok' : 'warn'}">${c ? 'Can craft ' + c : 'Missing ingredients'}</div>`; }
    html += `<div class="tt-row muted">Left click: craft 1 · Right click: craft 5 · Shift: craft all</div></div>`;
    return html;
  }

  // ---------- windows ----------
  openWindow(w: Win, center = true) {
    this.root.appendChild(w.el);
    this.windows.push(w);
    if (center) w.center();
    this.g.sound.play('gui-open', 0.4);
  }
  closeWindow(w: Win) {
    const i = this.windows.indexOf(w);
    if (i < 0) return;
    this.windows.splice(i, 1);
    w.el.remove();
    w.onClose();
    this.hideTooltip();
    this.g.sound.play('gui-close', 0.3);
  }
  closeAll() { for (const w of this.windows.slice()) this.closeWindow(w); }
  findWindow(key: string) { return this.windows.find(w => w.key === key); }
  toggleWindow(key: string, make: (() => Win) | null) {
    const w = this.findWindow(key);
    if (w) { this.closeWindow(w); return; }
    if (!make) return;
    this.closeAll();
    this.openWindow(make());
  }
  openEntity(e: Entity) {
    if (!this.openEntityWin) return;
    const p = this.g.player;
    if (e.isBuilding && !p.canReach(e.x, e.y, 10) && !e.type.includes('pole')) { this.flyText(e.x, e.y, 'Out of reach', '#ff8a6a'); return; }
    const w = this.openEntityWin(e);
    if (!w) return;
    this.closeAll();
    this.openWindow(w);
  }
  onEntityRemoved(e: Entity) {
    for (const w of this.windows.slice()) if ((w as any).entity === e) this.closeWindow(w);
  }

  onKey(k: string, e: KeyboardEvent): boolean {
    const anyWin = this.windows.length > 0;
    switch (k) {
      case 'KeyE': if (anyWin) this.closeAll(); else this.toggleWindow('character', this.openCharacter); return true;
      case 'Escape': if (anyWin) { this.closeAll(); return true; } if (this.g.player.cursorItem()) { this.g.player.clearCursor(); return true; } this.openMenu?.(); return true;
      case 'KeyT': this.toggleWindow('tech', this.openTech); return true;
      case 'KeyM': this.toggleWindow('map', this.openMap); return true;
      case 'KeyP': this.toggleWindow('stats', this.openStats); return true;
      case 'Backquote': if (anyWin) this.closeAll(); else this.openMenu?.(); return true;
    }
    return false;
  }

  // ---------- HUD ----------
  buildHUD() {
    const R = this.root;
    // research
    const rh = h('div', 'hud-el', R); rh.id = 'research-hud';
    rh.onclick = () => this.toggleWindow('tech', this.openTech);
    this.hud.research = rh;
    // minimap
    const mw = h('div', 'hud-el', R); mw.id = 'minimap-wrap';
    const mc = h('canvas', '', mw) as HTMLCanvasElement; mc.id = 'minimap';
    mc.onclick = () => this.toggleWindow('map', this.openMap);
    const info = h('div', '', mw); info.id = 'minimap-info';
    this.hud.mmInfo = info;
    this.minimap = new Minimap(this.g, mc);
    // alerts
    const al = h('div', 'hud-el', R); al.id = 'alerts'; this.hud.alerts = al;
    // hover info
    const hi = h('div', 'hud-el hidden', R); hi.id = 'hover-info'; this.hud.hover = hi;
    // quickbar
    const qb = h('div', 'hud-el', R); qb.id = 'quickbar';
    this.hud.quickbar = qb;
    for (let row = 0; row < 2; row++) {
      const r = h('div', 'qrow', qb);
      for (let i = 0; i < 10; i++) {
        if (i === 5) h('div', 'gap', r);
        const idx = row * 10 + i;
        const s = this.slot(r, {
          onLeft: () => this.quickbarClick(idx),
          onRight: () => { this.g.player.quickbar[idx] = null; },
          tooltip: () => { const id = this.g.player.quickbar[idx]; return id ? this.itemTooltip(id) : null; },
        });
        const key = h('div', 'key', s, row === 0 ? String((i + 1) % 10) : '');
        void key;
        this.qbSlots.push(s);
      }
    }
    // weapons
    const wp = h('div', 'hud-el', R); wp.id = 'weapons'; this.hud.weapons = wp;
    for (let i = 0; i < 3; i++) {
      const c = h('div', 'wcol', wp);
      const p = this.g.player;
      const gs = this.invSlot(c, () => this.g.player.guns, i, () => ({ insert: s => this.g.player.main.insertStack(s) }));
      const as = this.invSlot(c, () => this.g.player.ammo, i, () => ({ insert: s => this.g.player.main.insertStack(s) }));
      gs.addEventListener('click', () => { p.selectedGun = i; });
      (gs as any)._gun = i;
    }
    // health bar
    const hb = h('div', 'hud-el', R); hb.id = 'health'; h('div', '', hb); this.hud.health = hb;
    // crafting queue
    const cq = h('div', 'hud-el', R); cq.id = 'craftqueue'; this.hud.craft = cq;
    // mining bar
    const mb = h('div', 'hud-el progress hidden', R); mb.id = 'mining-bar'; h('div', '', mb); this.hud.mining = mb;
    // touch controls
    this.buildTouchControls();
  }

  buildTouchControls() {
    const R = this.root;
    const tc = h('div', 'hud-el', R); tc.id = 'touch-controls';
    const btn = (label: string, glyph: string, fn: () => void, hold?: (down: boolean) => void) => {
      const b = h('div', 'tbtn', tc);
      b.innerHTML = `<b>${glyph}</b>${label}`;
      b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); if (hold) { hold(true); b.classList.add('on'); } else fn(); });
      b.addEventListener('pointerup', e => { if (hold) { hold(false); b.classList.remove('on'); } });
      b.addEventListener('pointerleave', () => { if (hold) { hold(false); b.classList.remove('on'); } });
      return b;
    };
    const mine = btn('Mine', '⛏', () => { this.input.mineMode = !this.input.mineMode; mine.classList.toggle('on', this.input.mineMode); });
    btn('Rotate', '⟳', () => this.input.rotate(1));
    btn('Pipette', '◎', () => this.input.pipette());
    btn('Pick up', '✋', () => { }, d => this.input.pickingUp = d);
    btn('Shoot', '✦', () => { }, d => this.shootHeld = d);
    btn('Clear', '✕', () => this.g.player.clearCursor());
    this.hud.touch = tc;
    const tl = h('div', 'hud-el', R); tl.id = 'touch-left';
    const lb = (label: string, glyph: string, fn: () => void) => { const b = h('div', 'tbtn', tl); b.innerHTML = `<b>${glyph}</b>${label}`; b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); fn(); }); return b; };
    lb('Inventory', '▦', () => { if (this.windows.length) this.closeAll(); else this.toggleWindow('character', this.openCharacter); });
    lb('Research', '⚗', () => this.toggleWindow('tech', this.openTech));
    lb('Map', '◫', () => this.toggleWindow('map', this.openMap));
    const altb = lb('Alt', 'ⓘ', () => { this.input.alt = !this.input.alt; altb.classList.toggle('on', this.input.alt); });
    lb('Stats', '▤', () => this.toggleWindow('stats', this.openStats));
    lb('Menu', '☰', () => this.openMenu?.());
    this.hud.touchLeft = tl;
    const hint = h('div', 'hud-el', R); hint.id = 'joy-hint'; hint.textContent = 'Drag to move'; this.hud.joyHint = hint;
    const joy = h('div', 'hidden', document.body); joy.id = 'joystick'; h('div', '', joy); this.hud.joy = joy;
    this.applyTouchVisibility();
  }
  applyTouchVisibility() {
    const show = this.touchUI && (performance.now() - this.input.lastKeyboardUse > 60000 || this.input.lastKeyboardUse === 0);
    for (const k of ['touch', 'joyHint']) this.hud[k]?.classList.toggle('hidden', !show);
    this.hud.touchLeft?.classList.toggle('hidden', !this.touchUI);
  }
  joystickEnabled() { return this.touchUI && !this.hud.joyHint.classList.contains('hidden'); }
  showJoystick(x: number, y: number) { const j = this.hud.joy; j.classList.remove('hidden'); j.style.left = x + 'px'; j.style.top = y + 'px'; (j.firstChild as HTMLElement).style.transform = ''; }
  moveJoystick(dx: number, dy: number) { (this.hud.joy.firstChild as HTMLElement).style.transform = `translate(${dx}px, ${dy}px)`; }
  hideJoystick() { this.hud.joy.classList.add('hidden'); }
  haptic() { try { (navigator as any).vibrate?.(15); } catch { /* */ } }

  quickbarClick(idx: number) {
    const p = this.g.player;
    const id = p.quickbar[idx];
    if (p.cursor && (!id || id !== p.cursor.id)) { p.quickbar[idx] = p.cursor.id; return; }
    if (!id) return;
    if (p.cursorItem() === id) { p.clearCursor(); return; }
    if (!p.selectItem(id)) this.flyText(p.x, p.y, 'No ' + ITEMS[id].name, '#ff8a6a');
  }
  swapQuickbarRows() { const q = this.g.player.quickbar; const a = q.slice(0, 10), b = q.slice(10); this.g.player.quickbar = [...b, ...a]; }

  onPointerMove(e: PointerEvent) {
    this.cursorEl.style.left = (e.clientX - 20) + 'px';
    this.cursorEl.style.top = (e.clientY - 20) + 'px';
  }

  flyText(x: number, y: number, text: string, color = '#ffffff') {
    const [sx, sy] = this.r.worldToScreen(x, y);
    const n = this.flyLayer.childElementCount;
    if (n > 30) this.flyLayer.firstChild?.remove();
    const d = h('div', 'flytext', this.flyLayer, text);
    d.style.color = color;
    const off = [...this.flyLayer.children].filter(c => c !== d && Math.abs(parseFloat((c as HTMLElement).style.left) - sx / this.r.dpr) < 40).length;
    (d as any)._wx = x; (d as any)._wy = y - off * 0.45; (d as any)._t = 0;
    d.style.left = sx / this.r.dpr + 'px'; d.style.top = sy / this.r.dpr + 'px';
  }
  showMessage(text: string, ms = 4000) {
    this.msgEl.textContent = text;
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => { this.msgEl.textContent = ''; }, ms);
  }
  alert(kind: string, e: Entity) {
    if (this.alerts.some(a => a.e === e)) return;
    this.alerts.push({ kind, e, t: this.g.tick });
    if (kind === 'destroyed') this.g.sound.play('alert', 0.6);
  }

  // per-frame HUD refresh
  update() {
    this.frame++;
    const g = this.g, p = g.player;
    // flytext
    for (const c of [...this.flyLayer.children] as HTMLElement[]) {
      const t = ++(c as any)._t;
      if (t > 75) { c.remove(); continue; }
      const [sx, sy] = this.r.worldToScreen((c as any)._wx, (c as any)._wy - t * 0.012);
      c.style.left = sx / this.r.dpr + 'px'; c.style.top = sy / this.r.dpr + 'px';
      c.style.opacity = String(Math.min(1, (75 - t) / 25));
    }
    // cursor stack icon over GUI
    const overUI = this.windows.length > 0;
    if (p.cursor && overUI) {
      this.cursorEl.classList.remove('hidden');
      if (!(this.cursorEl as any)._ic) { (this.cursorEl as any)._ic = this.icon(p.cursor.id, 32, this.cursorEl); (this.cursorEl as any)._cnt = h('div', 'count', this.cursorEl); }
      this.setIcon((this.cursorEl as any)._ic, p.cursor.id, 32);
      (this.cursorEl as any)._cnt.textContent = p.cursor.n > 1 ? fmtNum(p.cursor.n) : '';
    } else this.cursorEl.classList.add('hidden');
    if (this.frame % 3 !== 0) return;
    // quickbar
    for (let i = 0; i < 20; i++) {
      const s = this.qbSlots[i];
      const id = p.quickbar[i];
      const n = id ? p.count(id) : 0;
      this.setSlot(s, id && n > 0 ? { id, n } : null, id && n === 0 ? id : null);
      s.classList.toggle('selected', !!id && p.cursorItem() === id);
    }
    // weapons
    const wcols = this.hud.weapons.querySelectorAll('.wcol');
    wcols.forEach((c, i) => { c.querySelectorAll('.slot').forEach(s => { (s as any)._bind?.(); (s as HTMLElement).classList.toggle('selected', i === p.selectedGun); }); });
    // health
    const hp = p.character.health / p.character.maxHealth;
    (this.hud.health.firstChild as HTMLElement).style.width = (hp * 100) + '%';
    this.hud.health.classList.toggle('hidden', hp >= 1 || p.dead);
    // mining bar
    const mb = this.hud.mining;
    if (p.mineTarget && p.mineProgress > 0) { mb.classList.remove('hidden'); (mb.firstChild as HTMLElement).style.width = (p.mineProgress * 100) + '%'; }
    else mb.classList.add('hidden');
    // research
    this.updateResearchHUD();
    // crafting queue
    this.updateCraftQueue();
    // alerts
    if (this.frame % 15 === 0) this.updateAlerts();
    // windows
    for (const w of this.windows) w.update();
    // hover info
    this.updateHoverInfo();
    if (this.frame % 30 === 0 || this.frame === 3) { this.minimap.draw(); this.applyTouchVisibility(); this.updateMinimapInfo(); }
  }
  updateMinimapInfo() {
    const g = this.g;
    const day = Math.floor(g.playTicks / 25000) + 1;
    const t = g.playTicks / 60;
    this.hud.mmInfo.textContent = '';
    h('span', '', this.hud.mmInfo, `${Math.floor(g.player.x)}, ${Math.floor(g.player.y)}`);
    h('span', '', this.hud.mmInfo, `${fmtTime(t)}`);
    void day;
  }
  updateResearchHUD() {
    const res = this.g.research, el = this.hud.research;
    const cur = res.current;
    const key = cur + ':' + Math.floor(res.progress);
    if ((el as any)._k === key && this.frame % 30 !== 0) return;
    (el as any)._k = key;
    el.innerHTML = '';
    if (!cur) {
      const d = h('div', 'col', el);
      h('div', 'name', d, 'No research');
      h('div', 'label', d, 'Press T to choose research');
      return;
    }
    const t = TECHS[cur];
    this.techIcon(cur, 48, el);
    const d = h('div', 'col', el); d.style.gap = '3px';
    const lvl = t.maxLevel > 1 ? ' ' + res.nextLevel(cur) : '';
    h('div', 'name', d, t.name + lvl);
    const c = res.currentCost();
    const pr = h('div', 'progress blue', d); pr.style.width = '170px'; pr.style.height = '14px';
    const bar = h('div', '', pr); bar.style.width = (res.progress / c.count * 100) + '%';
    const sp = h('span', '', pr, `${Math.floor(res.progress / c.count * 100)}%`); sp.style.lineHeight = '14px'; sp.style.fontSize = '11px';
  }
  updateCraftQueue() {
    const q = this.g.player.craftQueue, el = this.hud.craft;
    const key = q.map(j => j.recipe + j.count).join(',');
    if ((el as any)._k !== key) {
      (el as any)._k = key;
      el.innerHTML = '';
      q.forEach((j, idx) => {
        const r = RECIPES[j.recipe];
        const s = this.slot(el, { onLeft: () => this.g.player.cancelCraft(idx, 1), onRight: () => this.g.player.cancelCraft(idx, 5), tooltip: () => `<div class="tt-title">${r.name}</div><div class="tt-body">Click to cancel 1, right click 5</div>` });
        this.setSlot(s, { id: r.main, n: j.count * r.res[0].n }, null, String(j.count * (r.res[0]?.n || 1)));
        const pg = h('div', 'prog', s); (s as any)._prog = pg;
      });
    }
    const first = el.firstChild as HTMLElement;
    if (first && q[0]) (first as any)._prog.style.height = (q[0].progress * 100) + '%';
  }
  updateAlerts() {
    const el = this.hud.alerts;
    this.alerts = this.alerts.filter(a => this.g.tick - a.t < 60 * 30);
    // also no-power/no-fuel? keep simple: destroyed + under attack
    const key = this.alerts.map(a => a.e.id).join(',');
    if ((el as any)._k === key) return;
    (el as any)._k = key;
    el.innerHTML = '';
    for (const a of this.alerts.slice(-6)) {
      const s = this.slot(el, { tooltip: () => `<div class="tt-title">${a.kind === 'destroyed' ? 'Entity destroyed' : 'Under attack'}</div><div class="tt-body">${a.e.proto.name} at ${Math.floor(a.e.x)}, ${Math.floor(a.e.y)}</div>` });
      this.setSlot(s, { id: a.e.proto.item || 'iron-plate', n: 1 }, null, '');
      s.style.background = 'linear-gradient(#a33a32, #7a2a24)';
    }
  }
  updateHoverInfo() {
    const el = this.hud.hover;
    const e = this.input.view.hover;
    if (!e || this.windows.length || !e.selectable) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const key = e.id + ':' + this.frame;
    void key;
    let html = `<div class="tt-title">${e.type === 'tree' ? 'Tree' : e.type === 'simple-entity' ? 'Rock' : e.type === 'item-on-ground' ? itemName((e as any).item) : e.proto.name}</div><div class="tt-body">`;
    if (e.isBuilding || e.type === 'tree') html += `<div>Health: ${Math.ceil(e.health)}/${e.maxHealth}</div>`;
    if ((e as any).recipe) html += `<div>Recipe: ${this.iconHTML(this.recipeIconKey((e as any).recipe), 18)} ${(e as any).recipe.name}</div>`;
    if (e.status) html += `<div class="muted">Status: ${statusText(e.status)}</div>`;
    for (const d of e.description()) html += `<div>${d}</div>`;
    if (e.proto.source === 'electric' && e.isBuilding) html += `<div class="muted">Power: ${e.elecNet ? Math.round(e.power * 100) + '%' : 'not connected'}</div>`;
    html += '</div>';
    if ((el as any)._h !== html) { el.innerHTML = html; (el as any)._h = html; }
  }

  // ---------- world actions ----------
  rotateEntity(e: Entity, d: number) { this.rotateEntityTo(e, ((e.dir + d + 4) & 3) as Dir); }
  rotateEntityTo(e: Entity, nd: Dir) {
    const g = this.g;
    if (e.type === 'underground-belt' && (e.dir + 2) % 4 === nd) { /* flip kind */ }
    if (e.type === 'underground-belt') {
      // rotating an underground flips its direction and in/out kind
      const u = e as any;
      u.kind = u.kind === 'in' ? 'out' : 'in';
      e.dir = ((e.dir + 2) & 3) as Dir;
      g.belts.dirty = true; g.sound.play('rotate', 0.5); return;
    }
    const state = e.serialize();
    const w = e.proto.w, hh = e.proto.h;
    if (w !== hh) {
      // non-square: check room
      const chk = g.world.canPlace(e.name, e.x, e.y, nd, { ignore: e });
      if (!chk.ok) { this.flyText(e.x, e.y, chk.reason || 'Cannot rotate', '#ff8a6a'); return; }
    }
    const x = e.x, y = e.y, name = e.name, flags = e.flags;
    g.removeEntity(e);
    const ne = createEntity(name, x, y, nd);
    ne.flags = flags;
    g.addEntity(ne);
    try { ne.load(state); } catch { /* */ }
    if ((ne as any).updatePositions) (ne as any).updatePositions();
    g.sound.play('rotate', 0.5);
  }
  fastTransfer(e: Entity, fromCursor: boolean) {
    const p = this.g.player;
    if (fromCursor && p.cursor) {
      const n = e.insertItem(p.cursor.id, p.cursor.n, 'player');
      if (n > 0) { p.cursor.n -= n; this.flyText(e.x, e.y, `-${n} ${itemName(p.cursor.id)}`); if (p.cursor.n <= 0) p.cursor = null; }
      return;
    }
    // take outputs / contents
    let took = 0;
    for (const inv of e.inventories()) {
      if (inv === (e as any).input || inv === (e as any).modules || inv === (e as any).source || (e as any).burner?.fuel === inv) continue;
      for (let i = 0; i < inv.slots.length; i++) {
        const s = inv.slots[i];
        if (!s) continue;
        const n = p.give(s.id, s.n, false);
        s.n -= n; took += n;
        if (s.n <= 0) inv.slots[i] = null;
        if (n) this.flyText(e.x, e.y, `+${n} ${itemName(s.id)}`);
      }
      inv.changed();
    }
  }
  pickupNearby() {
    const g = this.g, p = g.player;
    if (g.tick % 4 !== 0) return;
    const items = g.world.entitiesIn(p.x - 1.5, p.y - 1.5, p.x + 1.5, p.y + 1.5, e => e.type === 'item-on-ground', 2) as any[];
    if (items.length) {
      const it = items[0];
      if (p.give(it.item, 1, false)) { g.removeEntity(it); g.sound.play('pickup', 0.3); }
      return;
    }
    // belts under/near player
    for (const b of g.world.entitiesIn(p.x - 1.2, p.y - 1.2, p.x + 1.2, p.y + 1.2, e => e instanceof BeltBase, 2) as BeltBase[]) {
      const id = b.takeItemNear(b.x, b.y);
      if (id) { if (!p.give(id, 1, false)) { g.spillItem(b.x, b.y, id, 1); } g.sound.play('pickup', 0.3); return; }
    }
  }
  wireClick(e: Entity | null, color: 'red' | 'green') { this.g.circuits?.wireClick(e, color); }
  areaSelected(mode: string, x0: number, y0: number, x1: number, y1: number) { this.g.logistics?.areaSelected?.(mode, x0, y0, x1, y1); }
  copySettings(e: Entity | null) { if (e && e.isBuilding) { this.copied = { name: e.name, data: e.serialize() }; this.flyText(e.x, e.y, 'Settings copied'); } }
  pasteSettings(e: Entity) {
    if (!this.copied || !e.isBuilding) return;
    const c = this.copied;
    if ((e as any).setRecipe && c.data.r && (e as any).canUse?.(RECIPES[c.data.r])) { (e as any).setRecipe(RECIPES[c.data.r], (s: Stack) => this.g.player.give(s.id, s.n)); this.flyText(e.x, e.y, 'Settings pasted'); }
    else if (e.name === c.name && e.type === 'inserter') { (e as any).filters = c.data.f; (e as any).useFilters = c.data.uf; (e as any).filterMode = c.data.fm; }
    else if (e.name === c.name && e.type === 'splitter') { (e as any).outPriority = c.data.op; (e as any).inPriority = c.data.ip; (e as any).filter = c.data.f; }
  }
  toggleVehicle() { this.g.combat?.toggleVehicle?.(); }
  driveVehicle(mx: number, my: number) { this.g.combat?.drive?.(mx, my); }
  paste() { }
  showVictory() { }
  placeBlueprint(x: number, y: number) { this.g.logistics?.placeBlueprint?.(x, y); }
}

export function statusText(s: string): string {
  const m: Record<string, string> = {
    'working': 'Working', 'no-recipe': 'No recipe', 'no-ingredients': 'Item ingredient shortage', 'output-full': 'Output full', 'no-power': 'No power',
    'low-power': 'Low power', 'no-fuel': 'No fuel', 'waiting-source': 'Waiting for source items', 'waiting-target': 'Waiting for space in destination',
    'no-resources': 'No minable resources', 'no-research': 'No research in progress', 'missing-packs': 'Missing science packs', 'no-water': 'No input fluid',
    'disabled': 'Disabled by control behavior', 'no-fluid': 'Fluid ingredient shortage', 'waiting-payload': 'Waiting for payload', 'ready': 'Ready to launch', 'no-ammo': 'No ammo',
  };
  return m[s] || s;
}
