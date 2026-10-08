// Entry point: loading, art generation, main menu, game loop.
import './sim/belts';
import './sim/inserter';
import './sim/fluids';
import './sim/power';
import './sim/crafting';
import './sim/mining';
import './sim/simple';
import { Renderer } from './engine/renderer';
import { buildArt, IconSheet } from './art';
import { Game } from './game';
import { G, clamp } from './core';
import { Effects } from './render/fx';
import { WorldRenderer } from './render/world-render';
import { Input } from './input/input';
import { UI } from './ui/ui';
import { CharacterWindow } from './ui/char-window';
import { EntityWindow } from './ui/entity-windows';
import { TechWindow } from './ui/tech-window';
import { MapWindow } from './ui/map';
import { StatsWindow } from './ui/stats-window';
import { DEFAULT_SETTINGS, MapSettings } from './world/mapgen';
import { Menu } from './ui/menu';
import { installExtras } from './extras';

const loading = document.getElementById('loading')!;
const loadBar = document.getElementById('load-bar') as HTMLDivElement;
const loadMsg = document.getElementById('load-msg')!;
async function progress(p: number, msg: string) {
  loadBar.style.width = Math.round(p * 100) + '%';
  loadMsg.textContent = msg;
  await new Promise(r => setTimeout(r, 0));
}

let renderer: Renderer;
let sheets: { icons: IconSheet; techs: IconSheet };
let running: { game: Game; ui: UI; input: Input; wr: WorldRenderer } | null = null;
let menu: Menu;

async function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  try { renderer = new Renderer(canvas); }
  catch (e) { loadMsg.textContent = 'WebGL2 is required to play. ' + e; return; }
  resize();
  window.addEventListener('resize', resize);
  await progress(0.02, 'Preparing...');
  sheets = await buildArt(renderer.atlas, progress);
  await progress(0.97, 'Building texture atlas...');
  renderer.atlas.build(renderer.gl);
  await progress(1, 'Ready');
  loading.classList.add('hidden');
  menu = new Menu({ newGame, loadGame: loadSave, resume: () => menu.hide(), isRunning: () => !!running, getGame: () => running?.game ?? null, quitToMenu });
  (window as any).__menu = menu;
  menu.showMain();
  requestAnimationFrame(frame);
  if ((window as any).__autostart) newGame({ ...DEFAULT_SETTINGS, ...(window as any).__autostart });
}

function resize() {
  if (!renderer) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  renderer.resize(window.innerWidth, window.innerHeight, dpr);
}

function setupGame(game: Game) {
  const fx = new Effects();
  game.fx = fx as any;
  const input = new Input(game, renderer, renderer.canvas);
  const ui = new UI(game, input, renderer, sheets.icons, sheets.techs);
  const wr = new WorldRenderer(renderer, game);
  ui.openCharacter = () => new CharacterWindow(ui);
  ui.openEntityWin = e => new EntityWindow(ui, e);
  ui.openTech = () => new TechWindow(ui);
  ui.openMap = () => new MapWindow(ui);
  ui.openStats = () => new StatsWindow(ui);
  ui.openMenu = () => menu.showPause();
  game.research.onComplete = (id, lvl) => {
    ui.showMessage(`Research completed: ${(require_tech(id))}${lvl > 1 ? ' ' + lvl : ''}`);
    game.sound.play('research-complete', 0.8);
    game.research.recheckTriggers();
  };
  installExtras(game, ui, input, renderer);
  renderer.zoom = 32 * renderer.dpr;
  input.zoomTarget = renderer.zoom;
  running = { game, ui, input, wr };
  (window as any).__game = game;
  return running;
}
import { TECHS } from './data/protos';
function require_tech(id: string) { return TECHS[id]?.name || id; }

function newGame(settings: MapSettings) {
  if (running) quitToMenu(false);
  const game = new Game(settings);
  const r = setupGame(game);
  game.start(true);
  menu.hide();
  r.ui.showMessage('Welcome! Mine resources (hold right click / long-press) and build your factory.', 6000);
}
async function loadSave(data: any) {
  if (running) quitToMenu(false);
  const { loadGameState } = await import('./save/save');
  const game = loadGameState(data, (g: Game) => setupGame(g));
  menu.hide();
  void game;
}
function quitToMenu(show = true) {
  if (running) {
    running.ui.closeAll();
    const root = document.getElementById('ui')!;
    root.innerHTML = '';
    document.getElementById('tooltip')?.remove();
    document.getElementById('cursor-stack')?.remove();
    document.getElementById('joystick')?.remove();
    running = null;
    (window as any).__game = null;
  }
  if (show) menu.showMain();
}

const perf = { update: 0, render: 0, ui: 0 };
(window as any).__perf = perf;
let last = performance.now();
let acc = 0;
let fpsT = 0, fpsN = 0, fps = 60;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  fpsN++; fpsT += dt; if (fpsT >= 1) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; (window as any).__fps = fps; }
  if (!running) { menu?.renderBackground?.(renderer, dt); return; }
  const { game, ui, input, wr } = running;
  const paused = menu.visible && menu.pauses;
  if (!paused) {
    acc += dt * game.speed;
    let n = 0;
    const tu = performance.now();
    while (acc >= 1 / 60 && n < 6) { game.update(); acc -= 1 / 60; n++; }
    perf.update = perf.update * 0.95 + (n ? (performance.now() - tu) / n : 0) * 0.05;
    if (n >= 6) acc = 0;
    game.renderTime += dt;
  }
  // camera
  const ch = game.player.character;
  renderer.zoom += (input.zoomTarget - renderer.zoom) * Math.min(1, dt * 12);
  renderer.camX = ch.x; renderer.camY = ch.y - 0.5;
  const tr = performance.now();
  wr.render(input.view);
  perf.render = perf.render * 0.95 + (performance.now() - tr) * 0.05;
  const tui = performance.now();
  ui.update();
  perf.ui = perf.ui * 0.95 + (performance.now() - tui) * 0.05;
}

boot();
