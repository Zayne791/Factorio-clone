// Entity GUIs: containers, machines, furnaces, drills, labs, boilers, generators, inserters, poles, fluids, turrets, silo...
import { Win, h, UI, statusText } from './ui';
import { InventoryPanel } from './char-window';
import { Entity } from '../sim/entity';
import { Inventory, Stack } from '../sim/inventory';
import { ITEMS, RECIPES, FLUIDS, GROUPS, GROUP_NAMES, SUBGROUP_ORDER, RecipeProto, itemName, TECHS } from '../data/protos';
import { G, fmtNum, fmtPower, fmtEnergy } from '../core';
import { CraftingMachine, Furnace, Lab, Beacon, RocketSilo, Machine } from '../sim/crafting';
import { MiningDrill } from '../sim/mining';
import { Boiler, Generator, Accumulator, SolarPanel, ElectricPole } from '../sim/power';
import { Inserter } from '../sim/inserter';
import { FluidBox } from '../sim/fluids';
import { Splitter } from '../sim/belts';
import { Container } from '../sim/simple';

type Updater = () => void;

export class EntityWindow extends Win {
  entity: Entity;
  updaters: Updater[] = [];
  playerInv: InventoryPanel;
  panel: HTMLDivElement;
  constructor(ui: UI, e: Entity) {
    super(ui, e.proto.name, 'entitywin', 'entity:' + e.id);
    this.entity = e;
    const row = h('div', 'row', this.body); row.style.alignItems = 'flex-start';
    const left = h('div', 'panel', row);
    const p = ui.g.player;
    this.playerInv = new InventoryPanel(ui, left, 'Inventory', () => p.main, () => ({ insert: (s: Stack) => this.insertIntoEntity(s) }));
    this.panel = h('div', 'panel col', row);
    this.panel.style.minWidth = '330px';
    this.build();
  }
  insertIntoEntity(s: Stack): number { return this.entity.insertItem(s.id, s.n, 'player'); }
  toPlayer = () => ({ insert: (s: Stack) => this.ui.g.player.main.insertStack(s) });

  section(title: string): HTMLDivElement {
    const s = h('div', 'col', this.panel);
    if (title) h('div', 'subtitle', s, title);
    return s;
  }
  status(parent: HTMLElement) {
    const st = h('div', 'status', parent);
    h('div', 'dot', st);
    const tx = h('span', '', st);
    this.updaters.push(() => {
      const e = this.entity;
      let s = e.status || 'working';
      if (e.proto.source === 'electric' && (!e.elecNet || e.power <= 0) && s !== 'no-recipe') s = 'no-power';
      tx.textContent = statusText(s);
      st.classList.toggle('warn', ['output-full', 'no-ingredients', 'waiting-source', 'waiting-target', 'no-recipe', 'low-power', 'missing-packs', 'no-research', 'waiting-payload'].includes(s));
      st.classList.toggle('bad', ['no-power', 'no-fuel', 'no-resources', 'no-water', 'no-fluid', 'no-ammo'].includes(s));
    });
  }
  progress(parent: HTMLElement, get: () => number, label?: () => string, cls = '') {
    const pr = h('div', 'progress ' + cls, parent);
    const bar = h('div', '', pr);
    const sp = h('span', '', pr);
    this.updaters.push(() => { const v = Math.max(0, Math.min(1, get())); bar.style.width = (v * 100) + '%'; if (label) sp.textContent = label(); });
    return pr;
  }
  invGrid(parent: HTMLElement, inv: () => Inventory, cols = 10, other = this.toPlayer) {
    const g = h('div', 'grid', parent);
    g.style.gridTemplateColumns = `repeat(${Math.min(cols, Math.max(1, inv().size))}, var(--slot))`;
    const slots: HTMLDivElement[] = [];
    for (let i = 0; i < inv().size; i++) slots.push(this.ui.invSlot(g, inv, i, other));
    this.updaters.push(() => { for (const s of slots) (s as any)._bind(); });
    return g;
  }
  fluidBar(parent: HTMLElement, box: () => FluidBox | null, label = '') {
    const wrap = h('div', 'col', parent); wrap.style.alignItems = 'center'; wrap.style.gap = '2px';
    const fb = h('div', 'fluidbar', wrap);
    const fill = h('div', '', fb);
    const lab = h('div', 'mini-label', wrap, label);
    fb.addEventListener('pointerenter', () => { const b = box(); if (!b) return; const f = b.contentFluid || b.filter; this.ui.showTooltip(`<div class="tt-title">${f ? FLUIDS[f].name : 'Empty'}</div><div class="tt-body">${b.content.toFixed(1)} / ${b.volume}${b.contentFluid === 'steam' && b.segment ? '<br>Temperature: ' + Math.round(b.segment.temp) + '°C' : ''}</div>`, fb); });
    fb.addEventListener('pointerleave', () => this.ui.hideTooltip(fb));
    this.updaters.push(() => {
      const b = box();
      if (!b) { fill.style.height = '0'; return; }
      const f = b.contentFluid || b.filter;
      const c = f ? FLUIDS[f].color : [0.3, 0.3, 0.3];
      fill.style.background = `linear-gradient(rgb(${c[0] * 300},${c[1] * 300},${c[2] * 300}), rgb(${c[0] * 200},${c[1] * 200},${c[2] * 200}))`;
      fill.style.height = Math.min(100, b.content / b.volume * 100) * 1.06 - 2 + 'px';
      lab.textContent = f ? `${FLUIDS[f].name.split(' ')[0]} ${fmtNum(b.content)}` : label || 'Empty';
    });
    return wrap;
  }
  powerInfo(parent: HTMLElement) {
    const e = this.entity;
    if (e.proto.source !== 'electric') return;
    const row = h('div', 'row', parent);
    h('div', 'label', row, 'Power');
    this.progress(row, () => e.elecNet ? e.power : 0, () => e.elecNet ? `${Math.round(e.power * 100)}% · ${fmtPower((e.proto.energy || 0))}` : 'Not connected', 'green').style.flex = '1';
  }
  modulesRow(parent: HTMLElement, m: Machine) {
    if (!m.modules || !m.modules.size) return;
    const row = h('div', 'row', parent);
    h('div', 'label', row, 'Modules');
    (m.modules as any).accepts = (id: string) => {
      const mod = ITEMS[id]?.module;
      if (!mod) return false;
      if (mod.cat === 'productivity') { if (m instanceof Beacon) return false; if (m instanceof CraftingMachine) return !m.recipe || m.recipe.allowProd; }
      return true;
    };
    this.invGrid(row, () => m.modules!, 4);
    const eff = h('div', 'mini-label', parent);
    this.updaters.push(() => {
      const ef = m.effects();
      const parts: string[] = [];
      if (ef.speed) parts.push(`Speed ${ef.speed > 0 ? '+' : ''}${Math.round(ef.speed * 100)}%`);
      if (ef.prod) parts.push(`Productivity +${Math.round(ef.prod * 100)}%`);
      if (ef.energy) parts.push(`Consumption ${ef.energy > 0 ? '+' : ''}${Math.round(ef.energy * 100)}%`);
      if (ef.pollution) parts.push(`Pollution +${Math.round(ef.pollution * 100)}%`);
      eff.textContent = parts.join(' · ');
    });
  }
  burnerRow(parent: HTMLElement, burner: { fuel: Inventory; burnt: Inventory | null; energy: number } | null) {
    if (!burner) return;
    const row = h('div', 'row', parent);
    h('div', 'label', row, 'Fuel');
    (burner.fuel as any).accepts = (id: string) => !!ITEMS[id]?.fuel;
    this.invGrid(row, () => burner.fuel, 4);
    if (burner.burnt) this.invGrid(row, () => burner.burnt!, 4);
    const pr = this.progress(row, () => Math.min(1, burner.energy / 4e6), () => '', 'green');
    pr.style.width = '80px'; pr.style.minWidth = '80px';
  }

  build() {
    const e = this.entity;
    const P = this.panel;
    if (e instanceof RocketSilo) return this.buildSilo(e);
    if (e instanceof CraftingMachine) return this.buildCrafter(e);
    if (e instanceof Furnace) return this.buildFurnace(e);
    if (e instanceof Lab) return this.buildLab(e);
    if (e instanceof MiningDrill) return this.buildDrill(e);
    if (e instanceof Boiler) return this.buildBoiler(e);
    if (e instanceof Generator) return this.buildGenerator(e);
    if (e instanceof Inserter) return this.buildInserter(e);
    if (e instanceof Beacon) { this.status(P); this.powerInfo(P); this.modulesRow(P, e); return; }
    if (e instanceof Container) return this.buildContainer(e);
    if (e instanceof ElectricPole) return this.buildPole(e);
    if (e instanceof Accumulator) { this.status(P); this.progress(P, () => e.stored / e.cap, () => `${(e.stored / 1e6).toFixed(2)} / 5 MJ`, 'blue'); return; }
    if (e instanceof SolarPanel) { const t = h('div', 'label', P); this.updaters.push(() => t.textContent = `Output: ${fmtPower(60e3 * this.ui.g.daylight)} (daylight ${Math.round(this.ui.g.daylight * 100)}%)`); return; }
    if (e instanceof Splitter) return this.buildSplitter(e);
    if ((e as any).fluidBoxes) {
      const row = h('div', 'row', P);
      for (const b of (e as any).fluidBoxes as FluidBox[]) this.fluidBar(row, () => b, b.kind);
      return;
    }
    if ((e as any).buildGUI) { (e as any).buildGUI(this, P); return; }
    for (const d of e.description()) h('div', 'label', P, d);
    const inv = e.inventories();
    for (const i of inv) this.invGrid(P, () => i, 10);
  }

  buildContainer(e: Container) {
    const P = this.panel;
    const t = h('div', 'subtitle', P, e.proto.name === e.name ? 'Contents' : 'Contents');
    void t;
    const sc = h('div', 'scroll', P); sc.style.maxHeight = 'calc(100vh - 220px)';
    this.invGrid(sc, () => e.inv, 10);
    if (e.logistic === 'requester' || e.logistic === 'buffer') this.ui.g.logistics?.buildRequestGUI?.(this, P, e);
    if ((e as any).buildGUIExtra) (e as any).buildGUIExtra(this, P);
  }

  buildCrafter(e: CraftingMachine) {
    const P = this.panel, ui = this.ui;
    this.status(P);
    const rr = h('div', 'row', P);
    h('div', 'label', rr, 'Recipe:');
    const rb = ui.slot(rr, { onLeft: () => this.openRecipePicker(e), tooltip: () => e.recipe ? ui.recipeTooltip(e.recipe) : '<div class="tt-title">Select recipe</div>' });
    const rname = h('div', '', rr);
    const io = h('div', 'col', P);
    let builtFor: RecipeProto | null | undefined = undefined;
    const rebuild = () => {
      builtFor = e.recipe;
      io.innerHTML = '';
      ui.setSlot(rb, e.recipe ? { id: e.recipe.main, n: 1 } : null, null, '');
      if (e.recipe) ui.setIcon((rb as any)._icon, ui.recipeIconKey(e.recipe), 32);
      rname.textContent = e.recipe ? e.recipe.name : 'No recipe selected';
      if (!e.recipe) return;
      const row = h('div', 'row', io); row.style.alignItems = 'flex-end';
      const fluidsIn = e.fluidBoxes.filter(b => b.kind === 'input' && b.filter);
      for (const b of fluidsIn) this.fluidBar(row, () => b);
      const inCol = h('div', 'col', row);
      h('div', 'mini-label', inCol, 'Ingredients');
      if (e.input.size) this.invGrid(inCol, () => e.input, 6);
      const arrow = h('div', '', row, '➜'); arrow.style.fontSize = '22px'; arrow.style.color = '#aaa'; arrow.style.paddingBottom = '6px';
      const outCol = h('div', 'col', row);
      h('div', 'mini-label', outCol, 'Products');
      if (e.output.size) this.invGrid(outCol, () => e.output, 6);
      for (const b of e.fluidBoxes.filter(b => b.kind === 'output' && b.filter)) this.fluidBar(row, () => b);
      this.progress(io, () => e.progress, () => `${(e.recipe!.time / e.speed).toFixed(2)}s`);
      if (e.effects().prod > 0) this.progress(io, () => e.bonus, () => 'Productivity bonus', 'blue');
    };
    rebuild();
    this.updaters.push(() => { if (builtFor !== e.recipe) { this.updaters = this.updaters.filter(u => (u as any)._keep); rebuild(); } });
    (this.updaters[this.updaters.length - 1] as any)._keep = true;
    // keep status updater
    (this.updaters[0] as any)._keep = true;
    this.powerInfo(P);
    (this.updaters[this.updaters.length - 1] as any)._keep = true;
    const modBefore = this.updaters.length;
    this.modulesRow(P, e);
    for (let i = modBefore; i < this.updaters.length; i++) (this.updaters[i] as any)._keep = true;
    const sp = h('div', 'mini-label', P);
    const u = () => sp.textContent = `Crafting speed: ${e.speed.toFixed(2)}`;
    (u as any)._keep = true; this.updaters.push(u);
  }

  openRecipePicker(e: CraftingMachine) {
    const ui = this.ui;
    const w = new Win(ui, 'Select recipe', 'picker', 'recipe-picker');
    const enabled = ui.g.research.enabledRecipes;
    const list = Object.values(RECIPES).filter(r => enabled.has(r.id) && e.canUse(r) && !r.hidden);
    list.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || SUBGROUP_ORDER.indexOf(a.subgroup) - SUBGROUP_ORDER.indexOf(b.subgroup) || a.order - b.order);
    const grid = h('div', 'grid', w.body);
    let lastG = '';
    let col = 0;
    for (const r of list) {
      if (r.group !== lastG && col % 10 !== 0) { while (col % 10) { h('div', 'slot dark', grid); col++; } }
      lastG = r.group;
      const s = ui.slot(grid, {
        onLeft: () => { e.setRecipe(r, st => ui.g.player.give(st.id, st.n)); ui.closeWindow(w); ui.openWindow(this, false); },
        tooltip: () => ui.recipeTooltip(r),
      });
      ui.setSlot(s, { id: r.main, n: 1 }, null, '');
      ui.setIcon((s as any)._icon, ui.recipeIconKey(r), 32);
      if (e.recipe === r) s.classList.add('selected');
      col++;
    }
    while (col % 10) { h('div', 'slot dark', grid); col++; }
    if (!list.length) h('div', 'label', w.body, 'No recipes available for this machine yet.');
    const clear = h('div', 'btn small', w.body, 'Clear recipe'); clear.style.marginTop = '8px';
    clear.onclick = () => { e.setRecipe(null, st => ui.g.player.give(st.id, st.n)); ui.closeWindow(w); ui.openWindow(this, false); };
    ui.closeWindow(this);
    ui.openWindow(w);
  }

  buildFurnace(e: Furnace) {
    const P = this.panel;
    this.status(P);
    const row = h('div', 'row', P);
    (e.source as any).accepts = (id: string) => !!(e.wants(id) >= 0 && (RECIPES as any)) && !!Object.values(RECIPES).find(r => r.cat === 'smelting' && r.ing[0].id === id);
    this.invGrid(row, () => e.source, 1);
    h('div', '', row, '➜').style.fontSize = '22px';
    this.progress(row, () => e.progress, () => e.recipe ? `${(e.recipe.time / e.speed).toFixed(1)}s` : '');
    h('div', '', row, '➜').style.fontSize = '22px';
    (e.result as any).accepts = () => false;
    this.invGrid(row, () => e.result, 1);
    this.burnerRow(P, e.burner);
    this.powerInfo(P);
    this.modulesRow(P, e);
  }

  buildLab(e: Lab) {
    const P = this.panel, ui = this.ui;
    this.status(P);
    (e.packs as any).accepts = (id: string) => !!ITEMS[id]?.science;
    this.invGrid(P, () => e.packs, 7);
    const res = h('div', 'col', P);
    this.updaters.push(() => {
      const r = ui.g.research;
      const k = r.current || '';
      if ((res as any)._k === k) return;
      (res as any)._k = k;
      res.innerHTML = '';
      if (!r.current) { h('div', 'label', res, 'No research in progress'); return; }
      const row = h('div', 'row', res);
      ui.techIcon(r.current, 40, row);
      h('div', '', row, TECHS[r.current].name);
    });
    this.progress(P, () => ui.g.research.current ? ui.g.research.progress / ui.g.research.currentCost().count : 0, () => ui.g.research.current ? `${Math.floor(ui.g.research.progress)}/${ui.g.research.currentCost().count}` : '', 'blue');
    this.powerInfo(P);
    this.modulesRow(P, e);
  }

  buildDrill(e: MiningDrill) {
    const P = this.panel;
    this.status(P);
    this.progress(P, () => e.progress, () => 'Mining');
    if (e.isPump) { const row = h('div', 'row', P); this.fluidBar(row, () => e.fluidBoxes[0], 'Output'); }
    else if (e.fluidBoxes.length) { const row = h('div', 'row', P); this.fluidBar(row, () => e.fluidBoxes[0], 'Input'); }
    const info = h('div', 'label', P);
    this.updaters.push(() => { info.textContent = e.description().join(' · '); });
    this.burnerRow(P, e.burner);
    this.powerInfo(P);
    this.modulesRow(P, e);
  }

  buildBoiler(e: Boiler) {
    const P = this.panel;
    this.status(P);
    const row = h('div', 'row', P);
    this.fluidBar(row, () => e.fluidBoxes[0], 'Water');
    this.fluidBar(row, () => e.fluidBoxes[1], 'Steam');
    this.burnerRow(P, e.burner);
    h('div', 'mini-label', P, 'Consumption: 1.8 MW · Output: 60 steam/s at 165°C');
  }
  buildGenerator(e: Generator) {
    const P = this.panel;
    const row = h('div', 'row', P);
    this.fluidBar(row, () => e.fluidBoxes[0], 'Steam');
    const col = h('div', 'col', row);
    const t = h('div', 'kv', col);
    this.updaters.push(() => { t.innerHTML = `<span>Power output</span><b>${fmtPower(e.lastOut * 60)}</b>`; });
    h('div', 'kv', col).innerHTML = `<span>Maximum</span><b>${fmtPower(e.proto.power!)}</b>`;
    this.progress(col, () => e.lastOut * 60 / e.proto.power!, () => '', 'green');
  }
  buildPole(e: ElectricPole) {
    const P = this.panel;
    const info = h('div', 'col', P);
    const cv = h('canvas', 'graph', P) as HTMLCanvasElement;
    cv.width = 640; cv.height = 240; cv.style.width = '320px'; cv.style.height = '120px';
    const ctx = cv.getContext('2d')!;
    this.updaters.push(() => {
      const n = e.net;
      if (!n) { info.innerHTML = '<div class="label">Not connected</div>'; return; }
      info.innerHTML = `<div class="kv"><span>Satisfaction</span><b>${Math.round(n.satisfaction * 100)}%</b></div>
        <div class="kv"><span>Production</span><b>${fmtPower(n.lastSupply * 60)}</b></div>
        <div class="kv"><span>Max production</span><b>${fmtPower(n.lastProdCap * 60)}</b></div>
        <div class="kv"><span>Demand</span><b>${fmtPower(n.lastDemand * 60)}</b></div>
        <div class="kv"><span>Consumers / Generators</span><b>${n.consumers.length} / ${n.generators.length + n.solars.length}</b></div>`;
      // graph
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, cv.width, cv.height);
      const prod = n.histProd.slice(-60), cons = n.histCons.slice(-60);
      const max = Math.max(1, ...prod, ...cons) * 1.1;
      const plot = (arr: number[], col: string) => { ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); arr.forEach((v, i) => { const x = i / 59 * cv.width, y = cv.height - v / max * cv.height; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); };
      plot(prod, '#5fbf3f'); plot(cons, '#e0a030');
    });
  }
  buildInserter(e: Inserter) {
    const P = this.panel, ui = this.ui;
    this.status(P);
    this.burnerRow(P, e.burner);
    this.powerInfo(P);
    if (e.proto.filterable) {
      const row = h('div', 'row', P);
      const cb = h('div', 'btn small', row, 'Use filters'); cb.onclick = () => { e.useFilters = !e.useFilters; };
      const mode = h('div', 'btn small', row, 'Whitelist'); mode.onclick = () => { e.filterMode = e.filterMode === 'whitelist' ? 'blacklist' : 'whitelist'; };
      this.updaters.push(() => { cb.classList.toggle('active', e.useFilters); mode.textContent = e.filterMode === 'whitelist' ? 'Whitelist' : 'Blacklist'; });
      const g = h('div', 'grid', P); g.style.gridTemplateColumns = 'repeat(5, var(--slot))';
      for (let i = 0; i < 5; i++) {
        const s = ui.slot(g, {
          onLeft: () => { const c = ui.g.player.cursor; if (c) e.filters[i] = c.id; else (ui as any).pickItem?.((id: string) => { e.filters[i] = id; e.useFilters = true; }); },
          onRight: () => { e.filters.splice(i, 1); },
        });
        this.updaters.push(() => ui.setSlot(s, e.filters[i] ? { id: e.filters[i], n: 1 } : null, null, ''));
      }
    }
    if (e.proto.bulk || true) {
      const row = h('div', 'row', P);
      h('div', 'label', row, 'Hand size');
      const t = h('b', '', row);
      this.updaters.push(() => t.textContent = String(e.handSize));
    }
    if ((this.ui.g.circuits as any)?.buildCircuitGUI) (this.ui.g.circuits as any).buildCircuitGUI(this, P, e);
  }
  buildSplitter(e: Splitter) {
    const P = this.panel, ui = this.ui;
    const mk = (label: string, get: () => string, set: (v: any) => void) => {
      const row = h('div', 'row', P);
      h('div', 'label', row, label).style.width = '110px';
      for (const v of ['left', 'none', 'right']) {
        const b = h('div', 'btn small', row, v === 'none' ? 'None' : v[0].toUpperCase() + v.slice(1));
        b.onclick = () => set(v);
        this.updaters.push(() => b.classList.toggle('active', get() === v));
      }
    };
    mk('Input priority', () => e.inPriority, v => e.inPriority = v);
    mk('Output priority', () => e.outPriority, v => e.outPriority = v);
    const row = h('div', 'row', P);
    h('div', 'label', row, 'Filter').style.width = '110px';
    const s = ui.slot(row, { onLeft: () => { const c = ui.g.player.cursor; if (c) { e.filter = c.id; if (e.outPriority === 'none') e.outPriority = 'left'; } else (ui as any).pickItem?.((id: string) => { e.filter = id; if (e.outPriority === 'none') e.outPriority = 'left'; }); }, onRight: () => e.filter = null });
    this.updaters.push(() => ui.setSlot(s, e.filter ? { id: e.filter, n: 1 } : null, null, ''));
  }
  buildSilo(e: RocketSilo) {
    const P = this.panel, ui = this.ui;
    this.status(P);
    const row = h('div', 'row', P);
    const inCol = h('div', 'col', row);
    h('div', 'mini-label', inCol, 'Rocket part ingredients');
    this.invGrid(inCol, () => e.input, 3);
    const pc = h('div', 'col', row); pc.style.flex = '1';
    this.progress(pc, () => e.progress, () => 'Rocket part');
    this.progress(pc, () => e.parts / 100, () => `Rocket parts: ${e.parts}/100`, 'blue');
    const pr = h('div', 'row', P);
    h('div', 'label', pr, 'Payload:');
    (e.payload as any).accepts = (id: string) => id === 'satellite' || id === 'raw-fish';
    this.invGrid(pr, () => e.payload, 1);
    const lb = h('div', 'btn green', pr, '🚀 Launch');
    lb.onclick = () => { const err = e.launch(); if (err) ui.flyText(e.x, e.y, err, '#ff8a6a'); else ui.closeAll(); };
    const al = h('div', 'btn small', pr, 'Auto-launch');
    al.onclick = () => e.autoLaunch = !e.autoLaunch;
    this.updaters.push(() => { lb.classList.toggle('disabled', !e.rocketReady); al.classList.toggle('active', e.autoLaunch); });
    this.powerInfo(P);
    this.modulesRow(P, e);
  }

  t = 0;
  update() {
    if (this.entity.dead) { this.ui.closeWindow(this); return; }
    this.playerInv.update();
    for (const u of this.updaters) u();
  }
}
