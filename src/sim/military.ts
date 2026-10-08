// Combat: turrets, projectiles, ground effects (fire/acid/poison), player weapons, capsules,
// combat robots, land mines and vehicles (car, tank).
import { Entity, PHASE, Burner, registerEntity } from './entity';
import { Inventory, Stack } from './inventory';
import { G, Dir, DIRS, clamp } from '../core';
import { ITEMS, AmmoInfo, itemName } from '../data/protos';
import type { Renderer } from '../engine/renderer';
import { WHITE, rgba, additive } from '../engine/renderer';
import { FluidBox } from './fluids';
import { Character, faceTo } from './player';
import { isWaterTile } from '../world/tiles';
import { h } from '../util/dom';

const TAU = Math.PI * 2;
const angDiff = (a: number, b: number) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// ---------------- bonuses ----------------
export function dmgMult(cat: string, turret?: string) {
  const b = G.game.bonus;
  return 1 + (b.ammoDamage[cat] || 0) + (turret ? (b.turretDamage[turret] || 0) : 0);
}
export function speedMult(cat: string) { return 1 + (G.game.bonus.gunSpeed[cat] || 0); }

// ---------------- target helpers ----------------
export function isHostile(e: Entity) { return !!(e as any).isEnemyUnit || !!(e as any).enemyBase; }
export function isFriendly(e: Entity) { return e instanceof Character || e.isBuilding || !!(e as any).isFriendlyUnit || !!(e as any).isVehicle; }

// Nearest enemy (unit, spawner or worm) within [minR, r] of (x,y)
export function findEnemy(x: number, y: number, r: number, minR = 0, structuresOnly = false): Entity | null {
  const en = G.game.enemies;
  if (!en) return null;
  let best: Entity | null = null, bd = r * r;
  const mr2 = minR * minR;
  if (!structuresOnly) for (const u of en.units) {
    if (u.dead) continue;
    const d = (u.x - x) ** 2 + (u.y - y) ** 2;
    if (d < bd && d >= mr2) { bd = d; best = u; }
  }
  for (const b of en.bases) {
    if (Math.abs(b.x - x) > r + 40 || Math.abs(b.y - y) > r + 40) continue;
    for (const s of b.spawners) if (!s.dead) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd && d >= mr2) { bd = d; best = s; } }
    for (const s of b.worms) if (!s.dead) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd && d >= mr2) { bd = d; best = s; } }
  }
  return best;
}
function enemiesNear(x: number, y: number, r: number): Entity[] {
  const en = G.game.enemies;
  const out: Entity[] = [];
  if (!en) return out;
  const r2 = r * r;
  for (const u of en.units) if (!u.dead && (u.x - x) ** 2 + (u.y - y) ** 2 <= r2) out.push(u);
  for (const b of en.bases) {
    if (Math.abs(b.x - x) > r + 40 || Math.abs(b.y - y) > r + 40) continue;
    for (const s of [...b.spawners, ...b.worms]) if (!s.dead && (s.x - x) ** 2 + (s.y - y) ** 2 <= (r + s.w / 2) ** 2) out.push(s);
  }
  return out;
}
// Friendly things near a point (for enemy acid / atomic blasts)
function friendliesNear(x: number, y: number, r: number): Entity[] {
  const g = G.game;
  const out: Entity[] = g.world.entitiesIn(x - r, y - r, x + r, y + r, e => e.isBuilding && !e.dead, 6)
    .filter(e => Math.hypot(e.x - x, e.y - y) <= r + Math.max(e.w, e.h) / 2);
  for (const u of g.world.units) if (isFriendly(u) && !u.dead && !(u instanceof Character && u.vehicle) && Math.hypot(u.x - x, u.y - y) <= r + 0.3) out.push(u);
  return out;
}
export function areaDamage(x: number, y: number, r: number, amount: number, type: string, source: any, opts: { friendly?: boolean; enemies?: boolean; trees?: boolean; falloff?: boolean } = {}) {
  const g = G.game;
  const hit = (e: Entity) => {
    const d = Math.hypot(e.x - x, e.y - y);
    const k = opts.falloff ? clamp(1 - d / (r + 0.5), 0.2, 1) : 1;
    e.damage(amount * k, type, source);
  };
  if (opts.enemies !== false) for (const e of enemiesNear(x, y, r)) hit(e);
  if (opts.friendly) for (const e of friendliesNear(x, y, r)) hit(e);
  if (opts.trees !== false) {
    for (const t of g.world.entitiesIn(x - r, y - r, x + r, y + r, e => e.type === 'tree' && !e.dead, 1)) {
      if (Math.hypot(t.x - x, t.y - y) <= r) hit(t);
    }
  }
}

// ---------------- projectiles & ground effects ----------------
type ProjKind = 'rocket' | 'grenade' | 'cluster' | 'shell' | 'acid' | 'artillery' | 'flame' | 'poison' | 'slowdown' | 'capsule';
interface Proj {
  kind: ProjKind; x: number; y: number; sx: number; sy: number; tx: number; ty: number; t: number; T: number; arc: number;
  target?: Entity | null; ammo?: string; damage: number; dtype: string; source: any; size: number; slow?: number; puddle?: number; mult?: number; capsule?: string;
}
type CloudKind = 'acid' | 'fire' | 'poison' | 'slowdown';
interface Cloud { kind: CloudKind; x: number; y: number; r: number; t: number; life: number; dmg: number; slow?: number; source: any; seed: number; }

// ---------------- combat robots ----------------
const ROBOTS: Record<string, { hp: number; life: number; damage: number; dtype: string; range: number; cooldown: number; speed: number; follow: boolean; beam: string }> = {
  defender: { hp: 60, life: 60 * 45, damage: 8, dtype: 'physical', range: 15, cooldown: 20, speed: 0.2, follow: true, beam: 'tracer' },
  distractor: { hp: 90, life: 60 * 45, damage: 20, dtype: 'laser', range: 14, cooldown: 20, speed: 0, follow: false, beam: 'laser' },
  destroyer: { hp: 60, life: 60 * 60 * 2, damage: 10, dtype: 'electric', range: 15, cooldown: 20, speed: 0.2, follow: true, beam: 'electric' },
};
export class CombatRobot extends Entity {
  kind: string;
  life: number;
  cooldown = 0;
  orbit = Math.random() * TAU;
  target: Entity | null = null;
  isFriendlyUnit = true;
  noSave = true;
  hover = Math.random() * 6;
  constructor(kind: string, x: number, y: number) {
    super('combat-robot', x, y, 0);
    this.kind = kind; this.w = this.h = 0.6;
    const d = ROBOTS[kind];
    this.health = d.hp; this.life = d.life;
  }
  get maxHealth() { return ROBOTS[this.kind].hp; }
  get isBuilding() { return false; }
  get minable() { return false; }
  get blocksMovement() { return false; }
  get selectable() { return false; }
  damage(amount: number, type = 'physical', source?: any) {
    this.health -= amount; this.lastHit = G.game.tick;
    if (this.health <= 0 && !this.dead) { this.dead = true; G.game.world.removeUnit(this); G.game.fx?.explosion(this.x, this.y, 0.4); }
    return amount;
  }
  update() {
    const g = G.game, d = ROBOTS[this.kind];
    if (--this.life <= 0) { this.dead = true; g.world.removeUnit(this); g.fx?.smoke(this.x, this.y, 0.5); return; }
    if (this.cooldown > 0) this.cooldown--;
    if ((g.tick + this.id) % 10 === 0 && (!this.target || this.target.dead || Math.hypot(this.target.x - this.x, this.target.y - this.y) > d.range)) this.target = findEnemy(this.x, this.y, d.range);
    if (d.follow) {
      const ch = g.player.character;
      const k = g.combat.robots.indexOf(this);
      this.orbit += 0.02;
      const n = Math.max(1, g.combat.robots.filter((r: CombatRobot) => ROBOTS[r.kind].follow).length);
      const a = this.orbit + k / n * TAU;
      const rr = 1.8 + (k % 3) * 0.4;
      const tx = ch.x + Math.cos(a) * rr, ty = ch.y + Math.sin(a) * rr - 0.5;
      const dx = tx - this.x, dy = ty - this.y, dist = Math.hypot(dx, dy);
      const sp = Math.min(dist, d.speed + dist * 0.05);
      if (dist > 0.01) { this.x += dx / dist * sp; this.y += dy / dist * sp; }
    }
    if (this.target && this.cooldown <= 0) {
      this.cooldown = d.cooldown;
      const t = this.target;
      const cat = this.kind === 'defender' ? 'bullet' : this.kind === 'distractor' ? 'laser' : 'electric';
      t.damage(d.damage * dmgMult(cat), d.dtype, this);
      if (d.beam === 'laser') g.fx?.laser(this.x, this.y - 1, t.x, t.y);
      else if (d.beam === 'electric') { g.fx?.laser(this.x, this.y - 1, t.x, t.y); }
      else { g.fx?.tracer(this.x, this.y - 1, t.x, t.y); g.fx?.muzzle(this.x, this.y - 1); }
      if (Math.random() < 0.3) g.sound.play(d.beam === 'tracer' ? 'turret' : 'laser', 0.25, this.x, this.y);
    }
  }
  draw(r: Renderer) {
    const a = r.atlas;
    const bob = Math.sin(G.game.renderTime * 3 + this.hover) * 0.08;
    r.draw('airShadow', a.get(this.kind + '-fly'), this.x + 0.8, this.y + 0.4, rgba(0, 0, 0, 0.35), 0, 1.1);
    r.draw('air', a.get(this.kind + '-fly'), this.x, this.y - 1 + bob, WHITE, 0, 1.15, 1e6);
    if (this.kind === 'destroyer' || this.kind === 'distractor') r.draw('light', a.get('light'), this.x, this.y - 1, additive(1, 0.4, 0.3, 0.5), 0, 2);
  }
}

// ---------------- Turrets ----------------
export class Turret extends Entity {
  angle = Math.PI / 2;     // radians, 0 = east
  target: Entity | null = null;
  cooldown = 0;
  shotFlash = 0;
  kills = 0;
  get phase() { return PHASE.COMBAT; }
  get turnRate() { return 0.015 * TAU; }
  get range() { return this.proto.range || 18; }
  get minRange() { return this.proto.minRange || 0; }
  canAim(a: number) { return true; }
  acquire() {
    const t = this.target;
    const r = this.range;
    if (t && !t.dead) {
      const d = Math.hypot(t.x - this.x, t.y - this.y);
      if (d <= r && d >= this.minRange && this.canAim(Math.atan2(t.y - this.y, t.x - this.x))) return;
    }
    this.target = null;
    if ((G.game.tick + this.id) % 8 !== 0) return;
    const n = findEnemy(this.x, this.y, r, this.minRange);
    if (n && this.canAim(Math.atan2(n.y - this.y, n.x - this.x))) this.target = n;
  }
  aim(): boolean {
    const t = this.target!;
    const want = Math.atan2(t.y - this.y, t.x - this.x);
    const d = angDiff(this.angle, want);
    const rate = this.turnRate;
    if (Math.abs(d) <= rate) { this.angle = want; return true; }
    this.angle += Math.sign(d) * rate;
    return Math.abs(d) < 0.1;
  }
  muzzlePos(len = 1.1): [number, number] { return [this.x + Math.cos(this.angle) * len, this.y - 0.6 + Math.sin(this.angle) * len * 0.8]; }
  drawTurret(r: Renderer, base: string, head: string, headScale = 1, headY = -0.55) {
    const a = r.atlas;
    r.draw('objects', a.get(base), this.x, this.y, WHITE, 0, 1, this.y + 0.2);
    r.draw('shadow', a.get(base + '-shadow'), this.x, this.y);
    r.draw('objects', a.get(head), this.x, this.y + headY, WHITE, this.angle, headScale, this.y + 0.25);
    r.draw('shadow', a.get(head), this.x + 0.5, this.y + 0.3, rgba(0, 0, 0, 0.35), this.angle, headScale);
  }
  description() { return [`Range: ${this.range}`, `Kills: ${this.kills}`]; }
}

export class AmmoTurret extends Turret {
  inv = new Inventory(1);
  rounds = 0;
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    (this.inv as any).accepts = (id: string) => this.isAmmo(id);
  }
  get ammoCat() { return this.proto.turretAmmo || 'bullet'; }
  inventories() { return [this.inv]; }
  isAmmo(id: string) { return ITEMS[id]?.ammo?.cat === this.ammoCat; }
  wants(id: string) {
    if (!this.isAmmo(id)) return 0;
    const cur = this.inv.slots[0];
    if (cur && cur.id !== id) return 0;
    return Math.max(0, 10 - (cur?.n || 0));
  }
  insertItem(id: string, n: number, src = 'inserter') {
    if (!this.isAmmo(id)) return 0;
    if (src === 'inserter') n = Math.min(n, this.wants(id));
    return this.inv.insert(id, n);
  }
  update() {
    if (this.cooldown > 0) this.cooldown--;
    if (this.shotFlash > 0) this.shotFlash--;
    const s = this.inv.slots[0];
    this.warnIcon = !s && this.rounds <= 0 ? 'warn-no-ammo' : null;
    this.status = this.warnIcon ? 'no-ammo' : this.target ? 'working' : 'idle';
    this.acquire();
    if (!this.target) return;
    if (!this.aim() || this.cooldown > 0) return;
    if (this.rounds <= 0) {
      if (!s) return;
      this.rounds = ITEMS[s.id].ammo!.magazine;
      (this as any).curAmmo = s.id;
      this.inv.remove(s.id, 1);
      G.game.stats.consume(s.id, 1);
    }
    const ammo = ITEMS[(this as any).curAmmo || s?.id || 'firearm-magazine'].ammo!;
    this.rounds--;
    const g = G.game;
    this.cooldown = Math.max(1, Math.round(60 / ((this.proto.rate || 10) * speedMult(this.ammoCat))));
    const t = this.target;
    const dealt = t.damage(ammo.damage * dmgMult(this.ammoCat, this.name), ammo.dtype, this);
    void dealt;
    if (t.dead) { this.kills++; this.target = null; }
    const [mx, my] = this.muzzlePos(1.25);
    g.fx?.tracer(mx, my, t.x + (Math.random() - 0.5) * 0.3, t.y - 0.3 + (Math.random() - 0.5) * 0.3);
    g.fx?.muzzle(mx, my);
    this.shotFlash = 2;
    if ((g.tick & 3) === 0) g.sound.play('turret', 0.5, this.x, this.y);
  }
  draw(r: Renderer) { this.drawTurret(r, 'gun-turret-base', 'gun-turret-head'); }
  serialize() { return { i: this.inv.serialize(), r: this.rounds, a: this.angle, k: this.kills, ca: (this as any).curAmmo }; }
  load(d: any) { this.inv.load(d.i); this.rounds = d.r || 0; this.angle = d.a ?? this.angle; this.kills = d.k || 0; (this as any).curAmmo = d.ca; }
  buildGUI(win: any, P: HTMLElement) {
    win.status(P);
    const row = h('div', 'row', P); h('div', 'label', row, 'Ammo');
    win.invGrid(row, () => this.inv, 1);
    const k = h('div', 'mini-label', P);
    win.updaters.push(() => k.textContent = `Range ${this.range} · Kills ${this.kills}`);
  }
}

export class ElectricTurret extends Turret {
  buffer = 0;
  get turnRate() { return 0.01 * TAU; }
  onPlaced() { G.game.power.addElectric(this); }
  onRemoved() { G.game.power.removeElectric(this); }
  update() {
    const g = G.game;
    if (this.cooldown > 0) this.cooldown--;
    // energy: last tick's request satisfied by this.power
    this.buffer = Math.min(801e3, this.buffer + ((this as any)._req || 0) * this.power);
    const need = Math.min(9.6e6 / 60, 801e3 - this.buffer);
    (this as any)._req = need;
    this.demand = 24e3 / 60 + need;
    this.warnIcon = !this.elecNet || this.power <= 0 ? 'warn-no-power' : null;
    this.status = this.warnIcon ? 'no-power' : this.target ? 'working' : 'idle';
    this.acquire();
    if (!this.target) return;
    if (!this.aim() || this.cooldown > 0 || this.buffer < 800e3) return;
    this.buffer -= 800e3;
    this.cooldown = Math.round(40 / speedMult('laser'));
    const t = this.target;
    t.damage(20 * dmgMult('laser'), 'laser', this);
    if (t.dead) { this.kills++; this.target = null; }
    const [mx, my] = this.muzzlePos(1.3);
    g.fx?.laser(mx, my, t.x, t.y - 0.3);
    g.sound.play('laser', 0.35, this.x, this.y);
  }
  draw(r: Renderer) {
    this.drawTurret(r, 'laser-turret-base', 'laser-turret-head');
    if (this.target) { const [mx, my] = this.muzzlePos(1.3); r.draw('light', r.atlas.get('light'), mx, my, additive(1, 0.3, 0.2, 0.6), 0, 2); }
  }
  serialize() { return { b: this.buffer, a: this.angle, k: this.kills }; }
  load(d: any) { this.buffer = d.b || 0; this.angle = d.a ?? this.angle; this.kills = d.k || 0; }
  buildGUI(win: any, P: HTMLElement) {
    win.status(P); win.powerInfo(P);
    win.progress(P, () => this.buffer / 801e3, () => `Charge ${Math.round(this.buffer / 1e3)} kJ`, 'blue');
    const k = h('div', 'mini-label', P);
    win.updaters.push(() => k.textContent = `Range ${this.range} · Kills ${this.kills}`);
  }
}

const FLAME_FLUIDS: Record<string, number> = { 'crude-oil': 1, 'heavy-oil': 1.05, 'light-oil': 1.1, 'petroleum-gas': 1.15 };
export class FluidTurret extends Turret {
  fluidBoxes: FluidBox[];
  shooting = 0;
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.fluidBoxes = this.proto.fluidBoxes!.map((fb, i) => new FluidBox(this, fb, i));
    this.angle = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][d];
  }
  get facing() { return [-Math.PI / 2, 0, Math.PI / 2, Math.PI][this.dir]; }
  canAim(a: number) { return Math.abs(angDiff(this.facing, a)) <= Math.PI / 3 + 0.01; }
  onPlaced() { G.game.fluids.add(this); }
  onRemoved() { G.game.fluids.remove(this); }
  update() {
    const g = G.game;
    if (this.cooldown > 0) this.cooldown--;
    if (this.shooting > 0) this.shooting--;
    const seg = this.fluidBoxes[0].segment;
    const fl = seg?.fluid && FLAME_FLUIDS[seg.fluid] ? seg.fluid : null;
    this.warnIcon = !fl || seg!.amount < 0.2 ? 'warn-no-ammo' : null;
    this.status = this.warnIcon ? 'no-fluid' : this.target ? 'working' : 'idle';
    this.acquire();
    if (!this.target) { this.angle += angDiff(this.angle, this.facing) * 0.02; return; }
    if (!this.aim() || !fl || seg!.amount < 0.2) return;
    if (this.cooldown > 0) return;
    this.cooldown = 3;
    seg!.take(0.6);
    this.shooting = 6;
    const t = this.target;
    const [mx, my] = this.muzzlePos(1.2);
    g.combat.launch({ kind: 'flame', x: mx, y: my, sx: mx, sy: my, tx: t.x + (Math.random() - 0.5) * 0.8, ty: t.y + (Math.random() - 0.5) * 0.8, t: 0, T: Math.max(8, Math.hypot(t.x - mx, t.y - my) / 0.6), arc: 1.2, damage: 4 * FLAME_FLUIDS[fl] * dmgMult('flamethrower', 'flamethrower-turret'), dtype: 'fire', source: this, size: 1.4 });
    if ((g.tick & 7) === 0) g.sound.play('acid', 0.3, this.x, this.y);
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('objects', a.get(`flamethrower-turret-${this.dir}`), this.x, this.y, WHITE, 0, 1, this.y + 0.3);
    r.draw('shadow', a.get(`flamethrower-turret-${this.dir}-shadow`), this.x, this.y);
    r.draw('objects', a.get('flamethrower-turret-head'), this.x, this.y - 0.6, WHITE, this.angle, 1, this.y + 0.35);
    if (this.shooting) { const [mx, my] = this.muzzlePos(1.1); r.draw('light', a.get('light'), mx, my, additive(1, 0.6, 0.2, 0.8), 0, 5); }
  }
  serialize() { return { a: this.angle, k: this.kills }; }
  load(d: any) { this.angle = d.a ?? this.angle; this.kills = d.k || 0; }
}

export class ArtilleryTurret extends AmmoTurret {
  manualTargets: [number, number][] = [];
  get ammoCat() { return 'artillery'; }
  get turnRate() { return 0.001 * TAU * 2; }
  get range() { return 224 * (1 + G.game.bonus.artilleryRange); }
  wants(id: string) { if (!this.isAmmo(id)) return 0; return Math.max(0, 5 - (this.inv.slots[0]?.n || 0)); }
  acquire() {
    const t = this.target;
    if (t && !t.dead) return;
    this.target = null;
    if ((G.game.tick + this.id) % 60 !== 0) return;
    const n = findEnemy(this.x, this.y, this.range, this.minRange, true);
    if (n) this.target = n;
  }
  update() {
    if (this.cooldown > 0) this.cooldown--;
    const s = this.inv.slots[0];
    this.warnIcon = !s ? 'warn-no-ammo' : null;
    this.status = this.warnIcon ? 'no-ammo' : 'working';
    this.acquire();
    if (!this.target || !s) return;
    if (!this.aim() || this.cooldown > 0) return;
    this.inv.remove(s.id, 1);
    G.game.stats.consume(s.id, 1);
    this.cooldown = Math.max(1, Math.round(200 / speedMult('artillery')));
    const t = this.target;
    const g = G.game;
    const [mx, my] = this.muzzlePos(2);
    const d = Math.hypot(t.x - mx, t.y - my);
    g.combat.launch({ kind: 'artillery', x: mx, y: my, sx: mx, sy: my, tx: t.x, ty: t.y, t: 0, T: Math.max(60, d / 1.0), arc: Math.min(40, d * 0.25), damage: 1000 * dmgMult('artillery-shell'), dtype: 'explosion', source: this, size: 4 });
    g.fx?.muzzle(mx, my); g.fx?.explosion(mx, my, 0.6);
    g.sound.play('explosion', 0.9, this.x, this.y);
    this.target = null;
  }
  draw(r: Renderer) { this.drawTurret(r, 'artillery-turret-base', 'artillery-turret-head', 1, -0.9); }
}

// ---------------- Land mine ----------------
export class LandMine extends Entity {
  armed = 120;
  get phase() { return PHASE.COMBAT; }
  get blocksMovement() { return false; }
  update() {
    if (this.armed > 0) { this.armed--; return; }
    const g = G.game;
    if ((g.tick + this.id) % 6 !== 0) return;
    const en = g.enemies;
    if (!en) return;
    for (const u of en.units) {
      if (u.dead) continue;
      if (Math.abs(u.x - this.x) < 1.3 && Math.abs(u.y - this.y) < 1.3) { this.explode(); return; }
    }
  }
  explode() {
    const g = G.game;
    const m = dmgMult('landmine');
    areaDamage(this.x, this.y, 6, 250 * m, 'explosion', this, { trees: false });
    for (const u of enemiesNear(this.x, this.y, 6)) (u as any).slow = Math.max((u as any).slow || 0, 180);
    g.fx?.explosion(this.x, this.y, 1.6);
    g.sound.play('explosion', 0.9, this.x, this.y);
    g.removeEntity(this);
  }
  draw(r: Renderer) {
    const a = r.atlas;
    r.draw('ground2', a.get('land-mine'), this.x, this.y, this.armed > 0 ? rgba(1, 1, 1, 0.6) : WHITE, 0, 0.8);
  }
  serialize() { return { a: this.armed }; }
  load(d: any) { this.armed = d.a ?? 120; }
}

// ---------------- Vehicles ----------------
const VEH: Record<string, { maxSpeed: number; accel: number; turn: number; friction: number; fuelSlots: number; guns: string[]; power: number; weight: number; impact: number }> = {
  car: { maxSpeed: 0.62, accel: 0.0045, turn: 0.015 * TAU, friction: 0.0028, fuelSlots: 1, guns: ['vehicle-machine-gun'], power: 600e3, weight: 700, impact: 1 },
  tank: { maxSpeed: 0.39, accel: 0.0028, turn: 0.0055 * TAU, friction: 0.0034, fuelSlots: 2, guns: ['vehicle-machine-gun', 'tank-cannon', 'tank-flamethrower'], power: 1200e3, weight: 20000, impact: 4 },
};
const VGUN: Record<string, { cat: string; range: number; rate: number }> = {
  'vehicle-machine-gun': { cat: 'bullet', range: 20, rate: 10 },
  'tank-cannon': { cat: 'cannon', range: 30, rate: 0.5 },
  'tank-flamethrower': { cat: 'flamethrower', range: 15, rate: 60 },
};
export class Vehicle extends Entity {
  burner: Burner;
  trunk: Inventory;
  ammo: Inventory;
  speed = 0;
  orient = 0;          // radians, 0 = north (sprite up), clockwise
  turretAngle = 0;
  driver: Character | null = null;
  gunSel = 0;
  cooldown = 0;
  rounds = [0, 0, 0];
  isVehicle = true;
  isUnit = true;
  engineT = 0;
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, 0);
    const v = VEH[p] || VEH.car;
    this.burner = new Burner(v.fuelSlots);
    this.trunk = new Inventory(this.proto.slots || 80);
    this.ammo = new Inventory(v.guns.length);
    this.orient = d * Math.PI / 2;
    this.w = p === 'tank' ? 2.4 : 1.4; this.h = this.w;
  }
  get spec() { return VEH[this.name] || VEH.car; }
  get phase() { return PHASE.COMBAT; }
  get blocksMovement() { return false; }
  get tx() { return Math.floor(this.x); }
  get ty() { return Math.floor(this.y); }
  onRemoved() {
    if (this.driver) G.game.combat?.exitVehicle();
  }
  inventories() { return [this.burner.fuel, this.trunk, this.ammo]; }
  wantsFuel(id: string) { return this.burner.wantsFuel(id); }
  insertItem(id: string, n: number, src = 'inserter') {
    if (this.burner.isFuel(id) && this.burner.fuel.space(id) > 0) return this.burner.fuel.insert(id, n);
    const am = ITEMS[id]?.ammo;
    if (am) {
      const guns = this.spec.guns;
      let got = 0;
      for (let i = 0; i < guns.length && got < n; i++) {
        if (VGUN[guns[i]].cat !== am.cat) continue;
        const s = this.ammo.slots[i];
        if (s && s.id !== id) continue;
        const k = Math.min(n - got, ITEMS[id].stack - (s?.n || 0));
        if (k <= 0) continue;
        if (s) s.n += k; else this.ammo.slots[i] = { id, n: k };
        got += k;
      }
      if (got) { this.ammo.changed(); return got; }
    }
    return this.trunk.insert(id, n);
  }
  takeOutput(max: number, filter?: (id: string) => boolean) { return this.trunk.takeAny(max, filter); }
  hasOutput(filter?: (id: string) => boolean) { return this.trunk.firstItem(filter) !== null; }
  damage(amount: number, type = 'physical', source?: any) {
    const res: Record<string, [number, number]> = this.name === 'tank' ? { physical: [15, 0.6], explosion: [15, 0.7], acid: [0, 0.7], fire: [15, 0.6], impact: [50, 0.8] } : { physical: [0, 0.2], explosion: [0, 0.2], fire: [0, 0.5], impact: [30, 0.3], acid: [0, 0.2] };
    const r = res[type];
    let d = amount;
    if (r) d = Math.max(amount > 0 ? 1 : 0, (amount - r[0]) * (1 - r[1]));
    this.health -= d; this.lastHit = G.game.tick;
    if (this.health <= 0 && !this.dead) {
      const g = G.game;
      if (this.driver) { g.combat?.exitVehicle(); }
      g.fx?.explosion(this.x, this.y, 2);
      g.sound.play('explosion', 1, this.x, this.y);
      this.dead = true;
      g.world.removeUnit(this);
      g.entityCountVersion++;
    }
    return d;
  }
  // Called every tick from Combat.drive while driven; otherwise coasts
  control(throttle: number, steer: number) {
    const s = this.spec;
    const fuelId = this.burner.currentFuel;
    const it = fuelId ? ITEMS[fuelId] : null;
    const accelK = it?.fuelAccel || 1, topK = it?.fuelTopSpeed || 1;
    if (throttle !== 0) {
      const sameDir = Math.sign(throttle) === Math.sign(this.speed) || Math.abs(this.speed) < 0.002;
      if (sameDir) {
        const got = this.burner.consume(s.power / 60 * Math.abs(throttle));
        if (got > 0) this.speed += throttle * s.accel * accelK * got * (throttle < 0 ? 0.5 : 1);
        this.engineT++;
      } else {
        // braking
        const br = 0.012 * (1 + G.game.bonus.braking);
        this.speed = Math.abs(this.speed) <= br ? 0 : this.speed - Math.sign(this.speed) * br;
      }
    }
    const max = s.maxSpeed * topK * (this.speed < 0 ? 0.4 : 1);
    this.speed = clamp(this.speed, -max, max);
    if (steer !== 0 && Math.abs(this.speed) > 0.003) this.orient += steer * s.turn * Math.sign(this.speed) * Math.min(1, Math.abs(this.speed) * 12);
  }
  update() {
    const g = G.game;
    if (this.cooldown > 0) this.cooldown--;
    // friction
    const s = this.spec;
    const ws = g.world.walkSpeed(this.x, this.y);
    const fr = s.friction * (ws < 1 ? 2 : 1) + Math.abs(this.speed) * 0.002;
    this.speed = Math.abs(this.speed) <= fr ? 0 : this.speed - Math.sign(this.speed) * fr;
    if (this.speed === 0) return;
    const vx = Math.sin(this.orient) * this.speed, vy = -Math.cos(this.orient) * this.speed;
    const steps = Math.max(1, Math.ceil(Math.abs(this.speed) / 0.2));
    let nx = this.x, ny = this.y, hit: Entity | 'water' | null = null;
    for (let i = 0; i < steps && !hit; i++) {
      const px = nx + vx / steps, py = ny + vy / steps;
      hit = this.collide(px, py);
      if (!hit) { nx = px; ny = py; }
    }
    if (hit === 'water' || hit) {
      this.x = nx; this.y = ny;
      const impact = Math.abs(this.speed) * 216; // km/h-ish
      if (hit !== 'water') {
        const e = hit as Entity;
        if (e.type === 'tree' && this.name === 'tank') { g.destroyEntity(e, this); this.speed *= 0.9; this.x = nx; this.y = ny; return; }
        const dmg = impact * 1.5 * (this.name === 'tank' ? 2 : 1);
        if (impact > 6) { e.damage(dmg, 'impact', this); this.damage(dmg * (this.name === 'tank' ? 0.1 : 0.5), 'impact', e); g.sound.play('bite', 0.6, this.x, this.y); }
      }
      this.speed = -this.speed * 0.15;
      return;
    }
    this.x = nx; this.y = ny;
    // run over enemy units
    if (g.enemies && Math.abs(this.speed) > 0.08) {
      for (const u of g.enemies.units) {
        if (u.dead) continue;
        if (Math.abs(u.x - this.x) < this.w * 0.6 && Math.abs(u.y - this.y) < this.w * 0.6) {
          u.damage(Math.abs(this.speed) * 216 * (this.name === 'tank' ? 6 : 2), 'impact', this);
          this.speed *= this.name === 'tank' ? 0.97 : 0.8;
          this.damage(this.name === 'tank' ? 1 : 4, 'impact', u);
        }
      }
    }
    if (this.engineT > 0 && (g.tick % 12) === 0 && this.driver) g.sound.play('car', 0.25 + Math.abs(this.speed));
    if (this.driver) { this.driver.x = this.x; this.driver.y = this.y; }
  }
  // footprint sample points (local, pointing north), spacing <= 0.3 tiles
  private samples: [number, number][] | null = null;
  footprint(): [number, number][] {
    if (this.samples) return this.samples;
    const [W, L] = this.name === 'tank' ? [2.0, 3.2] : [1.2, 2.3];
    const nx = Math.ceil(W / 0.3), ny = Math.ceil(L / 0.3);
    const out: [number, number][] = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) out.push([-W / 2 + W * i / nx, -L / 2 + L * j / ny]);
    return this.samples = out;
  }
  collide(x: number, y: number): Entity | 'water' | null {
    const w = G.game.world;
    const c0 = Math.cos(this.orient), s0 = Math.sin(this.orient);
    for (const [lx, ly] of this.footprint()) {
      const ox = lx * c0 - ly * s0, oy = lx * s0 + ly * c0;
      const tx = Math.floor(x + ox), ty = Math.floor(y + oy);
      const c = w.chunkAt(tx, ty);
      if (!c) return 'water';
      if (isWaterTile(c.tiles[((ty & 31) << 5) | (tx & 31)])) return 'water';
      const o = c.occ[((ty & 31) << 5) | (tx & 31)];
      if (o && o.blocksMovement && o !== this) {
        const inset = o.type === 'tree' ? 0.3 : o.collisionInset;
        if (x + ox > o.x - o.w / 2 + inset - 0.05 && x + ox < o.x + o.w / 2 - inset + 0.05 && y + oy > o.y - o.h / 2 + inset - 0.05 && y + oy < o.y + o.h / 2 - inset + 0.05) return o;
      }
    }
    return null;
  }
  shoot(tx: number, ty: number, auto: boolean) {
    const g = G.game;
    const guns = this.spec.guns;
    // selected weapon; fall back to the next weapon that has matching ammo
    let sel = -1, slot = -1;
    for (let k = 0; k < guns.length && sel < 0; k++) {
      const gi = (this.gunSel + k) % guns.length;
      const cat = VGUN[guns[gi]].cat;
      if (this.rounds[gi] > 0) { sel = gi; break; }
      const si = this.ammo.slots.findIndex((st, i) => st && ITEMS[st.id]?.ammo?.cat === cat && (i === gi || true));
      if (si >= 0) { sel = gi; slot = si; }
    }
    if (sel < 0) return;
    const gun = VGUN[guns[sel]];
    const s = slot >= 0 ? this.ammo.slots[slot] : null;
    const ammoId = this.rounds[sel] > 0 ? (this as any)['last' + sel] : s?.id;
    const ammo = ammoId ? ITEMS[ammoId]?.ammo : null;
    if (!ammo || ammo.cat !== gun.cat) return;
    let target: Entity | null = findEnemy(tx, ty, 3) || (auto ? findEnemy(this.x, this.y, gun.range) : null);
    if (target && Math.hypot(target.x - this.x, target.y - this.y) > gun.range) target = null;
    const ax = target ? target.x : tx, ay = target ? target.y : ty;
    const want = Math.atan2(ax - this.x, -(ay - this.y));
    this.turretAngle += angDiff(this.turretAngle, want) * 0.4;
    if (this.cooldown > 0) return;
    if (this.rounds[sel] <= 0) { this.rounds[sel] = ammo.magazine; (this as any)['last' + sel] = ammoId; this.ammo.remove(ammoId, 1); g.stats.consume(ammoId, 1); }
    this.rounds[sel]--;
    this.cooldown = Math.max(1, Math.round(60 / (gun.rate * speedMult(gun.cat))));
    const mx = this.x + Math.sin(this.turretAngle) * this.w * 0.7, my = this.y - Math.cos(this.turretAngle) * this.w * 0.7 - 0.4;
    g.combat.fireAmmo(ammoId, ammo, mx, my, ax, ay, target, this, gun.range);
  }
  draw(r: Renderer) {
    const a = r.atlas;
    const sc = this.name === 'tank' ? 1.3 : 1.25;
    r.draw('shadow', a.get(this.name + '-shadow'), this.x + 0.3, this.y + 0.2, WHITE, this.orient, sc);
    r.draw('objects', a.get(this.name), this.x, this.y, WHITE, this.orient, sc, this.y + 0.5);
    if (this.name === 'tank') r.draw('objects', a.get('tank-turret'), this.x, this.y, WHITE, this.turretAngle, 1.25, this.y + 0.6);
    if (G.game.darkness > 0.1 && this.driver) {
      const fx = Math.sin(this.orient), fy = -Math.cos(this.orient);
      r.draw('light', a.get('light'), this.x + fx * 6, this.y + fy * 6, additive(1, 0.95, 0.8, 0.9), 0, 12);
    }
    if (this.health < this.maxHealth && G.game.tick - this.lastHit < 600) {
      const f = this.health / this.maxHealth;
      r.drawRect('overlay', a.get('white'), this.x, this.y - this.w * 0.8, 1.4, 0.14, rgba(0, 0, 0, 0.7));
      r.drawRect('overlay', a.get('white'), this.x - 0.7 + 0.7 * f, this.y - this.w * 0.8, 1.4 * f, 0.1, rgba(0.25, 0.85, 0.2, 1));
    }
  }
  serialize() { return { b: this.burner.serialize(), t: this.trunk.serialize(), a: this.ammo.serialize(), o: this.orient, ta: this.turretAngle, r: this.rounds }; }
  load(d: any) { this.burner.load(d.b); this.trunk.load(d.t); this.ammo.load(d.a); this.orient = d.o || 0; this.turretAngle = d.ta || 0; this.rounds = d.r || [0, 0, 0]; }
  buildGUI(win: any, P: HTMLElement) {
    win.burnerRow(P, this.burner);
    const ar = h('div', 'row', P); h('div', 'label', ar, 'Ammo');
    (this.ammo as any).accepts = (id: string) => !!ITEMS[id]?.ammo;
    win.invGrid(ar, () => this.ammo, 3);
    const sp = h('div', 'mini-label', P);
    win.updaters.push(() => sp.textContent = `Speed ${Math.round(Math.abs(this.speed) * 216)} km/h · Press Enter to ${this.driver ? 'exit' : 'enter'}`);
    h('div', 'subtitle', P, 'Trunk');
    const sc = h('div', 'scroll', P); sc.style.maxHeight = '40vh';
    win.invGrid(sc, () => this.trunk, 10);
  }
}

// ---------------- Combat system ----------------
export class CombatSystem {
  projs: Proj[] = [];
  clouds: Cloud[] = [];
  robots: CombatRobot[] = [];
  capsuleCD = 0;
  laserCD = 0;

  launch(p: Proj) { this.projs.push(p); }

  get followerLimit() { return 20 + G.game.bonus.followers; }

  // ---- player weapons ----
  playerShoot(cursor: [number, number] | null) {
    const g = G.game, p = g.player, ch = p.character;
    if (p.dead) return;
    if (ch.vehicle instanceof Vehicle) {
      const v = ch.vehicle;
      const c = cursor || [v.x + Math.sin(v.orient) * 10, v.y - Math.cos(v.orient) * 10];
      v.shoot(c[0], c[1], true);
      return;
    }
    // pick a gun with ammo
    let sel = p.selectedGun;
    for (let k = 0; k < 3; k++) {
      const gs = p.guns.slots[sel], as = p.ammo.slots[sel];
      if (gs && (as || this.rounds(p)[sel] > 0) && (!as || ITEMS[as.id].ammo!.cat === ITEMS[gs.id].gun!.cat)) break;
      sel = (sel + 1) % 3;
    }
    const gs = p.guns.slots[sel];
    if (!gs) { ch.shooting = false; return; }
    p.selectedGun = sel;
    const gun = ITEMS[gs.id].gun!;
    const as = p.ammo.slots[sel];
    const rounds = this.rounds(p);
    if (!as && rounds[sel] <= 0) { if (g.tick % 60 === 0) g.ui?.flyText(ch.x, ch.y - 1, 'Out of ammo', '#ff8a6a'); ch.shooting = false; return; }
    const ammoId = as?.id || (p as any)._lastAmmo?.[sel];
    const ammo = ITEMS[ammoId]?.ammo;
    if (!ammo || ammo.cat !== gun.cat) { ch.shooting = false; return; }
    const range = gun.range + (ammo.range || 0);
    let target: Entity | null = null;
    if (cursor) target = findEnemy(cursor[0], cursor[1], 2.5);
    if (target && Math.hypot(target.x - ch.x, target.y - ch.y) > range) target = null;
    if (!target) target = findEnemy(ch.x, ch.y, range);
    let tx: number, ty: number;
    if (target) { tx = target.x; ty = target.y; }
    else if (cursor) { tx = cursor[0]; ty = cursor[1]; const d = Math.hypot(tx - ch.x, ty - ch.y); if (d > range) { tx = ch.x + (tx - ch.x) / d * range; ty = ch.y + (ty - ch.y) / d * range; } }
    else { ch.shooting = false; return; }
    ch.shooting = true;
    ch.face = faceTo(tx - ch.x, ty - ch.y);
    if (p.shootCooldown > 0) return;
    if (rounds[sel] <= 0) {
      rounds[sel] = ammo.magazine;
      ((p as any)._lastAmmo = (p as any)._lastAmmo || [])[sel] = ammoId;
      p.ammo.remove(ammoId, 1);
      g.stats.consume(ammoId, 1);
    }
    rounds[sel]--;
    p.shootCooldown = Math.max(1, Math.round(60 / (gun.rate * speedMult(gun.cat))));
    const f = DIRS8F[ch.face];
    const mx = ch.x + f[0] * 0.5, my = ch.y - 0.9 + f[1] * 0.4;
    this.fireAmmo(ammoId, ammo, mx, my, tx, ty, target, ch, range, gun.dmgBonus || 0);
  }
  rounds(p: any): number[] { return p._rounds || (p._rounds = [0, 0, 0]); }

  // Fire one shot of ammo from (mx,my) toward (tx,ty)
  fireAmmo(id: string, ammo: AmmoInfo, mx: number, my: number, tx: number, ty: number, target: Entity | null, source: any, range: number, extra = 0) {
    const g = G.game;
    const mult = dmgMult(ammo.cat) * (1 + extra);
    switch (ammo.cat) {
      case 'bullet': {
        if (target) target.damage(ammo.damage * mult, ammo.dtype, source);
        g.fx?.tracer(mx, my, tx + (Math.random() - 0.5) * 0.3, ty - 0.3 + (Math.random() - 0.5) * 0.3);
        g.fx?.muzzle(mx, my);
        g.sound.play('gunshot', 0.45, mx, my);
        break;
      }
      case 'shotgun': {
        const base = Math.atan2(ty - my, tx - mx);
        const cands = enemiesNear(mx, my, range);
        for (let i = 0; i < (ammo.pellets || 12); i++) {
          const a = base + (Math.random() - 0.5) * 0.35;
          const len = range * (0.7 + Math.random() * 0.3);
          let hitE: Entity | null = null, hd = len;
          for (const e of cands) {
            if (e.dead) continue;
            const rx = e.x - mx, ry = e.y - my;
            const along = rx * Math.cos(a) + ry * Math.sin(a);
            if (along < 0 || along > hd) continue;
            const perp = Math.abs(-rx * Math.sin(a) + ry * Math.cos(a));
            if (perp < Math.max(0.4, e.w / 2)) { hd = along; hitE = e; }
          }
          if (hitE) hitE.damage(ammo.damage * mult, ammo.dtype, source);
          if (i % 3 === 0) g.fx?.tracer(mx, my, mx + Math.cos(a) * hd, my + Math.sin(a) * hd);
        }
        g.fx?.muzzle(mx, my);
        g.sound.play('gunshot', 0.7, mx, my);
        break;
      }
      case 'rocket': {
        const d = Math.hypot(tx - mx, ty - my);
        this.launch({ kind: 'rocket', x: mx, y: my, sx: mx, sy: my, tx, ty, t: 0, T: Math.max(10, d / 0.45), arc: 0, target, ammo: id, damage: ammo.damage * mult, dtype: ammo.dtype, source, size: ammo.aoe || 0, mult });
        g.sound.play('gunshot', 0.5, mx, my);
        break;
      }
      case 'cannon': {
        const d = Math.hypot(tx - mx, ty - my);
        this.launch({ kind: 'shell', x: mx, y: my, sx: mx, sy: my, tx, ty, t: 0, T: Math.max(4, d / 1.0), arc: 0, target, ammo: id, damage: ammo.damage * mult, dtype: ammo.dtype, source, size: ammo.aoe || 1.5, mult });
        g.fx?.muzzle(mx, my); g.fx?.smoke(mx, my, 1);
        g.sound.play('explosion', 0.5, mx, my);
        break;
      }
      case 'flamethrower': {
        const d = Math.hypot(tx - mx, ty - my);
        this.launch({ kind: 'flame', x: mx, y: my, sx: mx, sy: my, tx: tx + (Math.random() - 0.5) * 0.6, ty: ty + (Math.random() - 0.5) * 0.6, t: 0, T: Math.max(6, d / 0.5), arc: 0.6, damage: 3 * mult, dtype: 'fire', source, size: 1.2 });
        break;
      }
    }
  }

  // ---- capsules ----
  useCapsule(item: string, x: number, y: number) {
    const g = G.game, p = g.player, ch = p.character;
    if (p.dead || this.capsuleCD > 0) return;
    const cap = ITEMS[item]?.capsule;
    if (!cap) return;
    const have = p.cursor && p.cursor.id === item ? p.cursor.n : 0;
    if (have <= 0) return;
    let tx = x, ty = y;
    const d = Math.hypot(tx - ch.x, ty - ch.y);
    if (cap.range > 0 && d > cap.range) { tx = ch.x + (tx - ch.x) / d * cap.range; ty = ch.y + (ty - ch.y) / d * cap.range; }
    const consume = () => { p.cursor!.n--; if (p.cursor!.n <= 0) { p.cursor = null; if (p.main.count(item) > 0) p.selectItem(item); } };
    this.capsuleCD = cap.cooldown;
    switch (cap.kind) {
      case 'heal':
        if (ch.health >= ch.maxHealth) return;
        ch.health = Math.min(ch.maxHealth, ch.health + 80);
        g.ui?.flyText(ch.x, ch.y - 1, '+80', '#7aff7a');
        consume();
        return;
      case 'defender': case 'distractor': case 'destroyer': {
        const n = cap.kind === 'defender' ? 1 : cap.kind === 'distractor' ? 3 : 5;
        const live = this.robots.filter(r => !r.dead && ROBOTS[r.kind].follow).length;
        if (cap.kind !== 'distractor' && live + n > this.followerLimit) { g.ui?.flyText(ch.x, ch.y - 1, 'Follower robot limit reached', '#ff8a6a'); return; }
        this.throwProj('capsule', ch, tx, ty, { capsule: cap.kind, size: n });
        consume();
        return;
      }
      case 'cliff': g.ui?.flyText(tx, ty, 'No cliffs here', '#ff8a6a'); return;
      case 'remote': return;
      default:
        this.throwProj(cap.kind as ProjKind, ch, tx, ty, {});
        consume();
    }
  }
  throwProj(kind: ProjKind, from: Entity, tx: number, ty: number, extra: Partial<Proj>) {
    const d = Math.hypot(tx - from.x, ty - from.y);
    this.launch({ kind, x: from.x, y: from.y - 0.8, sx: from.x, sy: from.y - 0.8, tx, ty, t: 0, T: Math.max(15, d / 0.3), arc: 1 + d * 0.12, damage: 0, dtype: 'explosion', source: from, size: 1, ...extra });
  }

  // ---- enemy acid ----
  spitAcid(x: number, y: number, target: Entity, damage: number, puddle: number, size: number, slow: number) {
    const lead = (target as any).vehicle ? 0 : 0;
    void lead;
    const tx = target.x + (Math.random() - 0.5) * 0.4, ty = target.y + (Math.random() - 0.5) * 0.4;
    const d = Math.hypot(tx - x, ty - y);
    this.launch({ kind: 'acid', x, y, sx: x, sy: y, tx, ty, t: 0, T: Math.max(12, d / 0.4), arc: 1 + d * 0.1, target, damage, dtype: 'acid', source: null, size, slow, puddle });
    G.game.sound.play('acid', 0.3, x, y);
  }

  // ---- vehicles ----
  toggleVehicle() {
    const g = G.game, p = g.player, ch = p.character;
    if (p.dead) return;
    if (ch.vehicle) { this.exitVehicle(); return; }
    let best: Vehicle | null = null, bd = 6;
    for (const u of g.world.units) if (u instanceof Vehicle && !u.dead && (!u.driver || u.driver.dead)) { const d = Math.hypot(u.x - ch.x, u.y - ch.y); if (d < bd) { bd = d; best = u; } }
    if (!best) return;
    ch.vehicle = best; best.driver = ch;
    ch.x = best.x; ch.y = best.y;
    g.sound.play('car', 0.6);
  }
  exitVehicle() {
    const g = G.game, ch = g.player.character;
    const v = ch.vehicle as Vehicle | null;
    if (!v) return;
    v.driver = null;
    ch.vehicle = null;
    // find a free spot next to the vehicle
    for (let r = v.w / 2 + 0.6; r < 6; r += 0.5) {
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU + v.orient + Math.PI / 2;
        const x = v.x + Math.cos(a) * r, y = v.y + Math.sin(a) * r;
        const o = g.world.occAt(Math.floor(x), Math.floor(y));
        if (!g.world.isWater(Math.floor(x), Math.floor(y)) && (!o || !o.blocksMovement)) { ch.x = x; ch.y = y; return; }
      }
    }
  }
  drive(mx: number, my: number) {
    const v = G.game.player.character.vehicle as Vehicle | null;
    if (!v || v.dead) { if (v) this.exitVehicle(); return; }
    v.control(-my, mx);
  }

  // ---- per tick ----
  tick() {
    const g = G.game;
    if (this.capsuleCD > 0) this.capsuleCD--;
    const p = g.player;
    if (p.shootCooldown > 0) p.shootCooldown--;
    // projectiles
    const ps = this.projs;
    let j = 0;
    for (let i = 0; i < ps.length; i++) {
      const pr = ps[i];
      pr.t++;
      // homing rockets follow target
      if (pr.kind === 'rocket' && pr.target && !pr.target.dead) { pr.tx = pr.target.x; pr.ty = pr.target.y; }
      const f = Math.min(1, pr.t / pr.T);
      pr.x = pr.sx + (pr.tx - pr.sx) * f; pr.y = pr.sy + (pr.ty - pr.sy) * f;
      if (pr.kind === 'rocket' && (pr.t & 1) === 0) g.fx?.smoke(pr.x, pr.y, 0.35);
      if (pr.t >= pr.T) this.detonate(pr); else ps[j++] = pr;
    }
    ps.length = j;
    // ground effects
    const cs = this.clouds;
    j = 0;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      c.t++;
      if ((c.t + c.seed) % 10 === 0) this.applyCloud(c);
      if (c.kind === 'fire' && c.t % 30 === 0 && Math.random() < 0.6) g.fx?.smoke(c.x + (Math.random() - 0.5) * c.r, c.y, 0.6);
      if (c.t < c.life) cs[j++] = c;
    }
    cs.length = j;
    // robots
    let k = 0;
    for (const r of this.robots) { if (!r.dead) { r.update(); if (!r.dead) this.robots[k++] = r; } }
    this.robots.length = k;
    // personal laser defense
    if (!p.dead) this.personalDefense();
  }
  personalDefense() {
    const g = G.game, p = g.player, ch = p.character;
    const lasers = p.armorGrid.filter(e => ITEMS[e.id]?.equip?.kind === 'laser').length;
    if (!lasers) return;
    if (this.laserCD > 0) { this.laserCD--; return; }
    const targets = enemiesNear(ch.x, ch.y, 15).filter(e => (e as any).isEnemyUnit || (e as any).enemyBase);
    if (!targets.length) return;
    targets.sort((a, b) => Math.hypot(a.x - ch.x, a.y - ch.y) - Math.hypot(b.x - ch.x, b.y - ch.y));
    let shots = 0;
    for (let i = 0; i < lasers && p.battery >= 50e3; i++) {
      const t = targets[i % targets.length];
      p.battery -= 50e3;
      t.damage(10 * dmgMult('laser'), 'laser', ch.vehicle || ch);
      g.fx?.laser(ch.x, ch.y - 1.2, t.x, t.y);
      shots++;
    }
    if (shots) { this.laserCD = 40; g.sound.play('laser', 0.25); }
  }

  detonate(pr: Proj) {
    const g = G.game;
    switch (pr.kind) {
      case 'rocket': {
        if (pr.ammo === 'atomic-bomb') { this.nuke(pr.tx, pr.ty, pr.mult || 1); return; }
        if (pr.target && !pr.target.dead && Math.hypot(pr.target.x - pr.tx, pr.target.y - pr.ty) < 1.5) pr.target.damage(pr.damage, pr.dtype, pr.source);
        if (pr.size > 0) areaDamage(pr.tx, pr.ty, pr.size, 100 * (pr.mult || 1), 'explosion', pr.source);
        g.fx?.explosion(pr.tx, pr.ty, pr.size > 0 ? 1.8 : 1);
        g.sound.play('explosion', 0.8, pr.tx, pr.ty);
        return;
      }
      case 'shell': {
        const a = ITEMS[pr.ammo!]?.ammo;
        if (pr.target && !pr.target.dead) pr.target.damage(pr.damage, 'physical', pr.source);
        areaDamage(pr.tx, pr.ty, a?.aoe || 1.5, (a?.aoeDamage || 100) * (pr.mult || 1), 'explosion', pr.source);
        g.fx?.explosion(pr.tx, pr.ty, a?.aoe ? 1.8 : 1.1);
        g.sound.play('explosion', 0.7, pr.tx, pr.ty);
        return;
      }
      case 'artillery': {
        areaDamage(pr.tx, pr.ty, 4, pr.damage, 'explosion', pr.source, { falloff: false });
        areaDamage(pr.tx, pr.ty, 4, 1000, 'physical', pr.source);
        g.fx?.explosion(pr.tx, pr.ty, 3);
        for (let i = 0; i < 6; i++) g.fx?.explosion(pr.tx + (Math.random() - 0.5) * 6, pr.ty + (Math.random() - 0.5) * 6, 1.2);
        g.sound.play('explosion', 1, pr.tx, pr.ty);
        return;
      }
      case 'grenade': {
        areaDamage(pr.tx, pr.ty, 6.5, 35 * dmgMult('grenade'), 'explosion', pr.source);
        g.fx?.explosion(pr.tx, pr.ty, 1.6);
        g.sound.play('explosion', 0.8, pr.tx, pr.ty);
        return;
      }
      case 'cluster': {
        g.fx?.explosion(pr.tx, pr.ty, 1.2);
        areaDamage(pr.tx, pr.ty, 6.5, 35 * dmgMult('grenade'), 'explosion', pr.source);
        for (let i = 0; i < 7; i++) {
          const a = i / 7 * TAU + Math.random(), r = 2 + Math.random() * 3;
          this.launch({ kind: 'grenade', x: pr.tx, y: pr.ty, sx: pr.tx, sy: pr.ty, tx: pr.tx + Math.cos(a) * r, ty: pr.ty + Math.sin(a) * r, t: 0, T: 18 + Math.random() * 10, arc: 0.8, damage: 0, dtype: 'explosion', source: pr.source, size: 1 });
        }
        g.sound.play('explosion', 0.8, pr.tx, pr.ty);
        return;
      }
      case 'poison': this.clouds.push({ kind: 'poison', x: pr.tx, y: pr.ty, r: 11, t: 0, life: 60 * 20, dmg: 8, source: pr.source, seed: Math.random() * 10 | 0 }); return;
      case 'slowdown': {
        for (const e of enemiesNear(pr.tx, pr.ty, 9)) (e as any).slow = 60 * 30;
        this.clouds.push({ kind: 'slowdown', x: pr.tx, y: pr.ty, r: 9, t: 0, life: 90, dmg: 0, source: pr.source, seed: 0 });
        return;
      }
      case 'capsule': {
        const kind = pr.capsule!;
        for (let i = 0; i < pr.size; i++) {
          const rb = new CombatRobot(kind, pr.tx + (Math.random() - 0.5) * 1.5, pr.ty + (Math.random() - 0.5) * 1.5);
          if (kind === 'distractor') rb.isFriendlyUnit = true;
          this.robots.push(rb);
          g.world.addUnit(rb);
        }
        g.fx?.smoke(pr.tx, pr.ty, 0.8);
        return;
      }
      case 'flame': {
        for (const e of enemiesNear(pr.tx, pr.ty, 1.2)) e.damage(pr.damage, 'fire', pr.source);
        // merge into an existing fire nearby
        const near = this.clouds.find(c => c.kind === 'fire' && Math.abs(c.x - pr.tx) < 1 && Math.abs(c.y - pr.ty) < 1);
        if (near) near.life = Math.max(near.life, near.t + 240);
        else if (this.clouds.length < 600) this.clouds.push({ kind: 'fire', x: pr.tx, y: pr.ty, r: 1.4, t: 0, life: 300, dmg: 13 / 6 * dmgMult('flamethrower'), source: pr.source, seed: Math.random() * 10 | 0 });
        return;
      }
      case 'acid': {
        const t = pr.target;
        if (t && !t.dead) {
          const tt = (t as any).vehicle || t;
          if (Math.hypot(tt.x - pr.tx, tt.y - pr.ty) < 1 + tt.w / 2) {
            tt.damage(pr.damage, 'acid', null);
            if (tt instanceof Character && pr.slow) tt.slow = Math.max(tt.slow, 120);
          }
        }
        g.fx?.acid(pr.tx, pr.ty, pr.size * 1.2);
        if (pr.puddle) this.clouds.push({ kind: 'acid', x: pr.tx, y: pr.ty, r: pr.size * 0.9, t: 0, life: 120, dmg: pr.puddle / 12, slow: pr.slow, source: null, seed: Math.random() * 10 | 0 });
        return;
      }
    }
  }
  applyCloud(c: Cloud) {
    const g = G.game;
    switch (c.kind) {
      case 'fire':
        for (const e of enemiesNear(c.x, c.y, c.r)) e.damage(c.dmg, 'fire', c.source);
        for (const t of g.world.entitiesIn(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r, e => e.type === 'tree', 1)) {
          t.damage(2, 'fire', c.source);
          if (Math.random() < 0.02 && this.clouds.length < 600) this.clouds.push({ kind: 'fire', x: t.x, y: t.y, r: 1.2, t: 0, life: 360, dmg: c.dmg, source: c.source, seed: Math.random() * 10 | 0 });
        }
        { const ch = g.player.character; if (!ch.dead && !ch.vehicle && Math.hypot(ch.x - c.x, ch.y - c.y) < c.r) ch.damage(c.dmg * 0.5, 'fire', null); }
        break;
      case 'poison':
        for (const e of enemiesNear(c.x, c.y, c.r)) e.damage(c.dmg / 2, 'poison', c.source);
        for (const t of g.world.entitiesIn(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r, e => e.type === 'tree', 1)) if (Math.random() < 0.1) t.damage(1, 'poison', c.source);
        { const ch = g.player.character; if (!ch.dead && !ch.vehicle && Math.hypot(ch.x - c.x, ch.y - c.y) < c.r) ch.damage(c.dmg / 2, 'poison', null); }
        break;
      case 'acid':
        for (const e of friendliesNear(c.x, c.y, c.r)) {
          e.damage(c.dmg, 'acid', null);
          if (e instanceof Character && c.slow) e.slow = Math.max(e.slow, 60);
        }
        break;
    }
  }
  nuke(x: number, y: number, mult: number) {
    const g = G.game;
    areaDamage(x, y, 35, 1000 * mult, 'explosion', null, { friendly: true, falloff: true });
    areaDamage(x, y, 8, 3000 * mult, 'explosion', null, { friendly: true });
    for (let i = 0; i < 30; i++) { const a = Math.random() * TAU, r = Math.random() * 30; g.fx?.explosion(x + Math.cos(a) * r, y + Math.sin(a) * r, 2 + Math.random() * 2); }
    g.fx?.explosion(x, y, 8);
    g.sound.play('explosion', 1.5, x, y);
  }

  draw(r: Renderer) {
    const a = r.atlas;
    const g = G.game;
    for (const c of this.clouds) {
      const fade = Math.min(1, (c.life - c.t) / 60, c.t / 10);
      if (c.kind === 'fire') {
        for (let i = 0; i < 3; i++) {
          const ox = Math.sin(c.seed * 3 + i * 2.1) * c.r * 0.45, oy = Math.cos(c.seed * 5 + i * 1.7) * c.r * 0.3;
          const fl = 0.7 + 0.3 * Math.sin(g.renderTime * 12 + i + c.seed);
          r.draw('objects', a.get('flame'), c.x + ox, c.y + oy - 0.35, additive(1, 0.62, 0.25, fl * fade), 0, 0.9 + 0.2 * Math.sin(g.renderTime * 7 + i), c.y + oy);
        }
        r.draw('light', a.get('light'), c.x, c.y, additive(1, 0.55, 0.2, 0.8 * fade), 0, 5);
      } else if (c.kind === 'poison') {
        for (let i = 0; i < 6; i++) {
          const ang = c.seed + i * 1.05 + g.renderTime * 0.1;
          r.draw('air', a.get('smoke'), c.x + Math.cos(ang) * c.r * 0.5, c.y + Math.sin(ang) * c.r * 0.35, rgba(0.35, 0.8, 0.25, 0.28 * fade), ang, c.r * 0.9, 1e6);
        }
      } else if (c.kind === 'slowdown') {
        r.draw('air', a.get('smoke'), c.x, c.y, rgba(0.3, 0.4, 0.9, 0.4 * fade), 0, c.r * 1.6, 1e6);
      } else if (c.kind === 'acid') {
        r.draw('ground2', a.get('acid'), c.x, c.y, rgba(1, 1, 1, 0.75 * fade), c.seed, c.r * 2);
      }
    }
    for (const p of this.projs) {
      const f = p.t / p.T;
      const hgt = p.arc * 4 * f * (1 - f);
      const ang = Math.atan2(p.ty - p.sy, p.tx - p.sx);
      switch (p.kind) {
        case 'rocket':
          r.draw('air', a.get('rocket-projectile'), p.x, p.y - 0.5, WHITE, ang, 0.9, 1e6);
          r.draw('light', a.get('light'), p.x, p.y, additive(1, 0.6, 0.2, 0.7), 0, 2.5);
          break;
        case 'shell':
          r.draw('air', a.get('tracer'), p.x, p.y - 0.4, additive(1, 0.85, 0.5, 1), ang, 1.2, 1e6);
          break;
        case 'artillery':
          r.draw('airShadow', a.get('grenade-projectile'), p.x + hgt * 0.3, p.y, rgba(0, 0, 0, 0.3), 0, 1);
          r.draw('air', a.get('grenade-projectile'), p.x, p.y - hgt, rgba(0.9, 0.85, 0.8, 1), 0, 1.4, 1e6);
          r.draw('light', a.get('light'), p.x, p.y - hgt, additive(1, 0.7, 0.4, 0.5), 0, 2);
          break;
        case 'acid':
          r.draw('airShadow', a.get('acid'), p.x, p.y, rgba(0, 0, 0, 0.25), 0, 0.4);
          r.draw('air', a.get('acid'), p.x, p.y - hgt - 0.3, WHITE, 0, 0.5 * p.size, 1e6);
          break;
        case 'flame':
          r.draw('air', a.get('flame'), p.x, p.y - hgt - 0.3, additive(1, 0.65, 0.25, 0.9), ang, 0.55 + f * 0.4, 1e6);
          r.draw('light', a.get('light'), p.x, p.y, additive(1, 0.55, 0.2, 0.5), 0, 3);
          break;
        case 'capsule':
          r.draw('airShadow', a.get('icon:' + p.capsule + '-capsule'), p.x, p.y + 0.8, rgba(0, 0, 0, 0.3), f * 12, 0.35);
          r.draw('air', a.get('icon:' + p.capsule + '-capsule'), p.x, p.y - hgt, WHITE, f * 12, 0.4, 1e6);
          break;
        default: {
          const icon = p.kind === 'grenade' ? 'grenade-projectile' : 'icon:' + (p.kind === 'cluster' ? 'cluster-grenade' : p.kind === 'poison' ? 'poison-capsule' : 'slowdown-capsule');
          r.draw('airShadow', a.get(icon), p.x, p.y + 0.8, rgba(0, 0, 0, 0.3), f * 10, 0.35);
          r.draw('air', a.get(icon), p.x, p.y - hgt, WHITE, f * 10, p.kind === 'grenade' ? 0.8 : 0.4, 1e6);
        }
      }
    }
  }

  serialize() { return {}; }
  load(d: any) { }
}
const DIRS8F: [number, number][] = [[0, -1], [0.7, -0.7], [1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7]];

registerEntity(['ammo-turret'], AmmoTurret);
registerEntity(['electric-turret'], ElectricTurret);
registerEntity(['fluid-turret'], FluidTurret);
registerEntity(['artillery-turret'], ArtilleryTurret);
registerEntity(['land-mine'], LandMine);
registerEntity(['car'], Vehicle);
void itemName; void DIRS;
