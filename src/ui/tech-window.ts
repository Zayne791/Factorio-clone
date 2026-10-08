// Technology tree window.
import { Win, h, UI } from './ui';
import { TECHS, RECIPES, ITEMS, techLevelEffects, itemName, SCIENCE_PACKS } from '../data/protos';
import { fmtNum, fmtTime } from '../core';

let LAYOUT: Map<string, [number, number]> | null = null;
function layout(): Map<string, [number, number]> {
  if (LAYOUT) return LAYOUT;
  const depth = new Map<string, number>();
  const d = (id: string, stack = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (stack.has(id)) return 0;
    stack.add(id);
    const t = TECHS[id];
    const v = t.prereq.length ? Math.max(...t.prereq.filter(p => TECHS[p]).map(p => d(p, stack) + 1)) : 0;
    depth.set(id, v);
    return v;
  };
  for (const id of Object.keys(TECHS)) d(id);
  const cols: string[][] = [];
  for (const [id, v] of depth) (cols[v] = cols[v] || []).push(id);
  const row = new Map<string, number>();
  cols.forEach((c, ci) => {
    if (ci === 0) c.sort((a, b) => TECHS[a].order - TECHS[b].order);
    else c.sort((a, b) => {
      const avg = (id: string) => { const ps = TECHS[id].prereq.filter(p => row.has(p)); return ps.length ? ps.reduce((s, p) => s + row.get(p)!, 0) / ps.length : 0; };
      return avg(a) - avg(b) || TECHS[a].order - TECHS[b].order;
    });
    // assign rows near barycenter without collision
    const used = new Set<number>();
    for (const id of c) {
      const ps = TECHS[id].prereq.filter(p => row.has(p));
      let target = ps.length ? Math.round(ps.reduce((s, p) => s + row.get(p)!, 0) / ps.length) : 0;
      if (ci === 0) target = used.size;
      let r = Math.max(0, target);
      for (let k = 0; ; k++) { const cand = target + (k % 2 ? -(k + 1) / 2 : k / 2); if (cand >= 0 && !used.has(cand)) { r = cand; break; } }
      used.add(r); row.set(id, r);
    }
  });
  LAYOUT = new Map();
  for (const [id, v] of depth) LAYOUT.set(id, [v, row.get(id)!]);
  return LAYOUT;
}

export class TechWindow extends Win {
  selected: string | null = null;
  tree: HTMLDivElement;
  detail: HTMLDivElement;
  queueEl: HTMLDivElement;
  cards = new Map<string, HTMLDivElement>();
  ver = '';
  constructor(ui: UI) {
    super(ui, 'Technologies', 'techwin', 'tech');
    const body = h('div', 'tech-body', this.body);
    this.body.style.flex = '1';
    const left = h('div', 'tech-left', body);
    const qp = h('div', 'panel', left);
    h('div', 'subtitle', qp, 'Research queue');
    this.queueEl = h('div', 'tech-queue', qp);
    this.detail = h('div', 'panel tech-detail scroll', left);
    this.detail.style.flex = '1';
    this.tree = h('div', 'tech-tree', body);
    this.buildTree();
    const res = ui.g.research;
    this.select(res.current || this.firstAvailable());
  }
  firstAvailable(): string {
    const res = this.ui.g.research;
    const avail = Object.keys(TECHS).filter(id => res.isAvailable(id)).sort((a, b) => TECHS[a].order - TECHS[b].order);
    return avail.find(id => !res.isTrigger(id)) || avail[0] || Object.keys(TECHS)[0];
  }
  buildTree() {
    const L = layout();
    const W = 130, H = 150;
    let maxX = 0, maxY = 0;
    for (const [, [x, y]] of L) { maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    const inner = h('div', '', this.tree);
    inner.style.position = 'relative';
    inner.style.width = ((maxX + 1) * W + 20) + 'px';
    inner.style.height = ((maxY + 1) * H + 20) + 'px';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'tech-lines');
    svg.setAttribute('width', String((maxX + 1) * W + 20)); svg.setAttribute('height', String((maxY + 1) * H + 20));
    inner.appendChild(svg);
    (this as any)._svg = svg;
    for (const [id, [x, y]] of L) {
      const t = TECHS[id];
      for (const p of t.prereq) {
        const pp = L.get(p); if (!pp) continue;
        const line = document.createElementNS(svgNS, 'path');
        const x1 = pp[0] * W + 10 + 108, y1 = pp[1] * H + 10 + 66, x2 = x * W + 10, y2 = y * H + 10 + 66;
        line.setAttribute('d', `M${x1},${y1} C${x1 + 14},${y1} ${x2 - 14},${y2} ${x2},${y2}`);
        line.setAttribute('stroke', '#6a6a6a'); line.setAttribute('stroke-width', '2'); line.setAttribute('fill', 'none');
        (line as any)._from = p; (line as any)._to = id;
        svg.appendChild(line);
      }
      const c = h('div', 'tech-card', inner);
      c.style.left = (x * W + 10) + 'px'; c.style.top = (y * H + 10) + 'px';
      this.ui.techIcon(id, 84, c);
      h('div', 'tname', c, t.name);
      const cost = h('div', 'tcost', c);
      for (const pk of t.packs) this.ui.icon(pk, 13, cost);
      c.onclick = () => this.select(id);
      c.ondblclick = () => this.ui.g.research.enqueue(id);
      this.cards.set(id, c);
    }
  }
  select(id: string) {
    this.selected = id;
    for (const [k, c] of this.cards) c.classList.toggle('sel', k === id);
    this.buildDetail();
    const c = this.cards.get(id);
    if (c) { const tr = this.tree; const x = parseFloat(c.style.left), y = parseFloat(c.style.top); if (x < tr.scrollLeft || x > tr.scrollLeft + tr.clientWidth - 120 || y < tr.scrollTop || y > tr.scrollTop + tr.clientHeight - 140) { tr.scrollLeft = x - tr.clientWidth / 2 + 54; tr.scrollTop = y - tr.clientHeight / 2 + 66; } }
  }
  buildDetail() {
    const ui = this.ui, res = ui.g.research;
    const id = this.selected!;
    const t = TECHS[id];
    const D = this.detail;
    D.innerHTML = '';
    const top = h('div', 'row', D); top.style.alignItems = 'flex-start';
    ui.techIcon(id, 96, top);
    const nm = h('div', 'col', top);
    const lvl = t.maxLevel > 1 ? ` ${res.nextLevel(id) > t.maxLevel ? t.maxLevel : res.nextLevel(id)}${t.maxLevel === Infinity ? ' (∞)' : ''}` : '';
    h('div', 'subtitle', nm, t.name + lvl);
    const stateTxt = res.isFullyDone(id) ? 'Researched' : res.current === id ? 'In progress' : res.isAvailable(id) ? 'Available' : 'Locked (missing prerequisites)';
    h('div', 'label', nm, stateTxt);
    if (t.trigger) {
      const tr = t.trigger;
      const key = tr.type + ':' + tr.target;
      const have = Math.min(res.triggerCounts[key] || 0, tr.count);
      const verb = tr.type === 'craft-item' ? 'Craft' : tr.type === 'mine-entity' ? 'Mine' : 'Launch';
      h('div', 'subtitle', D, 'Trigger');
      const row = h('div', 'row', D);
      ui.icon(tr.target, 32, row);
      h('div', '', row, `${verb} ${tr.count} × ${itemName(tr.target)} (${fmtNum(have)}/${tr.count})`);
    } else if (!res.isFullyDone(id)) {
      const c = res.cost(id);
      h('div', 'subtitle', D, 'Cost');
      const row = h('div', 'row', D); row.style.flexWrap = 'wrap';
      for (const pk of c.packs) ui.icon(pk, 32, row);
      h('div', '', row, `× ${fmtNum(c.count)}`);
      h('div', 'label', D, `⏱ ${c.time}s per unit · total ${fmtTime(c.time * c.count)} with 1 lab`);
      if (res.current === id) {
        const pr = h('div', 'progress blue', D); const b = h('div', '', pr); b.style.width = (res.progress / c.count * 100) + '%';
        h('span', '', pr, `${Math.floor(res.progress)} / ${c.count}`);
        (this as any)._bar = [b, pr.lastChild];
      }
    }
    if (t.prereq.length) {
      h('div', 'subtitle', D, 'Required technologies');
      const row = h('div', 'row', D); row.style.flexWrap = 'wrap'; row.style.gap = '4px';
      for (const p of t.prereq) {
        const c = h('div', 'slot', row);
        c.style.width = '44px'; c.style.height = '44px';
        ui.techIcon(p, 40, c);
        if (res.completedLevels(p) > 0) c.classList.add('green'); else c.classList.add('red');
        c.onclick = () => this.select(p);
        c.addEventListener('pointerenter', () => ui.showTooltip(`<div class="tt-title tech">${TECHS[p].name}</div>`, c));
        c.addEventListener('pointerleave', () => ui.hideTooltip(c));
      }
    }
    const effs = techLevelEffects(t, Math.min(res.nextLevel(id), t.maxLevel === Infinity ? res.nextLevel(id) : t.maxLevel));
    const unlocks = effs.filter(e => e.type === 'unlock-recipe');
    if (unlocks.length || effs.length) {
      h('div', 'subtitle', D, 'Effects');
      const row = h('div', 'row', D); row.style.flexWrap = 'wrap'; row.style.gap = '0';
      for (const u of unlocks) {
        const r = RECIPES[u.target!]; if (!r) continue;
        const s = ui.slot(row, { tooltip: () => ui.recipeTooltip(r) });
        ui.setSlot(s, { id: r.main, n: 1 }, null, '');
        ui.setIcon((s as any)._icon, ui.recipeIconKey(r), 32);
      }
      for (const e of effs.filter(e => e.type !== 'unlock-recipe')) h('div', 'label', D, effectText(e));
    }
    const btns = h('div', 'row', D); btns.style.marginTop = '10px'; btns.style.flexWrap = 'wrap';
    if (!res.isFullyDone(id) && !t.trigger) {
      if (res.current !== id) {
        const b = h('div', 'btn green', btns, res.isAvailable(id) ? 'Start research' : 'Queue with prerequisites');
        b.onclick = () => { if (res.isAvailable(id)) { res.queue = res.queue.filter(q => q !== id); res.queue.unshift(id); res.start(id); } else res.enqueue(id); this.buildDetail(); };
        const q = h('div', 'btn', btns, 'Add to queue');
        q.onclick = () => { res.enqueue(id); this.buildDetail(); };
      } else {
        const c = h('div', 'btn red', btns, 'Cancel');
        c.onclick = () => { res.dequeue(id); this.buildDetail(); };
      }
    }
  }
  t = 0;
  update() {
    const res = this.ui.g.research;
    const ver = JSON.stringify(res.levels) + res.current + res.queue.join();
    if (ver !== this.ver) {
      this.ver = ver;
      for (const [id, c] of this.cards) {
        c.className = 'tech-card ' + (res.current === id ? 'current' : res.isFullyDone(id) ? 'done' : res.isAvailable(id) ? 'avail' : 'locked') + (id === this.selected ? ' sel' : '');
        const qi = res.queue.indexOf(id);
        if (qi >= 0) { c.classList.add('queued'); c.dataset.q = String(qi + 1); }
      }
      const svg = (this as any)._svg as SVGElement;
      for (const l of svg.children as any) {
        const done = res.completedLevels(l._from) > 0;
        l.setAttribute('stroke', done ? (res.completedLevels(l._to) > 0 ? '#4f8f3a' : '#c09040') : '#5a4a48');
      }
      // queue
      this.queueEl.innerHTML = '';
      for (const q of res.queue) {
        const c = h('div', 'slot', this.queueEl);
        c.style.width = '44px'; c.style.height = '44px';
        this.ui.techIcon(q, 40, c);
        if (q === res.current) c.classList.add('selected');
        c.onclick = () => this.select(q);
        c.oncontextmenu = e => { e.preventDefault(); res.dequeue(q); };
        c.addEventListener('pointerenter', () => this.ui.showTooltip(`<div class="tt-title tech">${TECHS[q].name}</div><div class="tt-body">Right-click to remove</div>`, c));
        c.addEventListener('pointerleave', () => this.ui.hideTooltip(c));
      }
      if (!res.queue.length) h('div', 'label', this.queueEl, 'Empty — select a technology and start research.');
      this.buildDetail();
    }
    if (++this.t % 6 === 0 && (this as any)._bar && res.current === this.selected) {
      const [b, sp] = (this as any)._bar; const c = res.currentCost();
      b.style.width = (res.progress / c.count * 100) + '%'; sp.textContent = `${Math.floor(res.progress)} / ${c.count}`;
    }
  }
}

export function effectText(e: { type: string; target?: string; value: number }): string {
  const pct = (v: number) => `+${Math.round(v * 100)}%`;
  switch (e.type) {
    case 'inserter-capacity': return `Inserter capacity bonus: +${e.value}`;
    case 'bulk-inserter-capacity': return `Bulk inserter capacity bonus: +${e.value}`;
    case 'lab-speed': return `Laboratory speed: ${pct(e.value)}`;
    case 'mining-productivity': return `Mining productivity: ${pct(e.value)}`;
    case 'robot-speed': return `Worker robot speed: ${pct(e.value)}`;
    case 'robot-cargo': return `Worker robot cargo size: +${e.value}`;
    case 'follower-robots': return `Maximum following robots: +${e.value}`;
    case 'inventory-slots': return `Character inventory slots: +${e.value}`;
    case 'mining-speed': return `Character mining speed: ${pct(e.value)}`;
    case 'ammo-damage': return `${cap(e.target!)} damage: ${pct(e.value)}`;
    case 'turret-attack': return `${itemName(e.target!)} damage: ${pct(e.value)}`;
    case 'gun-speed': return `${cap(e.target!)} shooting speed: ${pct(e.value)}`;
    case 'braking': return `Braking force: ${pct(e.value)}`;
    case 'artillery-range': return `Artillery shell range: ${pct(e.value)}`;
  }
  return e.type;
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
