// Game: owns world, player and all simulation systems; runs the 60 UPS tick.
import { World, Chunk } from './world/world';
import { MapSettings, CHUNK } from './world/mapgen';
import { G, TPS, Dir, DIRS, tileKey } from './core';
import { Entity, PHASE, createEntity } from './sim/entity';
import { Player, Character } from './sim/player';
import { BeltSystem, BeltBase } from './sim/belts';
import { FluidSystem } from './sim/fluids';
import { ElectricSystem, ElectricPole } from './sim/power';
import { Research, Stats, Bonuses, emptyBonuses } from './sim/research';
import { ItemOnGround, Tree, Rock, Fish, Remnants, Container, CharacterCorpse } from './sim/simple';
import { ENTITIES, ITEMS, TECHS, itemName } from './data/protos';
import { PLACE_TILE_ID, isWaterTile, isPlayerTile, TILES } from './world/tiles';
import { Stack } from './sim/inventory';
import { spawnCrashSite } from './sim/crashsite';
import type { Renderer } from './engine/renderer';

export interface FX {
  update(): void; draw(r: Renderer): void;
  smoke(x: number, y: number, size: number): void;
  explosion(x: number, y: number, size: number): void;
  flyText(x: number, y: number, text: string, color?: string): void;
  [k: string]: any;
}
export interface Sound { play(name: string, vol?: number, x?: number, y?: number): void; [k: string]: any; }

export class Game {
  world: World;
  player: Player;
  belts = new BeltSystem();
  fluids = new FluidSystem();
  power = new ElectricSystem();
  research = new Research();
  stats = new Stats();
  bonus: Bonuses = emptyBonuses();
  tick = 0;
  renderTime = 0;
  daytime = 0.0;        // 0..1, 0 = noon
  updatables: Entity[][] = [];
  removedPending = false;
  fx: FX = null as any;
  sound: Sound = { play() { } };
  ui: any = null;
  enemies: any = null;
  logistics: any = null;
  rails: any = null;
  trains: any = null;
  circuits: any = null;
  heat: any = null;
  combat: any = null;
  cheatFastCraft = false;
  settings: MapSettings;
  pollutionChunks = new Set<Chunk>();
  totalPollutionProduced = 0;
  rocketsLaunched = 0;
  victory = false;
  paused = false;
  speed = 1;
  playTicks = 0;
  peaceful = false;
  gameName = 'New game';
  entityCountVersion = 0;

  static emptyBonuses = emptyBonuses;

  constructor(settings: MapSettings) {
    G.game = this;
    this.settings = settings;
    this.peaceful = settings.peaceful;
    this.world = new World(settings);
    this.world.onChunkGenerated = (c, ents) => this.populateChunk(c, ents);
    for (let i = 0; i <= 12; i++) this.updatables.push([]);
    this.player = new Player(0.5, 0.5);
    this.research.init();
  }

  start(newGame: boolean) {
    // generate around spawn
    for (let cy = -3; cy <= 2; cy++) for (let cx = -3; cx <= 2; cx++) { this.world.getChunk(cx, cy); this.chart(cx, cy); }
    if (newGame) {
      // find walkable spawn
      let sx = 0.5, sy = 0.5;
      for (let r = 0; r < 20; r++) {
        let found = false;
        for (let a = 0; a < 16 && !found; a++) {
          const x = Math.round(Math.cos(a / 16 * Math.PI * 2) * r), y = Math.round(Math.sin(a / 16 * Math.PI * 2) * r);
          if (!this.world.isWater(x, y) && !this.world.occAt(x, y)) { sx = x + 0.5; sy = y + 0.5; found = true; }
        }
        if (found) break;
      }
      this.player.character.x = sx; this.player.character.y = sy;
      this.player.spawnX = sx; this.player.spawnY = sy;
      this.world.addUnit(this.player.character);
      if (!(this.settings as any).noCrashSite) spawnCrashSite(sx, sy);
      // Factorio 2.0 freeplay start: pistol, 10 ammo, 8 iron plates, 1 burner drill, 1 stone furnace + wood
      const p = this.player;
      p.give('pistol', 1); p.give('firearm-magazine', 10);
      p.give('iron-plate', 8); p.give('wood', 1);
      p.give('burner-mining-drill', 1); p.give('stone-furnace', 1);
      p.quickbar[0] = 'transport-belt'; p.quickbar[1] = 'inserter'; p.quickbar[2] = 'small-electric-pole'; p.quickbar[3] = 'burner-mining-drill';
      p.quickbar[4] = 'electric-mining-drill'; p.quickbar[5] = 'stone-furnace'; p.quickbar[6] = 'assembling-machine-1';
      p.quickbar[7] = 'wooden-chest'; p.quickbar[8] = 'burner-inserter'; p.quickbar[9] = 'pipe';
      p.quickbar[10] = 'underground-belt'; p.quickbar[11] = 'splitter'; p.quickbar[12] = 'long-handed-inserter'; p.quickbar[13] = 'fast-inserter';
      p.quickbar[14] = 'medium-electric-pole'; p.quickbar[15] = 'big-electric-pole'; p.quickbar[16] = 'lab'; p.quickbar[17] = 'iron-chest';
      p.quickbar[18] = 'stone-wall'; p.quickbar[19] = 'gun-turret';
    }
  }

  // ---------- chunk population ----------
  populateChunk(c: Chunk, ents: any[]) {
    for (const g of ents) {
      if (g.kind === 'tree') {
        const t = new Tree('tree', g.x, g.y, 0);
        t.variant = g.variant < 0 ? -1 - (Math.floor(g.x * 7 + g.y * 13) & 3) : g.variant;
        if (this.world.occAt(Math.floor(g.x), Math.floor(g.y))) continue;
        this.world.addEntity(t);
      } else if (g.kind === 'rock') {
        const r = new Rock('rock', g.x, g.y, 0);
        r.sub = g.sub; r.variant = g.variant;
        let free = true;
        for (let y = r.ty; y < r.ty + 2; y++) for (let x = r.tx; x < r.tx + 2; x++) {
          const cc = this.world.chunkAt(x, y);
          if (!cc || this.world.occAt(x, y) || isWaterTile(this.world.tile(x, y))) free = false;
        }
        if (free) this.world.addEntity(r);
      } else if (g.kind === 'fish') {
        this.world.addEntity(new Fish('fish', g.x, g.y, 0), false);
      } else if (g.kind === 'spawner' || g.kind === 'worm') {
        this.enemies?.spawnBase(g);
      }
    }
    this.enemies?.retryPending();
  }

  chart(cx: number, cy: number) {
    const c = this.world.getChunk(cx, cy, true)!;
    if (!c.charted) { c.charted = true; c.mapDirty = true; }
  }

  // ---------- entity lifecycle ----------
  addEntity(e: Entity) {
    if ((e as any).isUnit) this.world.addUnit(e); else this.world.addEntity(e);
    const ph = e.phase;
    if (ph >= 0) this.updatables[ph].push(e);
    e.onPlaced();
    this.notifyNeighbours(e);
    this.entityCountVersion++;
  }
  removeEntity(e: Entity) {
    if (e.dead) return;
    e.dead = true;
    if ((e as any).isUnit) this.world.removeUnit(e); else this.world.removeEntity(e);
    e.onRemoved();
    this.removedPending = true;
    this.notifyNeighbours(e);
    this.entityCountVersion++;
    this.logistics?.onEntityRemoved?.(e);
    this.circuits?.onEntityRemoved?.(e);
    this.ui?.onEntityRemoved?.(e);
  }
  notifyNeighbours(e: Entity) {
    if (e instanceof BeltBase) this.belts.dirty = true;
    if ((e as any).fluidBoxes) this.fluids.dirty = true;
  }
  findEntityOfType(type: string): Entity | null {
    for (const e of this.world.entities.values()) if (e.type === type && !e.dead) return e;
    return null;
  }

  // Place entity from an item (player or robot). Returns entity or error string.
  buildEntity(protoId: string, x: number, y: number, dir: Dir, opts: { fromPlayer?: boolean; ghost?: boolean; flags?: number; noFluidCheck?: boolean; returnOld?: (id: string, n: number) => void } = {}): Entity | string {
    const chk = this.world.canPlace(protoId, x, y, dir, { ghost: opts.ghost });
    if (!chk.ok) return chk.reason || 'Cannot build here';
    const p = ENTITIES[protoId];
    // fast replace
    let replaced: Entity | null = null;
    let ghostSettings: any = null;
    const giveOld = opts.returnOld || ((id: string, n: number) => { this.player.give(id, n); });
    for (const o of chk.replace || []) {
      if (o.type === 'ghost') { if ((o as any).target === protoId) ghostSettings = (o as any).settings; this.removeEntity(o); continue; }
      if (o.type === 'item-on-ground') { this.removeEntity(o); this.player.give((o as ItemOnGround).item, 1); continue; }
      if (o.name === protoId && o.dir === dir && o.x === x && o.y === y) return 'Already built';
      replaced = o;
    }
    if (protoId === 'straight-rail' || protoId === 'curved-rail') return 'Use the rail planner';
    const e = createEntity(protoId, x, y, dir);
    if (opts.flags) e.flags = opts.flags;
    if ((e as any).fluidBoxes && !opts.noFluidCheck) {
      const mix = this.fluids.wouldMix(e as any);
      if (mix) return mix;
    }
    if (replaced) {
      // carry state over
      const state = replaced.serialize();
      const contents = replaced.contents();
      this.removeEntity(replaced);
      if (replaced.name !== protoId && replaced.proto.item) giveOld(replaced.proto.item, 1);
      this.addEntity(e);
      try {
        if (replaced.type === e.type) e.load(state);
        else for (const s of contents) { const n = e.insertItem(s.id, s.n, 'player'); if (n < s.n) giveOld(s.id, s.n - n); }
      } catch { /* ignore */ }
      if (e instanceof BeltBase && replaced instanceof BeltBase) { /* lanes kept via load */ }
    } else this.addEntity(e);
    if (ghostSettings) this.logistics?.applySettings?.(e, ghostSettings);
    if (e.type === 'underground-belt') this.autoUndergroundKind(e as any);
    this.sound.play('build', 0.6, x, y);
    return e;
  }
  autoUndergroundKind(u: any) {
    if (u._kindSet) return;
    // if there's an unpaired entrance behind facing same dir within range, become exit
    const f = DIRS[u.dir];
    for (let i = 1; i <= u.proto.ugMax; i++) {
      const o = this.world.occAt(Math.floor(u.x) - f[0] * i, Math.floor(u.y) - f[1] * i) as any;
      if (o && o.type === 'underground-belt' && o.name === u.name) {
        if (o.dir === u.dir && o.kind === 'in' && !o.partner) { u.kind = 'out'; }
        break;
      }
    }
    this.belts.dirty = true;
  }

  placeTile(item: string, x: number, y: number): boolean {
    const tileName = ITEMS[item]?.placeTile;
    if (!tileName) return false;
    const tid = PLACE_TILE_ID[tileName];
    const cur = this.world.tile(x, y);
    if (tileName === 'landfill') {
      if (!isWaterTile(cur)) return false;
      // can't landfill under entities (fish ok)
    } else {
      if (isWaterTile(cur)) return false;
      if (cur === tid) return false;
      if (tid === 33 && (cur === 33 || cur === 34)) return false;
    }
    if (isPlayerTile(cur) && cur !== 30 && tileName !== 'landfill') {
      const old = TILES[cur]?.item;
      if (old) this.player.give(old, 1);
    }
    this.world.setTile(x, y, tid);
    if (tileName === 'landfill') {
      for (const e of this.world.entitiesIn(x, y, x + 1, y + 1, e => e.type === 'fish', 1)) this.removeEntity(e);
    }
    return true;
  }

  // Player finished mining a target
  playerMine(t: Entity | [number, number]) {
    const p = this.player;
    if (Array.isArray(t)) {
      const [rid, amt] = this.world.res(t[0], t[1]);
      if (!rid || amt <= 0) return;
      if (rid === 'crude-oil' || rid === 'uranium-ore') { this.ui?.flyText(t[0], t[1], 'Cannot be mined by hand', '#ff8a6a'); return; }
      this.world.setResAmount(t[0], t[1], amt - 1);
      p.give(rid, 1);
      this.stats.produce(rid, 1);
      this.ui?.flyText(t[0] + 0.5, t[1], `+1 ${itemName(rid)}`);
      return;
    }
    const e = t;
    if (e.dead) return;
    if ((e as any).minedItems) {
      const items: Stack[] = (e as any).minedItems();
      for (const s of items) { p.give(s.id, s.n); this.stats.produce(s.id, s.n); this.ui?.flyText(e.x, e.y, `+${s.n} ${itemName(s.id)}`); }
      this.removeEntity(e);
      if (e.type === 'tree') this.leaveStump(e);
      return;
    }
    if (e instanceof ItemOnGround) { p.give(e.item, 1); this.removeEntity(e); return; }
    if (e.type === 'character-corpse') { (e as any).loot(); return; }
    if (e.type === 'ghost') { this.removeEntity(e); return; }
    if (!e.isBuilding) return;
    // mine building
    const contents = e.contents();
    this.removeEntity(e);
    if (e.proto.item) { p.give(e.proto.item, 1); this.ui?.flyText(e.x, e.y, `+1 ${itemName(e.proto.item)}`); }
    for (const s of contents) p.give(s.id, s.n);
    this.sound.play('deconstruct', 0.6, e.x, e.y);
  }
  leaveStump(e: Entity) { }

  spillItem(x: number, y: number, id: string, n: number, exact = false) {
    for (let i = 0; i < n; i++) {
      let px = x, py = y;
      if (!exact) {
        // spiral search for free spot
        let placed = false;
        for (let r = 0; r < 8 && !placed; r++) for (let k = 0; k < Math.max(1, r * 8) && !placed; k++) {
          const a = k / Math.max(1, r * 8) * Math.PI * 2;
          const tx = x + Math.cos(a) * r * 0.5, ty = y + Math.sin(a) * r * 0.5;
          if (this.world.isWater(Math.floor(tx), Math.floor(ty))) continue;
          const o = this.world.occAt(Math.floor(tx), Math.floor(ty));
          if (o && o.blocksMovement && o.type !== 'item-on-ground') continue;
          const near = this.world.entitiesIn(tx - 0.2, ty - 0.2, tx + 0.2, ty + 0.2, e => e.type === 'item-on-ground', 1);
          if (near.length) continue;
          px = tx; py = ty; placed = true;
        }
      }
      // onto belt?
      const b = this.world.occAt(Math.floor(px), Math.floor(py));
      if (b instanceof BeltBase) {
        const dl = (b as any).dropLane ? (b as any).dropLane(px, py, px, py) : null;
        if (dl && dl[0].hasSpaceAt(dl[1])) { dl[0].insertAt(dl[1], id); continue; }
      }
      const it = new ItemOnGround('item-on-ground', px, py, 0);
      it.item = id;
      this.world.addEntity(it, false);
    }
  }
  spawnCorpse(x: number, y: number, items: Stack[]) {
    const c = new CharacterCorpse('wooden-chest', x, y, 0);
    (c as any).type = 'character-corpse';
    c.inv.resize(items.length + 4);
    for (const s of items) c.inv.insertStack(s);
    (c as any).loot = () => {
      for (const s of c.inv.slots) if (s) this.player.give(s.id, s.n);
      this.removeEntity(c);
    };
    (c as any).draw = (r: Renderer) => r.draw('objects', r.atlas.get('character-corpse'), c.x, c.y, undefined as any, 0, 1, c.y);
    this.world.addEntity(c, false);
  }

  destroyEntity(e: Entity, source?: any) {
    if (e.dead) return;
    if (e instanceof Character) { this.player.die(); return; }
    if (this.enemies?.isEnemy(e)) { this.enemies.onDeath(e, source); return; }
    if (e.type === 'tree') { this.fx?.smoke(e.x, e.y - 0.5, 1); this.removeEntity(e); return; }
    const size = Math.max(e.w, e.h);
    this.fx?.explosion(e.x, e.y, Math.min(3, 0.6 + size * 0.4));
    this.sound.play('explosion', 0.8, e.x, e.y);
    const contents = e.isBuilding ? [] : [];
    void contents;
    this.removeEntity(e);
    if (e.isBuilding) {
      const r = new Remnants('remnants', e.x, e.y, 0);
      r.size = Math.max(0.6, size * 0.55); r.born = this.tick;
      this.world.addEntity(r, false);
      this.ui?.alert('destroyed', e);
      // ghost for rebuild
      this.logistics?.addGhost?.(e.name, e.x, e.y, e.dir);
    }
  }

  pollute(x: number, y: number, amount: number) {
    if (amount <= 0) return;
    const c = this.world.chunkAt(Math.floor(x), Math.floor(y));
    if (!c) return;
    c.pollution += amount;
    this.pollutionChunks.add(c);
    this.totalPollutionProduced += amount;
    this.enemies?.onPollution(amount);
  }

  // daylight 0..1 for solar, darkness for rendering
  get daylight(): number {
    const t = this.daytime;
    // Factorio: dusk 0.25, evening 0.45, morning 0.55, dawn 0.75
    if (t < 0.25 || t > 0.75) return 1;
    if (t < 0.45) return 1 - (t - 0.25) / 0.2;
    if (t < 0.55) return 0;
    return (t - 0.55) / 0.2;
  }
  get darkness(): number { return (1 - this.daylight) * 0.85; }

  // ---------- main tick ----------
  update() {
    if (this.paused) return;
    this.tick++;
    this.playTicks++;
    this.daytime = (this.daytime + 1 / 25000) % 1;
    const p = this.player;
    if (p.respawnT >= 0) { p.respawnT--; if (p.respawnT === 0) p.respawn(); }
    // player
    if (!p.dead) { p.updateCrafting(); }
    this.ui?.input?.updatePlayer?.();
    // systems
    this.belts.tick();
    const U = this.updatables;
    for (const phase of [PHASE.INSERTER, PHASE.MACHINE, PHASE.MISC, PHASE.COMBAT, PHASE.CIRCUIT]) {
      const arr = U[phase];
      for (let i = 0; i < arr.length; i++) { const e = arr[i]; if (!e.dead) e.update(); }
    }
    this.fluids.tick();
    this.heat?.tick();
    this.power.tick();
    this.enemies?.tick();
    this.logistics?.tick();
    this.trains?.tick();
    this.circuits?.tick();
    this.combat?.tick();
    if (this.tick % 64 === 0) this.updatePollution();
    this.stats.tick(this.tick);
    if (this.timers.length) {
      const due = this.timers.filter(t => t.t <= this.tick);
      if (due.length) { this.timers = this.timers.filter(t => t.t > this.tick); for (const t of due) t.f(); }
    }
    this.fx?.update();
    if (this.removedPending) {
      for (const arr of U) { let j = 0; for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i]; arr.length = j; }
      this.removedPending = false;
    }
    // generate chunks around player
    if (this.tick % 30 === 0) this.ensureChunksAround(p.x, p.y, 4);
    // passive regen
    const ch = p.character;
    if (!ch.dead) {
      if (ch.regenDelay > 0) ch.regenDelay--; else if (ch.health < ch.maxHealth) ch.health = Math.min(ch.maxHealth, ch.health + 0.15);
      const eq = p.equipmentStats();
      // equipment energy
      p.battery = Math.min(eq.cap + 0, p.battery + eq.gen / 60);
      if (p.shieldHP < eq.shieldMax) { const k = Math.min(eq.shieldMax - p.shieldHP, 12 / 60 * 10, p.battery / 20000); p.shieldHP += k; p.battery -= k * 20000; }
      if (eq.cap === 0) p.battery = 0;
    }
    if (this.tick % (60 * 60 * 5) === 0) this.ui?.autosave?.();
  }

  ensureChunksAround(x: number, y: number, r: number) {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    let made = 0;
    for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const c = this.world.getChunk(cx + dx, cy + dy, false);
      if (!c) { if (made++ > 2) return; this.world.getChunk(cx + dx, cy + dy, true); }
      if (d <= 3) this.chart(cx + dx, cy + dy);
    }
  }

  updatePollution() {
    const w = this.world;
    const next: [Chunk, number][] = [];
    for (const c of this.pollutionChunks) {
      if (c.pollution > 15) {
        const spread = c.pollution * 0.02;
        for (const [dx, dy] of DIRS) {
          const n = w.getChunk(c.cx + dx, c.cy + dy, true)!;
          next.push([n, spread]);
        }
        c.pollution -= spread * 4;
      }
      // absorption by tiles: ~1.1 per minute per chunk for grass => per 64 ticks
      const absorb = 0.000018 * 1024 * 64 / 60;
      c.pollution = Math.max(0, c.pollution - absorb);
      // trees
      if (c.treeCount > 0 && c.pollution > 0) {
        c.pollution = Math.max(0, c.pollution - c.treeCount * 0.001 * 64 / 60);
        if (c.pollution > 60 && Math.random() < 0.3) this.damageTreeIn(c);
      }
      this.enemies?.absorbPollution(c);
      if (c.pollution <= 0.01) { c.pollution = 0; this.pollutionChunks.delete(c); }
      c.mapDirty = c.mapDirty || (this.tick % 640 === 0);
    }
    for (const [n, a] of next) { n.pollution += a; this.pollutionChunks.add(n); }
  }
  damageTreeIn(c: Chunk) {
    for (let k = 0; k < 3; k++) {
      const e = c.ents[Math.floor(Math.random() * c.ents.length)];
      if (e instanceof Tree && e.leafStage < 3) { e.leafStage++; c.pollution = Math.max(0, c.pollution - 10); return; }
    }
  }

  rocketLaunched(silo: any) {
    this.rocketsLaunched++;
    const payload = silo.payload.slots[0];
    silo.payload.clear();
    if (payload?.id === 'satellite') {
      this.research.onLaunch('satellite');
      const pad = this.findEntityOfType('cargo-landing-pad') as Container | null;
      setTimeoutTicks(this, 60 * 29, () => {
        if (pad && !pad.dead) pad.inv.insert('space-science-pack', 1000);
        else this.player.give('space-science-pack', 1000);
        this.stats.produce('space-science-pack', 1000);
        this.ui?.showMessage('1000 space science packs delivered to the cargo landing pad.');
      });
    }
    if (!this.victory && payload) { this.victory = true; this.ui?.showVictory?.(); }
    this.sound.play('rocket', 1);
  }
  timers: { t: number; f: () => void }[] = [];
}

export function setTimeoutTicks(g: Game, ticks: number, f: () => void) {
  g.timers.push({ t: g.tick + ticks, f });
}
