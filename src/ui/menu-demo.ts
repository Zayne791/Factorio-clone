// Main-menu background: a small running factory (drills -> furnaces -> assemblers, solar powered)
// simulated live behind the menu, with a slowly drifting camera — like Factorio's menu simulations.
import { Game } from '../game';
import { G, Dir } from '../core';
import { WorldRenderer, ViewState } from '../render/world-render';
import { Effects } from '../render/fx';
import { DEFAULT_SETTINGS, CHUNK, RES_NAMES } from '../world/mapgen';
import { isWaterTile } from '../world/tiles';
import { RECIPES } from '../data/protos';
import type { Renderer } from '../engine/renderer';

export class MenuDemo {
  game: Game;
  wr: WorldRenderer;
  acc = 0;
  t = 0;
  view: ViewState = { hover: null, hoverTile: null, preview: null, alt: false };
  chests: any[] = [];
  constructor(r: Renderer) {
    const prev = G.game;
    this.game = new Game({ ...DEFAULT_SETTINGS, seed: 20240611, noEnemies: true, peaceful: true });
    const g = this.game;
    g.fx = new Effects() as any;
    for (let cy = -3; cy <= 2; cy++) for (let cx = -3; cx <= 2; cx++) g.world.getChunk(cx, cy);
    g.daytime = 0;
    this.build();
    this.wr = new WorldRenderer(r, g);
    // warm up so belts are already full when the menu appears
    for (let i = 0; i < 900; i++) g.update();
    void prev;
  }
  build() { buildDemoFactory(this.game, 0, 0, this.chests); }
  render(r: Renderer, dt: number) {
    const g = this.game;
    if (G.game !== g) G.game = g;
    this.acc += Math.min(0.1, dt);
    let n = 0;
    while (this.acc >= 1 / 60 && n < 3) { g.update(); this.acc -= 1 / 60; n++; }
    if (n >= 3) this.acc = 0;
    g.renderTime += dt;
    g.daytime = 0;
    if (g.tick % 3600 === 0) for (const c of this.chests) c?.inv?.clear();
    // drifting camera
    this.t += dt;
    const k = (Math.sin(this.t * 0.035) + 1) / 2;
    r.zoom = 34 * r.dpr;
    r.camX = -24 + k * 40;
    r.camY = -5 + Math.sin(this.t * 0.05) * 3;
    this.wr.render(this.view);
  }
}
void CHUNK;

export function buildDemoFactory(g: Game, ox: number, oy: number, chests: any[]) {
  const place = (id: string, x: number, y: number, dir: Dir = 0) => {
    const e = g.buildEntity(id, x + ox, y + oy, dir);
    if (typeof e === 'string') { console.warn('menu demo: cannot place', id, x, y, e); return null; }
    return e as any;
  };
  const w = g.world;
  {
    const iron = RES_NAMES.indexOf('iron-ore');
    // clear the site: no water / trees / rocks in the factory footprint
    for (let y = oy - 20; y <= oy + 14; y++) for (let x = ox - 40; x <= ox + 26; x++) {
      const c = w.chunkAt(x, y, true)!;
      const i = ((y & 31) << 5) | (x & 31);
      if (isWaterTile(c.tiles[i]) || c.tiles[i] >= 20) c.tiles[i] = 3;
      if (c.resType[i] && !(x >= ox - 10 && x <= ox + 3 && y >= oy - 15 && y <= oy - 7)) { c.resType[i] = 0; c.resAmount[i] = 0; }
      const o = w.occAt(x, y); if (o) g.removeEntity(o);
    }
    for (const e of w.entitiesIn(ox - 41, oy - 21, ox + 27, oy + 15, e => e.type === 'tree' || e.type === 'simple-entity' || e.type === 'fish', 2)) g.removeEntity(e);
    for (let y = oy - 15; y <= oy - 7; y++) for (let x = ox - 10; x <= ox + 3; x++) {
      const c = w.chunkAt(x, y, true)!;
      const i = ((y & 31) << 5) | (x & 31);
      c.resType[i] = iron; c.resAmount[i] = 4000 + ((x * 7 + y * 13) & 1023) * 4;
    }
    w.tileVersion++;
    for (const c of w.chunks.values()) c.mapDirty = true;
    // mining: two rows of electric drills facing a shared belt
    for (const x of [-7.5, -4.5, -1.5, 1.5]) { place('electric-mining-drill', x, -12.5, 2); place('electric-mining-drill', x, -8.5, 0); }
    for (let x = -8.5; x <= 8.5; x++) place('transport-belt', x, -10.5, 1);
    for (let y = -10.5; y <= 6.5; y++) place('transport-belt', 9.5, y, 2);
    // smelting column
    for (const y of [-7.5, -4.5, -1.5, 1.5]) {
      place('fast-inserter', 10.5, y, 3);
      place('electric-furnace', 12.5, y, 0);
      place('fast-inserter', 14.5, y, 3);
    }
    for (let y = -7.5; y <= 6.5; y++) place('transport-belt', 15.5, y, 2);
    place('inserter', 15.5, 7.5, 0);
    chests.push(place('steel-chest', 15.5, 8.5, 0));
    place('inserter', 9.5, 7.5, 0);
    chests.push(place('steel-chest', 9.5, 8.5, 0));
    // gear assemblers
    for (const y of [0.5, 4.5]) {
      place('inserter', 16.5, y, 3);
      const a = place('assembling-machine-2', 18.5, y, 0);
      if (a) a.setRecipe(RECIPES['iron-gear-wheel']);
      place('inserter', 20.5, y, 3);
      chests.push(place('iron-chest', 21.5, y, 0));
    }
    // power: solar field + medium poles
    for (const yc of [-13.5, -9.5, -5.5, -1.5]) for (let i = 0; i < 8; i++) place('solar-panel', -34.5 + i * 3, yc, 0);
    for (const yp of [-11.5, -3.5]) for (const xp of [-34.5, -27.5, -20.5, -13.5]) place('medium-electric-pole', xp, yp, 0);
    for (const [x, y] of [[-6.5, -14.5], [0.5, -14.5], [-6.5, -5.5], [0.5, -5.5], [8.5, -7.5], [10.5, -5.5], [10.5, -0.5], [14.5, -5.5], [14.5, -0.5], [19.5, 2.5], [14.5, 5.5], [8.5, 5.5]]) place('medium-electric-pole', x, y, 0);
  }
}
