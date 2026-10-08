// Main menu, new game, load/save, settings, controls help, pause menu.
import { DEFAULT_SETTINGS, MapSettings } from '../world/mapgen';
import { listSaves, readSave, writeSave, deleteSave, exportSave, importSaveFile } from '../save/save';
import type { Game } from '../game';
import type { Renderer } from '../engine/renderer';
import { fmtTime } from '../core';
import { MenuDemo } from './menu-demo';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, text?: string) {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; if (parent) parent.appendChild(e); return e;
}

export interface MenuHooks {
  newGame: (s: MapSettings) => void;
  loadGame: (data: any) => void;
  resume: () => void;
  isRunning: () => boolean;
  getGame: () => Game | null;
  quitToMenu: () => void;
}

export const SETTINGS = { volume: 0.7, music: 0.4, touch: 'auto' as 'auto' | 'on' | 'off', decor: true, autosave: true, dprCap: 2 };
try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem('factory-settings') || '{}')); } catch { /* */ }
export function saveSettings() { try { localStorage.setItem('factory-settings', JSON.stringify(SETTINGS)); } catch { /* */ } }

export class Menu {
  root: HTMLDivElement;
  hooks: MenuHooks;
  visible = false;
  pauses = false;
  constructor(hooks: MenuHooks) {
    this.hooks = hooks;
    this.root = document.getElementById('menu') as HTMLDivElement;
    if (!this.root) { this.root = el('div', '', document.body); this.root.id = 'menu'; }
    this.root.addEventListener('pointerdown', e => e.stopPropagation());
  }
  hide() { this.root.classList.add('hidden'); this.visible = false; this.pauses = false; }
  private frame(title: string, w = 380): HTMLDivElement {
    this.root.innerHTML = '';
    this.root.classList.remove('hidden');
    this.visible = true;
    const win = el('div', 'win', this.root);
    win.style.minWidth = w + 'px';
    const tb = el('div', 'win-title', win);
    el('h2', '', tb, title);
    el('div', 'drag-handle', tb);
    return win;
  }
  logo(parent: HTMLElement) {
    const l = el('div', 'logo', parent);
    l.innerHTML = 'FACTORY<small>BUILD · AUTOMATE · DEFEND · LAUNCH</small>';
  }
  async showMain() {
    this.pauses = false;
    const win = this.frame('Main menu');
    this.logo(win);
    const b = el('div', 'menu-buttons panel', win);
    const saves = await listSaves();
    let last: string | null = null;
    try { last = localStorage.getItem('factory-last-save'); } catch { /* */ }
    const lastSave = saves.find(s => s.name === last) || saves[0];
    if (lastSave) { const c = el('div', 'btn green', b, `Continue — ${lastSave.name}`); c.onclick = () => this.load(lastSave.name); }
    el('div', 'btn', b, 'New game').onclick = () => this.showNewGame();
    el('div', 'btn', b, 'Load game').onclick = () => this.showLoad();
    el('div', 'btn', b, 'Settings').onclick = () => this.showSettings(() => this.showMain());
    el('div', 'btn', b, 'Controls').onclick = () => this.showControls(() => this.showMain());
    const foot = el('div', 'label', win, 'Tip: on iPad, tap Share → "Add to Home Screen" to play full-screen and offline.');
    foot.style.marginTop = '10px'; foot.style.maxWidth = '360px';
  }
  showNewGame() {
    const win = this.frame('New game', 440);
    const p = el('div', 'panel col', win);
    const s: MapSettings = { ...DEFAULT_SETTINGS, seed: Math.floor(Math.random() * 1e9) };
    const row = (label: string, input: HTMLElement) => { const r = el('div', 'form-row', p); el('span', '', r, label); r.appendChild(input); return r; };
    const seed = el('input') as HTMLInputElement; seed.type = 'text'; seed.value = String(s.seed);
    row('Map seed', seed);
    const sel = (opts: [string, number][], val: number) => { const x = el('select') as HTMLSelectElement; for (const [n, v] of opts) { const o = el('option', '', x, n) as HTMLOptionElement; o.value = String(v); if (v === val) o.selected = true; } return x; };
    const lvl: [string, number][] = [['Very low', 0.5], ['Low', 0.75], ['Normal', 1], ['High', 1.5], ['Very high', 2]];
    const rf = sel(lvl, 1); row('Resource frequency', rf);
    const rs = sel(lvl, 1); row('Resource size', rs);
    const rr = sel(lvl, 1); row('Resource richness', rr);
    const tr = sel(lvl, 1); row('Trees', tr);
    const wt = sel(lvl, 1); row('Water', wt);
    const en = sel([['Normal', 1], ['Low', 0.5], ['High', 1.6], ['Peaceful', -1], ['No enemies', 0]], 1); row('Enemy bases', en);
    const st = sel(lvl, 1); row('Starting area', st);
    const btns = el('div', 'row', win); btns.style.marginTop = '10px';
    el('div', 'btn', btns, 'Back').onclick = () => this.showMain();
    el('div', 'spacer', btns);
    const go = el('div', 'btn green', btns, 'Play');
    go.onclick = () => {
      const ev = parseFloat(en.value);
      const settings: MapSettings = {
        ...s, seed: (parseInt(seed.value, 10) || hashStr(seed.value)) >>> 0, resFreq: +rf.value, resSize: +rs.value, resRich: +rr.value, trees: +tr.value, water: +wt.value,
        enemyFreq: ev > 0 ? ev : 1, enemySize: 1, peaceful: ev < 0, noEnemies: ev === 0, startArea: +st.value,
      };
      this.hooks.newGame(settings);
    };
  }
  async showLoad(back: () => void = () => this.showMain()) {
    const win = this.frame('Load game', 520);
    const list = el('div', 'panel savelist scroll', win);
    const saves = await listSaves();
    let sel: string | null = saves[0]?.name ?? null;
    const items: HTMLDivElement[] = [];
    for (const s of saves) {
      const it = el('div', 'saveitem', list);
      el('b', '', it, s.name);
      el('div', 'spacer', it);
      el('span', 'label', it, fmtTime(s.playTicks / 60));
      el('span', 'label', it, new Date(s.date).toLocaleString());
      it.onclick = () => { sel = s.name; items.forEach(i => i.classList.toggle('sel', i === it)); };
      it.ondblclick = () => this.load(s.name);
      items.push(it);
      if (s.name === sel) it.classList.add('sel');
    }
    if (!saves.length) el('div', 'label', list, 'No saved games yet.');
    const btns = el('div', 'row', win); btns.style.marginTop = '10px'; btns.style.flexWrap = 'wrap';
    el('div', 'btn', btns, 'Back').onclick = back;
    const imp = el('div', 'btn', btns, 'Import file');
    imp.onclick = () => {
      const f = el('input') as HTMLInputElement; f.type = 'file'; f.accept = '.factorysave,.json,application/gzip';
      f.onchange = async () => { if (f.files?.[0]) { try { const data = await importSaveFile(f.files[0]); this.hooks.loadGame(data); } catch (e) { alert('Could not import save: ' + e); } } };
      f.click();
    };
    el('div', 'spacer', btns);
    el('div', 'btn red', btns, 'Delete').onclick = async () => { if (sel && confirm(`Delete save "${sel}"?`)) { await deleteSave(sel); this.showLoad(back); } };
    el('div', 'btn', btns, 'Export').onclick = () => { if (sel) exportSave(sel); };
    el('div', 'btn green', btns, 'Load').onclick = () => { if (sel) this.load(sel); };
  }
  async load(name: string) {
    this.frame('Loading');
    try {
      const data = await readSave(name);
      this.hooks.loadGame(data);
      const g = this.hooks.getGame(); if (g) g.gameName = name;
    } catch (e) { alert('Failed to load: ' + e); this.showMain(); }
  }
  showPause() {
    this.pauses = true;
    const win = this.frame('Menu');
    const b = el('div', 'menu-buttons panel', win);
    el('div', 'btn green', b, 'Resume').onclick = () => this.hide();
    el('div', 'btn', b, 'Save game').onclick = () => this.showSave();
    el('div', 'btn', b, 'Load game').onclick = () => this.showLoad(() => this.showPause());
    el('div', 'btn', b, 'Settings').onclick = () => this.showSettings(() => this.showPause());
    el('div', 'btn', b, 'Controls').onclick = () => this.showControls(() => this.showPause());
    el('div', 'btn red', b, 'Exit to main menu').onclick = () => { if (confirm('Exit to main menu? Unsaved progress will be lost.')) { this.hooks.quitToMenu(); } };
    this.pauses = true;
  }
  showSave() {
    this.pauses = true;
    const g = this.hooks.getGame();
    if (!g) return;
    const win = this.frame('Save game', 420);
    const p = el('div', 'panel col', win);
    const r = el('div', 'form-row', p);
    el('span', '', r, 'Name');
    const name = el('input') as HTMLInputElement; name.type = 'text'; name.value = g.gameName === 'New game' ? 'Save ' + new Date().toLocaleDateString() : g.gameName;
    r.appendChild(name);
    const btns = el('div', 'row', win); btns.style.marginTop = '10px';
    el('div', 'btn', btns, 'Back').onclick = () => this.showPause();
    el('div', 'spacer', btns);
    const sv = el('div', 'btn green', btns, 'Save');
    sv.onclick = async () => {
      sv.textContent = 'Saving...';
      try { await writeSave(name.value || 'Save', g); g.gameName = name.value; g.ui?.showMessage('Game saved'); this.hide(); }
      catch (e) { alert('Save failed: ' + e); sv.textContent = 'Save'; }
    };
  }
  showSettings(back: () => void) {
    const win = this.frame('Settings', 420);
    const p = el('div', 'panel col', win);
    const range = (label: string, key: 'volume' | 'music') => {
      const r = el('div', 'form-row', p); el('span', '', r, label);
      const i = el('input') as HTMLInputElement; i.type = 'range'; i.min = '0'; i.max = '1'; i.step = '0.05'; i.value = String(SETTINGS[key]);
      i.oninput = () => { (SETTINGS as any)[key] = +i.value; saveSettings(); (window as any).__game?.sound?.setVolume?.(SETTINGS.volume, SETTINGS.music); };
      r.appendChild(i);
    };
    range('Sound volume', 'volume');
    range('Music volume', 'music');
    const r2 = el('div', 'form-row', p); el('span', '', r2, 'Touch controls');
    const ts = el('select') as HTMLSelectElement;
    for (const v of ['auto', 'on', 'off']) { const o = el('option', '', ts, v[0].toUpperCase() + v.slice(1)) as HTMLOptionElement; o.value = v; if (SETTINGS.touch === v) o.selected = true; }
    ts.onchange = () => { SETTINGS.touch = ts.value as any; saveSettings(); };
    r2.appendChild(ts);
    const r3 = el('div', 'form-row', p); el('span', '', r3, 'Autosave every 5 minutes');
    const as = el('input') as HTMLInputElement; as.type = 'checkbox'; as.checked = SETTINGS.autosave; as.onchange = () => { SETTINGS.autosave = as.checked; saveSettings(); };
    r3.appendChild(as);
    const btns = el('div', 'row', win); btns.style.marginTop = '10px';
    el('div', 'btn', btns, 'Back').onclick = back;
  }
  showControls(back: () => void) {
    const win = this.frame('Controls', 640);
    const p = el('div', 'panel scroll', win); p.style.maxHeight = '70vh';
    p.innerHTML = `
      <div class="subtitle">Keyboard & mouse / trackpad</div>
      <div class="kv"><span>Move</span><b>W A S D</b></div>
      <div class="kv"><span>Build / open entity</span><b>Left click</b></div>
      <div class="kv"><span>Mine / remove</span><b>Right click (hold)</b></div>
      <div class="kv"><span>Inventory & crafting</span><b>E</b></div>
      <div class="kv"><span>Technology tree</span><b>T</b></div>
      <div class="kv"><span>Map</span><b>M</b></div>
      <div class="kv"><span>Production statistics</span><b>P</b></div>
      <div class="kv"><span>Rotate (reverse)</span><b>R (Shift+R)</b></div>
      <div class="kv"><span>Pipette / clear cursor</span><b>Q</b></div>
      <div class="kv"><span>Drop item</span><b>Z</b></div>
      <div class="kv"><span>Pick up items</span><b>F</b></div>
      <div class="kv"><span>Shoot</span><b>Space / C</b></div>
      <div class="kv"><span>Alt-mode (show details)</span><b>Alt</b></div>
      <div class="kv"><span>Quickbar</span><b>1-0, Shift+1-0</b></div>
      <div class="kv"><span>Switch weapon</span><b>Tab</b></div>
      <div class="kv"><span>Enter/exit vehicle</span><b>Enter</b></div>
      <div class="kv"><span>Zoom</span><b>Mouse wheel / + −</b></div>
      <div class="kv"><span>Transfer stack / all</span><b>Shift+click / Ctrl+click</b></div>
      <div class="kv"><span>Copy / paste settings</span><b>Ctrl+C / Shift+click</b></div>
      <div class="kv"><span>Menu / close windows</span><b>Esc or \`</b></div>
      <div class="subtitle" style="margin-top:10px">iPad: Apple Pencil & touch</div>
      <div class="kv"><span>Aim / preview (Pencil hover)</span><b>Hover</b></div>
      <div class="kv"><span>Build / open</span><b>Tap</b></div>
      <div class="kv"><span>Drag-build lines of belts, poles...</span><b>Tap & drag with item</b></div>
      <div class="kv"><span>Mine / remove</span><b>Long-press, or ⛏ Mine toggle</b></div>
      <div class="kv"><span>Move character</span><b>Virtual stick (bottom-left) or keyboard</b></div>
      <div class="kv"><span>Zoom</span><b>Pinch</b></div>
      <div class="kv"><span>Half stack / craft 5</span><b>Long-press slot</b></div>
      <div class="kv"><span>Transfer stack</span><b>Double-tap slot</b></div>`;
    const btns = el('div', 'row', win); btns.style.marginTop = '10px';
    el('div', 'btn', btns, 'Back').onclick = back;
  }
  demo: MenuDemo | null = null;
  demoFailed = false;
  renderBackground(r: Renderer, dt: number) {
    if (!this.demo && !this.demoFailed) {
      try { this.demo = new MenuDemo(r); } catch (e) { console.warn('menu demo failed', e); this.demoFailed = true; }
    }
    if (this.demo) { try { this.demo.render(r, dt); return; } catch (e) { console.warn('menu demo render failed', e); this.demo = null; this.demoFailed = true; } }
    // fallback: clear screen while in menu
    const gl = r.gl;
    gl.viewport(0, 0, r.vw, r.vh);
    gl.clearColor(0.05, 0.045, 0.04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}

function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
