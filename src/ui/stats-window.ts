// Production statistics window.
import { Win, h, UI } from './ui';
import { STAT_RANGES } from '../sim/research';
import { itemName, FLUIDS } from '../data/protos';
import { fmtNum, fmtPower } from '../core';

const COLORS = ['#e8a33a', '#5fbf3f', '#4f9fe0', '#e04f4f', '#b06fe0', '#e0d04f', '#4fe0d0', '#e07fb0', '#9f9f9f', '#7fe08f'];

export class StatsWindow extends Win {
  range = 1;
  tab: 'items' | 'fluids' | 'power' | 'kills' = 'items';
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D;
  list: HTMLDivElement;
  t = 0;
  constructor(ui: UI) {
    super(ui, 'Production statistics', 'statswin', 'stats');
    this.el.style.width = 'min(900px, calc(100vw - 16px))';
    const top = h('div', 'row', this.body);
    for (const tb of ['items', 'fluids', 'power', 'kills'] as const) {
      const b = h('div', 'btn small', top, tb === 'items' ? 'Items' : tb === 'fluids' ? 'Fluids' : tb === 'power' ? 'Electricity' : 'Kills');
      b.onclick = () => { this.tab = tb; this.refresh(true); };
      (b as any)._tab = tb;
    }
    h('div', 'spacer', top);
    STAT_RANGES.forEach((r, i) => { const b = h('div', 'btn small', top, r.name); b.onclick = () => { this.range = i; this.refresh(true); }; (b as any)._range = i; });
    (this as any)._top = top;
    const gp = h('div', 'panel stats-graph', this.body); gp.style.marginTop = '6px';
    this.canvas = h('canvas', 'graph', gp) as HTMLCanvasElement;
    this.canvas.width = 1720; this.canvas.height = 400; this.canvas.style.width = '100%'; this.canvas.style.height = '200px';
    this.ctx = this.canvas.getContext('2d')!;
    const hdr = h('div', 'row', this.body); hdr.style.margin = '6px 0 2px'; hdr.style.fontWeight = '700'; hdr.style.color = 'var(--title)';
    h('div', '', hdr, '').style.width = '36px';
    h('div', '', hdr, 'Name').style.flex = '1';
    h('div', '', hdr, 'Production /min').style.width = '150px';
    h('div', '', hdr, 'Consumption /min').style.width = '150px';
    h('div', '', hdr, 'Total produced').style.width = '130px';
    this.list = h('div', 'scroll stats-list', this.body);
    this.list.style.maxHeight = 'calc(100vh - 420px)';
    this.refresh(true);
  }
  refresh(force = false) {
    const g = this.ui.g, st = g.stats;
    for (const b of (this as any)._top.children) {
      if ((b as any)._tab) b.classList.toggle('active', (b as any)._tab === this.tab);
      if ((b as any)._range !== undefined) b.classList.toggle('active', (b as any)._range === this.range);
    }
    const series = this.tab === 'power' ? st.power : this.tab === 'kills' ? st.kills : st.items;
    const prodS = st.series(series, this.range, 'prod'), consS = st.series(series, this.range, 'cons');
    const r = STAT_RANGES[this.range];
    const secs = Math.max(1, prodS.length * r.secPer);
    const sum = (arr: Map<string, number>[]) => { const m = new Map<string, number>(); for (const s of arr) for (const [k, v] of s) m.set(k, (m.get(k) || 0) + v); return m; };
    const P = sum(prodS), C = sum(consS);
    let keys = [...new Set([...P.keys(), ...C.keys()])];
    if (this.tab === 'fluids') keys = keys.filter(k => FLUIDS[k]); else if (this.tab === 'items') keys = keys.filter(k => !FLUIDS[k]);
    keys.sort((a, b) => (P.get(b) || 0) + (C.get(b) || 0) - (P.get(a) || 0) - (C.get(a) || 0));
    // graph top 8 production
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#2e2e2e'; ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, H * i / 4); ctx.lineTo(W, H * i / 4); ctx.stroke(); }
    const top = keys.slice(0, 8);
    let max = 1;
    const n = Math.max(2, r.samples);
    const perMin = (v: number) => this.tab === 'power' ? v * 60 / r.secPer : v * 60 / r.secPer;
    for (const k of top) for (const s of prodS) max = Math.max(max, perMin(s.get(k) || 0));
    max *= 1.1;
    top.forEach((k, i) => {
      ctx.strokeStyle = COLORS[i % COLORS.length]; ctx.lineWidth = 3; ctx.beginPath();
      const off = n - prodS.length;
      prodS.forEach((s, j) => { const x = (off + j) / (n - 1) * W, y = H - perMin(s.get(k) || 0) / max * (H - 10); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    });
    ctx.fillStyle = '#aaa'; ctx.font = '22px sans-serif';
    ctx.fillText(this.tab === 'power' ? fmtPower(max / 60) : fmtNum(max) + '/min', 8, 26);
    // list
    this.list.innerHTML = '';
    keys.slice(0, 80).forEach((k, i) => {
      const row = h('div', 'row', this.list);
      const sw = h('div', '', row); sw.style.cssText = `width:6px;height:22px;background:${i < 8 ? COLORS[i] : 'transparent'}`;
      if (this.tab !== 'power') this.ui.icon(k, 26, row); else h('div', '', row).style.width = '26px';
      h('div', '', row, this.tab === 'power' ? k : itemName(k)).style.flex = '1';
      const fmt = (v: number) => this.tab === 'power' ? fmtPower(v / secs) : fmtNum(v / secs * 60);
      h('div', '', row, fmt(P.get(k) || 0)).style.width = '150px';
      h('div', '', row, fmt(C.get(k) || 0)).style.width = '150px';
      h('div', 'label', row, this.tab === 'power' ? '' : fmtNum(series.totalP.get(k) || 0)).style.width = '130px';
    });
    if (!keys.length) h('div', 'label', this.list, 'No data yet for this time range.');
  }
  update() { if (++this.t % 30 === 0) this.refresh(); }
}
