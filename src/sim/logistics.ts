// Logistics: entity ghosts, blueprints, deconstruction / upgrade planners, roboports, logistic networks,
// construction & logistic robots, logistic chests, personal roboport and player logistic requests/trash.
import { Entity, PHASE, registerEntity, createEntity } from './entity';
import { Inventory, Stack, stackSize } from './inventory';
import { G, Dir, DIRS, rotOffset, clamp } from '../core';
import { ENTITIES, ITEMS, RECIPES, TECHS, itemName, entityForItem } from '../data/protos';
import type { Renderer } from '../engine/renderer';
import { WHITE, rgba, additive } from '../engine/renderer';
import { Container, ItemOnGround } from './simple';
import { Character } from './player';
import { h } from '../util/dom';

const GHOST_TINT = rgba(0.62, 0.86, 1, 0.52);
const LOGI_R = 25, CONS_R = 55;

// ---------------- settings capture/apply (blueprints, ghosts, copy/paste) ----------------
export function captureSettings(e: Entity): any {
  const x = e as any;
  if (x.bpSettings) return x.bpSettings();
  const s: any = {};
  if (x.recipe && x.setRecipe && e.type !== 'rocket-silo' && e.type !== 'furnace') s.r = x.recipe.id;
  if (e.type === 'inserter') { s.f = x.filters; s.fm = x.filterMode; s.uf = x.useFilters; s.so = x.stackOverride; }
  if (e.type === 'splitter') { s.op = x.outPriority; s.ip = x.inPriority; s.sf = x.filter; }
  if (e.type === 'underground-belt') s.k = x.kind;
  if (x.requests?.length) { s.rq = x.requests.map((q: any) => ({ ...q })); s.rb = x.requestFromBuffers; }
  if (x.control) s.ctl = JSON.parse(JSON.stringify(x.control));
  if (x.stationName !== undefined) s.sn = x.stationName;
  if (x.modules) { const m = x.modules.slots.filter(Boolean).map((st: Stack) => st.id); if (m.length) s.mods = m; }
  return Object.keys(s).length ? s : null;
}
export function applySettings(e: Entity, s: any) {
  if (!s) return;
  const x = e as any;
  if (x.applyBp) { x.applyBp(s); return; }
  if (s.r && x.setRecipe && RECIPES[s.r]) { try { x.setRecipe(RECIPES[s.r]); } catch { /* recipe not usable */ } }
  if (e.type === 'inserter') { if (s.f) x.filters = [...s.f]; if (s.fm) x.filterMode = s.fm; x.useFilters = !!s.uf; x.stackOverride = s.so || 0; }
  if (e.type === 'splitter') { x.outPriority = s.op || 'none'; x.inPriority = s.ip || 'none'; x.filter = s.sf || null; }
  if (e.type === 'underground-belt' && s.k) { x.kind = s.k; x._kindSet = true; G.game.belts.dirty = true; }
  if (s.rq) { x.requests = s.rq.map((q: any) => ({ ...q })); x.requestFromBuffers = !!s.rb; }
  if (s.ctl) x.control = JSON.parse(JSON.stringify(s.ctl));
  if (s.sn !== undefined) x.stationName = s.sn;
}

// ---------------- Ghost ----------------
export class Ghost extends Entity {
  isGhost = true;
  target = 'wooden-chest';
  settings: any = null;
  claimed: Robot | null = null;
  waiting = 0;
  preview: Entity | null = null;
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p === 'entity-ghost' ? 'wooden-chest' : p, x, y, d);
    this.setTarget(p === 'entity-ghost' ? 'wooden-chest' : p, d);
  }
  setTarget(t: string, d: Dir) {
    this.target = t;
    this.proto = ENTITIES[t];
    this.name = 'entity-ghost'; this.type = 'ghost';
    this.dir = (this.proto.rotatable ? d : 0) as Dir;
    const swap = (this.dir & 1) === 1;
    this.w = swap ? this.proto.h : this.proto.w; this.h = swap ? this.proto.w : this.proto.h;
    this.health = 1;
    this.preview = null;
  }
  get maxHealth() { return 1; }
  get isBuilding() { return false; }
  get blocksMovement() { return false; }
  get item() { return this.proto.item; }
  damage() { return 0; }
  draw(r: Renderer, alt: boolean) {
    if (!this.preview) {
      this.preview = createEntity(this.target, this.x, this.y, this.dir);
      this.preview.flags = this.flags;
      if (this.settings) try { applySettings(this.preview, this.settings); } catch { /* ignore */ }
      if ((this.preview as any).updatePositions) (this.preview as any).updatePositions();
    }
    r.redirect = 'objects'; r.tint = GHOST_TINT;
    try { this.preview.draw(r, alt); } catch { /* best effort */ }
    r.redirect = null;
  }
  serialize() { return { t: this.target, d: this.dir, s: this.settings }; }
  load(d: any) { this.setTarget(d.t, d.d); this.settings = d.s || null; }
}
registerEntity(['entity-ghost'], Ghost);

// ---------------- Roboport ----------------
export class Roboport extends Entity {
  robots = new Inventory(7);
  repair = new Inventory(7);
  energy = 0;
  net: LogisticNetwork | null = null;
  charging: Robot[] = [];
  get phase() { return PHASE.MISC; }
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    (this.robots as any).accepts = (id: string) => id === 'logistic-robot' || id === 'construction-robot';
    (this.repair as any).accepts = (id: string) => id === 'repair-pack';
  }
  onPlaced() { G.game.power.addElectric(this); G.game.logistics?.addRoboport(this); }
  onRemoved() { G.game.power.removeElectric(this); G.game.logistics?.removeRoboport(this); }
  inventories() { return [this.robots, this.repair]; }
  wants(id: string) { return (this.robots as any).accepts(id) ? this.robots.space(id) : id === 'repair-pack' ? this.repair.space(id) : 0; }
  insertItem(id: string, n: number) { if ((this.robots as any).accepts(id)) return this.robots.insert(id, n); if (id === 'repair-pack') return this.repair.insert(id, n); return 0; }
  count(kind: 'logistic' | 'construction') { return this.robots.count(kind + '-robot'); }
  update() {
    const cap = 100e6;
    this.energy = Math.min(cap, this.energy + ((this as any)._req || 0) * this.power);
    const req = Math.min(5e6 / 60, cap - this.energy);
    (this as any)._req = req;
    this.demand = (this.proto.drain || 0) / 60 + req;
    this.warnIcon = !this.elecNet || this.power <= 0 ? 'warn-no-power' : null;
  }
  // charge robot; returns true when done
  chargeRobot(rb: Robot): boolean {
    const need = rb.maxEnergy - rb.energy;
    const k = Math.min(need, 1e6 / 60 * 2, this.energy);
    rb.energy += k; this.energy -= k;
    return rb.energy >= rb.maxEnergy - 1;
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get('roboport'), this.x, this.y, WHITE, 0, 1, this.y + 0.5);
    r.draw('shadow', a.get('roboport-shadow'), this.x, this.y);
    if (this.power > 0 && this.elecNet) {
      const k = 0.6 + 0.4 * Math.sin(G.game.renderTime * 3 + this.id);
      for (const [dx, dy] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) r.draw('light', a.get('light'), this.x + dx, this.y + dy - 0.8, additive(1, 0.8, 0.4, 0.5 * k), 0, 2);
    }
  }
  serialize() { return { r: this.robots.serialize(), p: this.repair.serialize(), e: this.energy }; }
  load(d: any) { this.robots.load(d.r); this.repair.load(d.p); this.energy = d.e || 0; }
  buildGUI(win: any, P: HTMLElement) {
    win.status(P); win.powerInfo(P);
    win.progress(P, () => this.energy / 100e6, () => `Energy ${(this.energy / 1e6).toFixed(1)} / 100 MJ`, 'blue');
    const r1 = h('div', 'row', P); h('div', 'label', r1, 'Robots'); win.invGrid(r1, () => this.robots, 7);
    const r2 = h('div', 'row', P); h('div', 'label', r2, 'Repair packs'); win.invGrid(r2, () => this.repair, 7);
    const info = h('div', 'mini-label', P);
    win.updaters.push(() => {
      const n = this.net;
      if (!n) { info.textContent = 'No network'; return; }
      const s = n.stats();
      info.innerHTML = `Logistic network #${n.id}<br>Logistic robots: ${s.logAvail} available / ${s.logTotal} total<br>Construction robots: ${s.conAvail} available / ${s.conTotal} total<br>Roboports: ${n.roboports.length} · Chests: ${n.chests.length}`;
    });
  }
}
registerEntity(['roboport'], Roboport);

// ---------------- Robot ----------------
type RobotState = 'idle' | 'toPickup' | 'toTarget' | 'toDrop' | 'return' | 'charging' | 'working';
interface Task {
  kind: 'build' | 'decon' | 'repair' | 'deliver' | 'upgrade' | 'player';
  item?: string; n?: number;
  from?: Container | Character | null;     // pickup
  to?: Container | Character | Entity | null; // destination
  ghost?: Ghost; ent?: Entity; upgradeTo?: string;
}
export class Robot extends Entity {
  kind: 'logistic' | 'construction';
  state: RobotState = 'idle';
  task: Task | null = null;
  cargo: Stack[] = [];
  energy: number;
  home: Roboport | null = null;
  personal = false;
  net: LogisticNetwork | null = null;
  workT = 0;
  face = 0;
  noSave = true;
  constructor(kind: 'logistic' | 'construction', x: number, y: number) {
    super(kind + '-robot', x, y, 0);
    this.kind = kind; this.w = this.h = 0.5;
    this.energy = this.maxEnergy;
  }
  get maxEnergy() { return 1.5e6; }
  get isBuilding() { return false; }
  get selectable() { return false; }
  get minable() { return false; }
  get blocksMovement() { return false; }
  get speed() {
    const base = this.kind === 'construction' ? 0.06 : 0.05;
    const s = base * (1 + G.game.bonus.robotSpeed);
    return this.energy > 0 || this.personal ? s : s * 0.2;
  }
  damage(amount: number) { this.health -= amount; if (this.health <= 0 && !this.dead) G.game.logistics?.robotDied(this); return amount; }
  flyTo(x: number, y: number): boolean {
    const dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
    const s = this.speed;
    if (d <= s) { this.x = x; this.y = y; return true; }
    this.x += dx / d * s; this.y += dy / d * s;
    if (!this.personal) this.energy = Math.max(0, this.energy - 5e3 * s - 50);
    this.face = Math.atan2(dy, dx);
    return false;
  }
  draw(r: Renderer) {
    const a = r.atlas;
    const bob = Math.sin(G.game.renderTime * 4 + this.id) * 0.05;
    const sp = a.get(this.kind + '-robot-fly');
    r.draw('airShadow', sp, this.x + 1.2, this.y + 0.6, rgba(0, 0, 0, 0.3), 0, 1.0);
    r.draw('air', sp, this.x, this.y - 1.5 + bob, WHITE, 0, 1.0, 1e6);
    if (this.cargo.length) r.draw('air', a.get('icon:' + this.cargo[0].id), this.x, this.y - 1.15 + bob, WHITE, 0, 0.3, 1e6 + 1);
    if (this.state === 'working') r.draw('light', a.get('light'), this.x, this.y - 1.2, additive(1, 0.85, 0.5, 0.6), 0, 2);
  }
}

// ---------------- Network ----------------
export class LogisticNetwork {
  id: number;
  roboports: Roboport[] = [];
  chests: Container[] = [];
  robots: Robot[] = [];
  constructor(id: number) { this.id = id; }
  coversLogistic(x: number, y: number) { for (const r of this.roboports) if (Math.abs(x - r.x) <= LOGI_R && Math.abs(y - r.y) <= LOGI_R) return true; return false; }
  coversConstruction(x: number, y: number) { for (const r of this.roboports) if (Math.abs(x - r.x) <= CONS_R && Math.abs(y - r.y) <= CONS_R) return true; return false; }
  available(kind: 'logistic' | 'construction') { let n = 0; for (const r of this.roboports) n += r.count(kind); return n; }
  stats() {
    const logAvail = this.available('logistic'), conAvail = this.available('construction');
    const flyingL = this.robots.filter(r => r.kind === 'logistic' && !r.dead).length, flyingC = this.robots.filter(r => r.kind === 'construction' && !r.dead).length;
    return { logAvail, conAvail, logTotal: logAvail + flyingL, conTotal: conAvail + flyingC };
  }
  nearestPort(x: number, y: number, kind?: 'logistic' | 'construction', powered = false): Roboport | null {
    let best: Roboport | null = null, bd = 1e18;
    for (const r of this.roboports) {
      if (kind && r.count(kind) <= 0) continue;
      if (powered && r.energy < 1e5) continue;
      const d = (r.x - x) ** 2 + (r.y - y) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }
}

const UPGRADES: Record<string, string> = {
  'transport-belt': 'fast-transport-belt', 'fast-transport-belt': 'express-transport-belt',
  'underground-belt': 'fast-underground-belt', 'fast-underground-belt': 'express-underground-belt',
  'splitter': 'fast-splitter', 'fast-splitter': 'express-splitter',
  'burner-inserter': 'inserter', 'inserter': 'fast-inserter', 'fast-inserter': 'bulk-inserter',
  'assembling-machine-1': 'assembling-machine-2', 'assembling-machine-2': 'assembling-machine-3',
  'stone-furnace': 'steel-furnace', 'small-electric-pole': 'medium-electric-pole',
  'wooden-chest': 'iron-chest', 'iron-chest': 'steel-chest',
};

// ---------------- System ----------------
export class LogisticSystem {
  networks: LogisticNetwork[] = [];
  roboports = new Set<Roboport>();
  chests = new Set<Container>();
  robots: Robot[] = [];
  dirty = true;
  nextNetId = 1;
  reservedOut = new Map<Entity, Map<string, number>>();
  incoming = new Map<Entity, Map<string, number>>();
  ghosts = new Set<Ghost>();
  decon = new Set<Entity>();
  upgrades = new Set<Entity>();
  lastCopy: any = null;
  personalOn = true;
  applySettings = applySettings;

  addRoboport(r: Roboport) { this.roboports.add(r); this.dirty = true; }
  removeRoboport(r: Roboport) {
    this.roboports.delete(r); this.dirty = true;
    // robots belonging here re-home
    for (const rb of this.robots) if (rb.home === r) rb.home = null;
  }
  addChest(c: Container) { this.chests.add(c); this.dirty = true; }
  removeChest(c: Container) { this.chests.delete(c); this.dirty = true; this.reservedOut.delete(c); this.incoming.delete(c); }

  rebuild() {
    this.dirty = false;
    const ports = [...this.roboports].filter(r => !r.dead);
    const seen = new Set<Roboport>();
    const nets: LogisticNetwork[] = [];
    const old = this.networks;
    for (const p of ports) {
      if (seen.has(p)) continue;
      const net = new LogisticNetwork(0);
      const stack = [p]; seen.add(p);
      while (stack.length) {
        const a = stack.pop()!;
        net.roboports.push(a); a.net = net;
        for (const b of ports) if (!seen.has(b) && Math.abs(a.x - b.x) <= LOGI_R * 2 && Math.abs(a.y - b.y) <= LOGI_R * 2) { seen.add(b); stack.push(b); }
      }
      // keep id of an old network sharing a roboport
      const prev = old.find(o => o.roboports.some(r => net.roboports.includes(r)));
      net.id = prev && !nets.some(n => n.id === prev.id) ? prev.id : this.nextNetId++;
      nets.push(net);
    }
    for (const c of this.chests) {
      if (c.dead) continue;
      const n = nets.find(n => n.coversLogistic(c.x, c.y));
      if (n) n.chests.push(c);
    }
    for (const rb of this.robots) if (!rb.personal) { rb.net = rb.home?.net || nets.find(n => n.coversConstruction(rb.x, rb.y)) || nets[0] || null; rb.net?.robots.push(rb); }
    this.networks = nets;
  }
  networkAt(x: number, y: number, construction = false): LogisticNetwork | null {
    for (const n of this.networks) if (construction ? n.coversConstruction(x, y) : n.coversLogistic(x, y)) return n;
    return null;
  }

  // ---- reservations ----
  private res(map: Map<Entity, Map<string, number>>, e: Entity, id: string, n: number) {
    let m = map.get(e); if (!m) { m = new Map(); map.set(e, m); }
    const v = (m.get(id) || 0) + n;
    if (v <= 0) m.delete(id); else m.set(id, v);
  }
  availableIn(c: Container, id: string) { return c.inv.count(id) - (this.reservedOut.get(c)?.get(id) || 0); }
  incomingTo(e: Entity, id: string) { return this.incoming.get(e)?.get(id) || 0; }

  findProvider(net: LogisticNetwork, id: string, near: [number, number], forRequester: boolean, allowBuffers: boolean): Container | null {
    let best: Container | null = null, bd = 1e18, bp = 9;
    for (const c of net.chests) {
      const kind = c.logistic!;
      let prio: number;
      if (kind === 'active-provider') prio = 0;
      else if (kind === 'buffer') { if (forRequester && !allowBuffers) continue; prio = 1; }
      else if (kind === 'passive-provider') prio = 2;
      else if (kind === 'storage') prio = 3;
      else continue;
      if (this.availableIn(c, id) <= 0) continue;
      const d = (c.x - near[0]) ** 2 + (c.y - near[1]) ** 2;
      if (prio < bp || (prio === bp && d < bd)) { bp = prio; bd = d; best = c; }
    }
    return best;
  }
  findStorage(net: LogisticNetwork, id: string, near: [number, number]): Container | null {
    let best: Container | null = null, bd = 1e18, bscore = 9;
    for (const c of net.chests) {
      if (c.logistic !== 'storage') continue;
      const filt = (c as any).storageFilter as string | undefined;
      if (filt && filt !== id) continue;
      if (c.inv.space(id) - this.incomingTo(c, id) <= 0) continue;
      const score = filt === id ? 0 : c.inv.count(id) > 0 ? 1 : c.inv.isEmpty() ? 2 : 3;
      const d = (c.x - near[0]) ** 2 + (c.y - near[1]) ** 2;
      if (score < bscore || (score === bscore && d < bd)) { bscore = score; bd = d; best = c; }
    }
    return best;
  }

  // ---- ghosts ----
  placeGhost(proto: string, x: number, y: number, dir: Dir, settings: any = null, opts: { force?: boolean } = {}): true | string {
    const g = G.game;
    const chk = g.world.canPlace(proto, x, y, dir, { ghost: true });
    if (!chk.ok) {
      // upgrade ghost over existing entity of the same group
      const o = g.world.occAt(Math.floor(x), Math.floor(y));
      if (o && o.isBuilding && o.x === x && o.y === y && o.name !== proto && UPGRADES_ANY(o.name, proto)) { this.markUpgrade(o, proto); return true; }
      if (opts.force) {
        // remove trees/rocks in the way are marked for deconstruction instead
        const p = ENTITIES[proto];
        const rot = p.rotatable && (dir & 1) === 1;
        const w = rot ? p.h : p.w, hh = rot ? p.w : p.h;
        const obst = g.world.entitiesIn(x - w / 2 + 0.01, y - hh / 2 + 0.01, x + w / 2 - 0.01, y + hh / 2 - 0.01, e => e.type === 'tree' || e.type === 'simple-entity', 2);
        if (obst.length && obst.length === g.world.entitiesIn(x - w / 2 + 0.01, y - hh / 2 + 0.01, x + w / 2 - 0.01, y + hh / 2 - 0.01, e => !!g.world.occAt(Math.floor(e.x), Math.floor(e.y)) && e.blocksMovement, 2).length) {
          for (const e of obst) this.markDecon(e);
        }
      }
      return chk.reason || 'Cannot place';
    }
    for (const o of chk.replace || []) {
      if (o.type === 'ghost') g.removeEntity(o);
      else if (o.isBuilding && o.name !== proto) { this.markUpgrade(o, proto); return true; }
      else if (o.isBuilding) return 'Already built';
    }
    const gh = new Ghost(proto, x, y, dir);
    gh.settings = settings;
    g.world.addEntity(gh);
    this.ghosts.add(gh);
    return true;
  }
  addGhost(name: string, x: number, y: number, dir: Dir) {
    if (!G.game.research.levels['construction-robotics'] && !G.game.research.levels['personal-roboport-equipment']) return;
    if (!ENTITIES[name]?.item) return;
    this.placeGhost(name, x, y, dir);
  }
  restoreGhost(e: Ghost, d: any) { e.load(d); G.game.world.addEntity(e); this.ghosts.add(e); }
  onEntityRemoved(e: Entity) {
    if (e instanceof Ghost) { this.ghosts.delete(e); if (e.claimed) e.claimed = null; }
    this.decon.delete(e); this.upgrades.delete(e);
  }
  markDecon(e: Entity) {
    if (e.decon) return;
    e.decon = true; this.decon.add(e);
  }
  unmarkDecon(e: Entity) { e.decon = false; this.decon.delete(e); (e as any)._deconBy = null; }
  markUpgrade(e: Entity, to: string) { (e as any).upgradeTo = to; this.upgrades.add(e); }

  // ---- planners ----
  areaSelected(mode: string, x0: number, y0: number, x1: number, y1: number) {
    const g = G.game, p = g.player;
    const shift = g.ui?.input?.keys?.has('ShiftLeft') || g.ui?.input?.keys?.has('ShiftRight');
    const inArea = (e: Entity) => e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1;
    const ents = g.world.entitiesIn(x0, y0, x1, y1, e => !e.dead && inArea(e), 8);
    if (mode === 'decon') {
      let n = 0;
      for (const e of ents) {
        if (e instanceof Ghost) { if (!shift) { g.removeEntity(e); n++; } continue; }
        const ok = (e.isBuilding && !!e.proto.item) || e.type === 'tree' || e.type === 'simple-entity' || e.type === 'item-on-ground';
        if (!ok) continue;
        if (shift) { if (e.decon) { this.unmarkDecon(e); n++; } }
        else if (!e.decon) { this.markDecon(e); n++; }
      }
      g.ui?.flyText(p.x, p.y - 1.5, `${n} ${shift ? 'unmarked' : 'marked for deconstruction'}`);
      return;
    }
    if (mode === 'upgrade') {
      let n = 0;
      for (const e of ents) {
        if (!e.isBuilding) continue;
        if (shift) { if ((e as any).upgradeTo) { (e as any).upgradeTo = null; this.upgrades.delete(e); n++; } continue; }
        const to = UPGRADES[e.name];
        if (to && g.research.enabledRecipes.has(to)) { this.markUpgrade(e, to); n++; }
      }
      g.ui?.flyText(p.x, p.y - 1.5, `${n} ${shift ? 'unmarked' : 'marked for upgrade'}`);
      return;
    }
    if (mode === 'blueprint' || mode === 'copy' || mode === 'cut') {
      const bp = this.capture(ents.filter(e => e.isBuilding && !!e.proto.item && !(e as any).isUnit));
      if (!bp.entities.length) { g.ui?.flyText(p.x, p.y - 1.5, 'Nothing selected'); return; }
      if (mode === 'cut') for (const e of ents) if (e.isBuilding && e.proto.item) this.markDecon(e);
      if (mode === 'blueprint') { p.cursor = { id: 'blueprint', n: 1, data: { bp } }; }
      else { this.lastCopy = bp; p.cursor = { id: 'blueprint', n: 1, data: { bp, temp: true } }; }
      g.sound.play('build', 0.4);
    }
  }
  capture(ents: Entity[]) {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const e of ents) { minX = Math.min(minX, e.x - e.w / 2); minY = Math.min(minY, e.y - e.h / 2); maxX = Math.max(maxX, e.x + e.w / 2); maxY = Math.max(maxY, e.y + e.h / 2); }
    const ox = Math.round((minX + maxX) / 2), oy = Math.round((minY + maxY) / 2);
    return { entities: ents.map(e => ({ name: e.name, x: e.x - ox, y: e.y - oy, dir: e.dir, flags: e.flags || 0, s: captureSettings(e) })), label: '' };
  }
  bpEntities(bp: any, wx: number, wy: number, rot: number) {
    const ox = Math.round(wx), oy = Math.round(wy);
    return bp.entities.map((b: any) => {
      const [rx, ry] = rotOffset(b.x, b.y, rot);
      const pr = ENTITIES[b.name];
      const dir = (pr?.rotatable ? (b.dir + rot) & 3 : 0) as Dir;
      let x = ox + rx, y = oy + ry;
      // keep grid alignment for odd/even sizes after rotation
      const w = pr && (dir & 1) ? pr.h : pr?.w || 1, hh = pr && (dir & 1) ? pr.w : pr?.h || 1;
      x = w % 2 ? Math.floor(x) + 0.5 : Math.round(x);
      y = hh % 2 ? Math.floor(y) + 0.5 : Math.round(y);
      return { name: b.name, x, y, dir, flags: b.flags, s: b.s };
    });
  }
  blueprintPreview(wx: number, wy: number, rot: number) {
    const p = G.game.player;
    const bp = p.cursor?.data?.bp;
    if (!bp) return null;
    const list = this.bpEntities(bp, wx, wy, rot);
    const extra = list.map((b: any) => {
      const chk = G.game.world.canPlace(b.name, b.x, b.y, b.dir, { ghost: true });
      const o = !chk.ok ? G.game.world.occAt(Math.floor(b.x), Math.floor(b.y)) : null;
      const same = o && o.name === b.name && o.x === b.x && o.y === b.y;
      return { protoId: b.name, x: b.x, y: b.y, dir: b.dir, valid: chk.ok || !!same };
    });
    return { x: wx, y: wy, dir: 0 as Dir, valid: true, ghost: true, extra };
  }
  placeBlueprint(wx: number, wy: number) {
    const g = G.game, p = g.player;
    const bp = p.cursor?.data?.bp;
    if (!bp) return;
    const rot = g.ui?.input?.buildDir || 0;
    const shift = g.ui?.input?.keys?.has('ShiftLeft');
    let n = 0;
    for (const b of this.bpEntities(bp, wx, wy, rot)) {
      const o = g.world.occAt(Math.floor(b.x), Math.floor(b.y));
      if (o && o.name === b.name && o.x === b.x && o.y === b.y && o.dir === b.dir) { if (b.s) applySettings(o, b.s); continue; }
      const res = this.placeGhost(b.name, b.x, b.y, b.dir, b.s, { force: !!shift });
      if (res === true) n++;
    }
    if (n) g.sound.play('build', 0.5);
  }
  startTool(kind: 'blueprint' | 'deconstruction-planner' | 'upgrade-planner' | 'copy' | 'cut') {
    const p = G.game.player;
    p.clearCursor();
    const id = kind === 'copy' || kind === 'cut' ? 'blueprint' : kind;
    p.cursor = { id, n: 1, data: { temp: true, mode: kind === 'copy' || kind === 'cut' ? kind : undefined } };
  }
  paste() {
    const p = G.game.player;
    if (!this.lastCopy) return;
    p.clearCursor();
    p.cursor = { id: 'blueprint', n: 1, data: { bp: this.lastCopy, temp: true } };
  }

  // ---- robots ----
  robotDied(rb: Robot) {
    rb.dead = true;
    G.game.world.removeUnit(rb);
    this.abort(rb);
    G.game.fx?.explosion(rb.x, rb.y, 0.4);
  }
  abort(rb: Robot) {
    const t = rb.task;
    if (!t) return;
    if (t.ghost && t.ghost.claimed === rb) t.ghost.claimed = null;
    if (t.ent) (t.ent as any)._deconBy = null;
    if (t.from instanceof Container && t.item && rb.state === 'toPickup') this.res(this.reservedOut, t.from, t.item, -(t.n || 1));
    if (t.to && t.item && (t.kind === 'deliver' || t.kind === 'player')) this.res(this.incoming, t.to as Entity, t.item, -(t.n || 1));
    if (t.kind === 'decon' && t.to instanceof Container) for (const c of rb.cargo) this.res(this.incoming, t.to, c.id, -c.n);
    rb.task = null;
  }
  launch(net: LogisticNetwork, kind: 'logistic' | 'construction', near: [number, number], task: Task): Robot | null {
    const port = net.nearestPort(near[0], near[1], kind);
    if (!port) return null;
    port.robots.remove(kind + '-robot', 1);
    const rb = new Robot(kind, port.x, port.y - 1);
    rb.home = port; rb.net = net;
    rb.energy = rb.maxEnergy * 0.95;
    this.robots.push(rb); net.robots.push(rb);
    G.game.world.addUnit(rb);
    this.assign(rb, task);
    return rb;
  }
  assign(rb: Robot, task: Task) {
    rb.task = task;
    rb.state = task.from && task.item ? 'toPickup' : 'toTarget';
  }
  dock(rb: Robot) {
    rb.dead = true;
    G.game.world.removeUnit(rb);
    if (rb.personal) { G.game.player.give('construction-robot', 1); for (const c of rb.cargo) G.game.player.give(c.id, c.n); return; }
    const port = rb.home && !rb.home.dead ? rb.home : rb.net?.nearestPort(rb.x, rb.y) || null;
    if (port && port.robots.insert(rb.kind + '-robot', 1)) { for (const c of rb.cargo) { G.game.spillItem(port.x, port.y + 2, c.id, c.n); } return; }
    G.game.spillItem(rb.x, rb.y, rb.kind + '-robot', 1);
  }

  updateRobot(rb: Robot) {
    const g = G.game;
    const t = rb.task;
    const p = g.player;
    if (rb.personal) {
      if (p.dead) { this.abort(rb); rb.state = 'return'; }
    } else if (!rb.home || rb.home.dead) { rb.home = rb.net?.nearestPort(rb.x, rb.y) || null; if (!rb.home) { this.abort(rb); this.dock(rb); return; } }
    switch (rb.state) {
      case 'toPickup': {
        if (!t || !t.from || (t.from as any).dead) { this.abort(rb); rb.state = 'return'; return; }
        if (!rb.flyTo(t.from.x, t.from.y - 0.3)) return;
        const id = t.item!, n = t.n || 1;
        let got = 0;
        if (t.from instanceof Container) { got = t.from.inv.remove(id, n); this.res(this.reservedOut, t.from, id, -n); }
        else if (t.from instanceof Character) got = p.take(id, n);
        if (got <= 0) { this.abort(rb); rb.state = 'return'; return; }
        rb.cargo = [{ id, n: got }];
        if (got < n && t.to && (t.kind === 'deliver' || t.kind === 'player')) this.res(this.incoming, t.to as Entity, id, got - n);
        t.n = got;
        rb.state = 'toTarget';
        return;
      }
      case 'toTarget': {
        if (!t) { rb.state = 'return'; return; }
        const target: Entity | null = t.kind === 'build' ? t.ghost! : t.kind === 'decon' || t.kind === 'repair' || t.kind === 'upgrade' ? t.ent! : (t.to as Entity);
        if (!target || target.dead) { this.abort(rb); rb.state = 'return'; return; }
        if (t.kind === 'player' && p.dead) { this.abort(rb); rb.state = 'return'; return; }
        if (!rb.flyTo(target.x, target.y - 0.2)) return;
        rb.state = 'working'; rb.workT = t.kind === 'repair' ? 0 : 20;
        return;
      }
      case 'working': {
        if (!t) { rb.state = 'return'; return; }
        if (t.kind === 'repair') {
          const e = t.ent!;
          if (e.dead || e.health >= e.maxHealth) { this.finishRepair(rb); return; }
          e.health = Math.min(e.maxHealth, e.health + 2);
          if (++rb.workT % 150 === 0 && Math.random() < 0.5) { /* uses repair pack durability */ }
          if (g.tick % 10 === 0) g.fx?.tracer(rb.x, rb.y - 1.4, e.x, e.y);
          return;
        }
        if (--rb.workT > 0) return;
        this.complete(rb);
        return;
      }
      case 'toDrop': {
        const to = t?.to as Container | Character | null;
        if (!to || (to as any).dead) {
          // find another storage
          const st = rb.net ? this.findStorage(rb.net, rb.cargo[0]?.id || '', [rb.x, rb.y]) : null;
          if (st && t) { t.to = st; for (const c of rb.cargo) this.res(this.incoming, st, c.id, c.n); return; }
          rb.state = 'return'; return;
        }
        if (!rb.flyTo(to.x, to.y - 0.3)) return;
        for (const c of rb.cargo) {
          let k = 0;
          if (to instanceof Container) { k = to.inv.insert(c.id, c.n); this.res(this.incoming, to, c.id, -c.n); }
          else if (to instanceof Character) k = p.give(c.id, c.n, false);
          c.n -= k;
        }
        rb.cargo = rb.cargo.filter(c => c.n > 0);
        rb.task = null;
        if (rb.cargo.length && rb.net) {
          const st = this.findStorage(rb.net, rb.cargo[0].id, [rb.x, rb.y]);
          if (st) { rb.task = { kind: 'decon', to: st }; for (const c of rb.cargo) this.res(this.incoming, st, c.id, c.n); return; }
        }
        rb.state = 'return';
        return;
      }
      case 'return': {
        if (rb.personal) {
          if (p.dead) { rb.dead = true; g.world.removeUnit(rb); return; }
          if (rb.flyTo(p.x, p.y - 0.5)) this.dock(rb);
          return;
        }
        const port = rb.home!;
        if (rb.flyTo(port.x, port.y - 1)) {
          if (rb.cargo.length) {
            // nowhere to put items: wait near port and retry
            const st = rb.net ? this.findStorage(rb.net, rb.cargo[0].id, [rb.x, rb.y]) : null;
            if (st) { rb.task = { kind: 'decon', to: st }; rb.state = 'toDrop'; for (const c of rb.cargo) this.res(this.incoming, st, c.id, c.n); }
            return;
          }
          if (rb.energy < rb.maxEnergy * 0.9) { rb.state = 'charging'; return; }
          this.dock(rb);
        }
        return;
      }
      case 'charging': {
        const port = rb.home!;
        if (port.chargeRobot(rb)) this.dock(rb);
        return;
      }
      case 'idle': rb.state = 'return'; return;
    }
  }
  finishRepair(rb: Robot) { rb.task = null; rb.state = 'return'; }
  complete(rb: Robot) {
    const g = G.game, p = g.player;
    const t = rb.task!;
    if (t.kind === 'build') {
      const gh = t.ghost!;
      if (gh.dead) { rb.state = 'return'; rb.task = null; return; }
      g.removeEntity(gh);
      const e = g.buildEntity(gh.target, gh.x, gh.y, gh.dir, { flags: gh.flags, returnOld: (id: string, n: number) => rb.cargo.push({ id, n }) } as any);
      if (typeof e === 'string') {
        // blocked (e.g. player standing there): put the ghost back and keep the item
        const ng = new Ghost(gh.target, gh.x, gh.y, gh.dir); ng.settings = gh.settings; ng.flags = gh.flags;
        g.world.addEntity(ng); this.ghosts.add(ng);
        rb.task = null; rb.state = 'return';
        return;
      }
      rb.cargo = rb.cargo.filter(c => c.id !== gh.item || (c.n -= 1) > 0);
      if (gh.settings) applySettings(e, gh.settings);
      g.stats.consume(gh.item, 0);
      rb.task = null;
      this.afterWork(rb);
      return;
    }
    if (t.kind === 'upgrade') {
      const e = t.ent!;
      if (e.dead) { rb.task = null; rb.state = 'return'; return; }
      const to = t.upgradeTo!;
      const st = captureSettings(e);
      const ne = g.buildEntity(to, e.x, e.y, e.dir, { returnOld: (id: string, n: number) => rb.cargo.push({ id, n }) } as any);
      if (typeof ne !== 'string') { rb.cargo = rb.cargo.filter(c => c.id !== ENTITIES[to].item || (c.n -= 1) > 0); if (st) applySettings(ne, st); }
      this.upgrades.delete(e);
      rb.task = null;
      this.afterWork(rb);
      return;
    }
    if (t.kind === 'decon') {
      const e = t.ent!;
      if (e.dead || !e.decon) { rb.task = null; rb.state = 'return'; return; }
      const items: Stack[] = [];
      if (e instanceof ItemOnGround) items.push({ id: e.item, n: 1 });
      else if ((e as any).minedItems) items.push(...(e as any).minedItems());
      else { if (e.proto.item) items.push({ id: e.proto.item, n: 1 }); items.push(...e.contents()); }
      this.decon.delete(e);
      g.removeEntity(e);
      if (e.type === 'tree') g.leaveStump(e);
      rb.cargo.push(...items.filter(s => s.n > 0));
      rb.task = null;
      this.afterWork(rb);
      return;
    }
    if (t.kind === 'deliver' || t.kind === 'player') {
      rb.state = 'toDrop';
      return;
    }
  }
  // after build/decon: deliver cargo (decon results / leftovers) or return
  afterWork(rb: Robot) {
    const p = G.game.player;
    if (!rb.cargo.length) { rb.state = 'return'; return; }
    if (rb.personal) { rb.task = { kind: 'decon', to: p.character }; rb.state = 'toDrop'; return; }
    const st = rb.net ? this.findStorage(rb.net, rb.cargo[0].id, [rb.x, rb.y]) : null;
    if (st) { rb.task = { kind: 'decon', to: st }; for (const c of rb.cargo) this.res(this.incoming, st, c.id, c.n); rb.state = 'toDrop'; return; }
    rb.state = 'return';
  }

  // ---- task dispatch ----
  personalStats() {
    const p = G.game.player;
    if (p.dead || !this.personalOn) return null;
    const eq = p.equipmentStats();
    if (!eq.robots) return null;
    const out = this.robots.filter(r => r.personal && !r.dead).length;
    const inv = p.main.count('construction-robot');
    return { area: eq.area, free: Math.min(eq.robots - out, inv) };
  }
  dispatch() {
    const g = G.game, p = g.player;
    let budget = 12;
    // ---- personal roboport ----
    const ps = this.personalStats();
    if (ps && ps.free > 0) {
      let free = ps.free;
      const inR = (e: Entity) => Math.abs(e.x - p.x) <= ps.area && Math.abs(e.y - p.y) <= ps.area;
      for (const gh of this.ghosts) {
        if (free <= 0 || budget <= 0) break;
        if (gh.claimed || gh.dead || !inR(gh) || !gh.item) continue;
        if (p.main.count(gh.item) <= 0) continue;
        p.main.remove(gh.item, 1);
        free--; budget--;
        this.launchPersonal({ kind: 'build', ghost: gh }, [{ id: gh.item, n: 1 }]);
      }
      for (const e of this.decon) {
        if (free <= 0 || budget <= 0) break;
        if (e.dead || (e as any)._deconBy || !inR(e)) continue;
        free--; budget--;
        this.launchPersonal({ kind: 'decon', ent: e }, []);
      }
      for (const e of this.upgrades) {
        if (free <= 0 || budget <= 0) break;
        const to = (e as any).upgradeTo; if (!to || e.dead || (e as any)._deconBy || !inR(e)) continue;
        const item = ENTITIES[to].item;
        if (p.main.count(item) <= 0) continue;
        p.main.remove(item, 1); free--; budget--;
        this.launchPersonal({ kind: 'upgrade', ent: e, upgradeTo: to }, [{ id: item, n: 1 }]);
      }
    }
    // ---- networks ----
    for (const net of this.networks) {
      if (budget <= 0) break;
      let con = net.available('construction');
      let log = net.available('logistic');
      // construction: ghosts
      if (con > 0) for (const gh of this.ghosts) {
        if (con <= 0 || budget <= 0) break;
        if (gh.claimed || gh.dead || !gh.item || !net.coversConstruction(gh.x, gh.y)) continue;
        if (gh.waiting > g.tick) continue;
        const prov = this.findProvider(net, gh.item, [gh.x, gh.y], false, true);
        if (!prov) { gh.waiting = g.tick + 120; continue; }
        this.res(this.reservedOut, prov, gh.item, 1);
        const rb = this.launch(net, 'construction', [prov.x, prov.y], { kind: 'build', ghost: gh, item: gh.item, n: 1, from: prov });
        if (!rb) { this.res(this.reservedOut, prov, gh.item, -1); break; }
        gh.claimed = rb; con--; budget--;
      }
      if (con > 0) for (const e of this.decon) {
        if (con <= 0 || budget <= 0) break;
        if (e.dead || (e as any)._deconBy || !net.coversConstruction(e.x, e.y)) continue;
        const rb = this.launch(net, 'construction', [e.x, e.y], { kind: 'decon', ent: e });
        if (!rb) break;
        (e as any)._deconBy = rb; con--; budget--;
      }
      if (con > 0) for (const e of this.upgrades) {
        if (con <= 0 || budget <= 0) break;
        const to = (e as any).upgradeTo; if (!to || e.dead || (e as any)._deconBy || !net.coversConstruction(e.x, e.y)) continue;
        const item = ENTITIES[to].item;
        const prov = this.findProvider(net, item, [e.x, e.y], false, true);
        if (!prov) continue;
        this.res(this.reservedOut, prov, item, 1);
        const rb = this.launch(net, 'construction', [prov.x, prov.y], { kind: 'upgrade', ent: e, upgradeTo: to, item, n: 1, from: prov });
        if (!rb) { this.res(this.reservedOut, prov, item, -1); break; }
        (e as any)._deconBy = rb; con--; budget--;
      }
      // repairs
      if (con > 0 && g.tick % 60 === 0) {
        const hasPacks = net.roboports.some(r => r.repair.count('repair-pack') > 0);
        if (hasPacks) for (const r of net.roboports) {
          if (con <= 0 || budget <= 0) break;
          const dmg = g.world.entitiesIn(r.x - CONS_R, r.y - CONS_R, r.x + CONS_R, r.y + CONS_R, e => e.isBuilding && e.health < e.maxHealth && !(e as any)._repairBy && g.tick - e.lastHit > 60, 6);
          for (const e of dmg.slice(0, 2)) {
            const rb = this.launch(net, 'construction', [e.x, e.y], { kind: 'repair', ent: e });
            if (!rb) break;
            (e as any)._repairBy = rb; con--; budget--;
            const pk = net.roboports.find(q => q.repair.count('repair-pack') > 0);
            if (pk && Math.random() < 0.2) pk.repair.remove('repair-pack', 1);
          }
        }
      }
      // logistics: requesters / buffers
      if (log > 0) for (const c of net.chests) {
        if (log <= 0 || budget <= 0) break;
        if (c.logistic !== 'requester' && c.logistic !== 'buffer') continue;
        for (const q of c.requests) {
          if (log <= 0 || budget <= 0) break;
          if (!q || !q.id || !q.n) continue;
          const deficit = q.n - c.inv.count(q.id) - this.incomingTo(c, q.id);
          if (deficit <= 0) continue;
          const space = c.inv.space(q.id) - this.incomingTo(c, q.id);
          if (space <= 0) continue;
          const prov = this.findProvider(net, q.id, [c.x, c.y], true, c.logistic === 'requester' && c.requestFromBuffers);
          if (!prov || prov === c) continue;
          if (c.logistic === 'buffer' && prov.logistic === 'buffer') continue;
          const n = Math.min(deficit, space, this.availableIn(prov, q.id), 1 + g.bonus.robotCargo);
          this.res(this.reservedOut, prov, q.id, n);
          this.res(this.incoming, c, q.id, n);
          const rb = this.launch(net, 'logistic', [prov.x, prov.y], { kind: 'deliver', item: q.id, n, from: prov, to: c });
          if (!rb) { this.res(this.reservedOut, prov, q.id, -n); this.res(this.incoming, c, q.id, -n); break; }
          log--; budget--;
        }
      }
      // active providers push into storage
      if (log > 0) for (const c of net.chests) {
        if (log <= 0 || budget <= 0) break;
        if (c.logistic !== 'active-provider') continue;
        const id = c.inv.firstItem(i => this.availableIn(c, i) > 0);
        if (!id) continue;
        const st = this.findStorage(net, id, [c.x, c.y]);
        if (!st) continue;
        const n = Math.min(this.availableIn(c, id), 1 + g.bonus.robotCargo, st.inv.space(id));
        this.res(this.reservedOut, c, id, n); this.res(this.incoming, st, id, n);
        const rb = this.launch(net, 'logistic', [c.x, c.y], { kind: 'deliver', item: id, n, from: c, to: st });
        if (!rb) { this.res(this.reservedOut, c, id, -n); this.res(this.incoming, st, id, -n); break; }
        log--; budget--;
      }
      // player requests & trash
      if (log > 0 && !p.dead && p.personalLogistics && net.coversLogistic(p.x, p.y)) {
        const ch = p.character;
        for (const q of p.logisticRequests) {
          if (log <= 0 || budget <= 0) break;
          if (!q.id || !q.min) continue;
          const deficit = q.min - p.count(q.id) - this.incomingTo(ch, q.id);
          if (deficit <= 0) continue;
          const prov = this.findProvider(net, q.id, [p.x, p.y], false, true);
          if (!prov) continue;
          const n = Math.min(deficit, this.availableIn(prov, q.id), 1 + g.bonus.robotCargo);
          this.res(this.reservedOut, prov, q.id, n); this.res(this.incoming, ch, q.id, n);
          const rb = this.launch(net, 'logistic', [prov.x, prov.y], { kind: 'player', item: q.id, n, from: prov, to: ch });
          if (!rb) { this.res(this.reservedOut, prov, q.id, -n); this.res(this.incoming, ch, q.id, -n); break; }
          log--; budget--;
        }
        // auto-trash above max + trash slots
        for (const q of p.logisticRequests) {
          if (q.max !== undefined && q.max >= 0 && q.max < 1e9) { const over = p.main.count(q.id) - q.max; if (over > 0) { const k = p.main.remove(q.id, over); p.trash.insert(q.id, k); } }
        }
        for (let i = 0; i < p.trash.slots.length && log > 0 && budget > 0; i++) {
          const s = p.trash.slots[i]; if (!s) continue;
          const st = this.findStorage(net, s.id, [p.x, p.y]); if (!st) continue;
          const n = Math.min(s.n, 1 + g.bonus.robotCargo, st.inv.space(s.id));
          // robot picks directly from trash (instant pickup at player)
          const rb = this.launch(net, 'logistic', [p.x, p.y], { kind: 'decon', to: st });
          if (!rb) break;
          s.n -= n; if (s.n <= 0) p.trash.slots[i] = null; p.trash.changed();
          rb.cargo = [{ id: s.id, n }]; rb.state = 'toDrop';
          this.res(this.incoming, st, s.id, n);
          (rb as any)._viaPlayer = true;
          log--; budget--;
        }
      }
    }
  }
  launchPersonal(task: Task, cargo: Stack[]) {
    const g = G.game, p = g.player;
    p.main.remove('construction-robot', 1);
    const rb = new Robot('construction', p.x, p.y - 0.5);
    rb.personal = true;
    rb.cargo = cargo;
    this.robots.push(rb);
    g.world.addUnit(rb);
    rb.task = task;
    if (task.ghost) task.ghost.claimed = rb;
    if (task.ent) (task.ent as any)._deconBy = rb;
    rb.state = 'toTarget';
  }

  tick() {
    const g = G.game;
    if (this.dirty) this.rebuild();
    if (g.tick % 6 === 0) this.dispatch();
    // robots
    let j = 0;
    for (const rb of this.robots) {
      if (rb.dead) continue;
      this.updateRobot(rb);
      if (!rb.dead) this.robots[j++] = rb;
    }
    this.robots.length = j;
    // clear repair claims
    if (g.tick % 60 === 0) {
      for (const n of this.networks) n.robots = n.robots.filter(r => !r.dead);
      for (const gh of this.ghosts) if (gh.claimed && gh.claimed.dead) gh.claimed = null;
      for (const e of this.decon) if ((e as any)._deconBy?.dead) (e as any)._deconBy = null;
      for (const e of this.upgrades) if ((e as any)._deconBy?.dead) (e as any)._deconBy = null;
    }
    for (const rb of this.robots) if (rb.task?.kind === 'repair' && rb.task.ent && (rb.task.ent.health >= rb.task.ent.maxHealth || rb.task.ent.dead)) { (rb.task.ent as any)._repairBy = null; }
  }

  // draw logistic/construction areas when holding roboport-related items
  drawAreas(r: Renderer, x0: number, y0: number, x1: number, y1: number) {
    const a = r.atlas;
    for (const n of this.networks) for (const p of n.roboports) {
      if (p.x < x0 - CONS_R || p.x > x1 + CONS_R || p.y < y0 - CONS_R || p.y > y1 + CONS_R) continue;
      r.drawRect('overlay', a.get('white'), p.x, p.y, CONS_R * 2, CONS_R * 2, rgba(0.2, 0.9, 0.3, 0.06));
      r.drawRect('overlay', a.get('white'), p.x, p.y, LOGI_R * 2, LOGI_R * 2, rgba(1, 0.75, 0.2, 0.1));
    }
  }

  // ---- requester GUI ----
  buildRequestGUI(win: any, P: HTMLElement, e: Container) {
    const ui = win.ui;
    h('div', 'subtitle', P, 'Logistic requests');
    const grid = h('div', 'grid', P);
    grid.style.gridTemplateColumns = 'repeat(10, var(--slot))';
    const slots: HTMLDivElement[] = [];
    const n = 10;
    const editor = h('div', 'row hidden', P);
    const inp = h('input', '', editor) as HTMLInputElement; inp.type = 'number'; inp.min = '0'; inp.style.width = '90px';
    const okb = h('div', 'btn small', editor, 'Set');
    let editIdx = -1;
    okb.onclick = () => { if (editIdx >= 0 && e.requests[editIdx]) e.requests[editIdx].n = Math.max(0, parseInt(inp.value || '0', 10)); editor.classList.add('hidden'); };
    for (let i = 0; i < n; i++) {
      const s = ui.slot(grid, {
        onLeft: () => {
          const q = e.requests[i];
          const cur = ui.g.player.cursor;
          if (cur) { e.requests[i] = { id: cur.id, n: stackSize(cur.id) }; return; }
          if (!q) ui.pickItem((id: string) => { e.requests[i] = { id, n: stackSize(id) }; });
          else { editIdx = i; inp.value = String(q.n); editor.classList.remove('hidden'); inp.focus(); }
        },
        onRight: () => { e.requests[i] = null as any; },
        tooltip: () => { const q = e.requests[i]; return q ? `<div class="tt-title">${itemName(q.id)}</div><div class="tt-body">Request ${q.n}</div>` : '<div class="tt-title">Set request</div>'; },
      });
      slots.push(s);
    }
    if (e.logistic === 'requester') {
      const cb = h('label', 'row mini-label', P);
      const c = h('input', '', cb) as HTMLInputElement; c.type = 'checkbox'; c.checked = e.requestFromBuffers;
      c.onchange = () => e.requestFromBuffers = c.checked;
      cb.append(' Request from buffer chests');
    }
    win.updaters.push(() => {
      for (let i = 0; i < n; i++) { const q = e.requests[i]; ui.setSlot(slots[i], null, q?.id || null, q ? String(q.n) : ''); }
    });
  }

  serialize() { return { fly: this.robots.filter(r => !r.dead).map(r => [r.kind, r.personal ? -1 : r.home?.id ?? 0, r.cargo]), lc: this.lastCopy, po: this.personalOn, up: [...this.upgrades].filter(e => !e.dead).map(e => [e.id, (e as any).upgradeTo]) }; }
  load(d: any) {
    if (!d) return;
    this.lastCopy = d.lc || null; this.personalOn = d.po !== false;
    const g = G.game;
    for (const e of g.world.entities.values()) if (e.decon) this.decon.add(e);
    for (const [id, to] of d.up || []) { const e = g.world.entities.get(id); if (e) this.markUpgrade(e, to); }
    // robots that were flying are returned to their roboport (or the player) as items
    for (const [kind, home, cargo] of d.fly || []) {
      const port = home > 0 ? g.world.entities.get(home) as Roboport | undefined : undefined;
      if (home === -1) g.player.give(kind + '-robot', 1);
      else if (port && port.robots) port.robots.insert(kind + '-robot', 1);
      else g.spillItem(g.player.x, g.player.y, kind + '-robot', 1);
      for (const c of cargo || []) g.spillItem(port ? port.x : g.player.x, port ? port.y + 2 : g.player.y, c.id, c.n);
    }
  }
}
function UPGRADES_ANY(from: string, to: string) {
  let x = UPGRADES[from]; const seen = new Set<string>();
  while (x && !seen.has(x)) { if (x === to) return true; seen.add(x); x = UPGRADES[x]; }
  // downgrade also allowed within groups
  x = UPGRADES[to];
  while (x && !seen.has(x + '!')) { if (x === from) return true; seen.add(x + '!'); x = UPGRADES[x]; }
  return false;
}
void TECHS; void entityForItem; void DIRS; void clamp; void Inventory;
