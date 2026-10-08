// Enemies: biters, spitters, worms, spawners, evolution, pollution-driven attacks, expansion.
import { Entity, PHASE, registerEntity } from './entity';
import { G, DIRS, clamp, tileKey } from '../core';
import { RNG, hash2 } from '../engine/noise';
import { isWaterTile } from '../world/tiles';
import { CHUNK } from '../world/mapgen';
import type { Renderer } from '../engine/renderer';
import { WHITE, rgba } from '../engine/renderer';
import { Remnants } from './simple';
import { BUG_DIRS, BUG_FRAMES } from '../art/sprites-world';
import { Character } from './player';

export interface UnitDef { name: string; kind: 'biter' | 'spitter'; hp: number; regen: number; speed: number; damage: number; dtype: string; cooldown: number; range: number; pollution: number; resist: Record<string, [number, number]>; scale: number; tint: [number, number, number]; puddle?: number; slow?: number; }
export const UNITS: Record<string, UnitDef> = {
  'small-biter': { name: 'Small biter', kind: 'biter', hp: 15, regen: 0.6, speed: 0.2, damage: 7, dtype: 'physical', cooldown: 35, range: 0.5, pollution: 4, resist: {}, scale: 0.55, tint: [0.9, 0.72, 0.55] },
  'medium-biter': { name: 'Medium biter', kind: 'biter', hp: 75, regen: 0.6, speed: 0.24, damage: 15, dtype: 'physical', cooldown: 35, range: 1, pollution: 20, resist: { physical: [4, 0.1], explosion: [0, 0.1] }, scale: 0.75, tint: [0.9, 0.45, 0.45] },
  'big-biter': { name: 'Big biter', kind: 'biter', hp: 375, regen: 1.2, speed: 0.23, damage: 30, dtype: 'physical', cooldown: 35, range: 1.5, pollution: 80, resist: { physical: [8, 0.1], explosion: [0, 0.1] }, scale: 1.0, tint: [0.55, 0.6, 0.85] },
  'behemoth-biter': { name: 'Behemoth biter', kind: 'biter', hp: 3000, regen: 6, speed: 0.3, damage: 90, dtype: 'physical', cooldown: 50, range: 1.5, pollution: 400, resist: { physical: [12, 0.1], explosion: [12, 0.1] }, scale: 1.35, tint: [0.6, 0.85, 0.45] },
  'small-spitter': { name: 'Small spitter', kind: 'spitter', hp: 10, regen: 0.6, speed: 0.185, damage: 12, dtype: 'acid', cooldown: 100, range: 13, pollution: 4, resist: {}, scale: 0.55, tint: [0.95, 0.85, 0.55], puddle: 7.2, slow: 0.6 },
  'medium-spitter': { name: 'Medium spitter', kind: 'spitter', hp: 50, regen: 0.6, speed: 0.165, damage: 24, dtype: 'acid', cooldown: 100, range: 14, pollution: 12, resist: { explosion: [0, 0.1] }, scale: 0.75, tint: [0.8, 0.55, 0.85], puddle: 28.8, slow: 0.5 },
  'big-spitter': { name: 'Big spitter', kind: 'spitter', hp: 200, regen: 0.6, speed: 0.15, damage: 36, dtype: 'acid', cooldown: 100, range: 15, pollution: 30, resist: { explosion: [0, 0.15] }, scale: 1.0, tint: [0.5, 0.65, 0.9], puddle: 130, slow: 0.4 },
  'behemoth-spitter': { name: 'Behemoth spitter', kind: 'spitter', hp: 1500, regen: 6, speed: 0.15, damage: 60, dtype: 'acid', cooldown: 100, range: 16, pollution: 200, resist: { explosion: [0, 0.3] }, scale: 1.35, tint: [0.6, 0.85, 0.5], puddle: 360, slow: 0.3 },
};
const WORMS = [
  { name: 'Small worm', hp: 200, regen: 0.6, range: 25, damage: 36, puddle: 21.6, scale: 0.7, tint: [0.95, 0.8, 0.65], resist: {} as Record<string, [number, number]> },
  { name: 'Medium worm', hp: 500, regen: 0.9, range: 30, damage: 48, puddle: 57.6, scale: 0.85, tint: [0.95, 0.6, 0.6], resist: { explosion: [5, 0.15], fire: [2, 0.5], laser: [0, 0.2], physical: [5, 0] } as Record<string, [number, number]> },
  { name: 'Big worm', hp: 1500, regen: 1.2, range: 38, damage: 72, puddle: 259, scale: 1.0, tint: [0.6, 0.65, 0.9], resist: { explosion: [10, 0.3], fire: [3, 0.7], laser: [0, 0.5], physical: [10, 0] } as Record<string, [number, number]> },
  { name: 'Behemoth worm', hp: 3000, regen: 1.2, range: 48, damage: 96, puddle: 691, scale: 1.25, tint: [0.6, 0.9, 0.5], resist: { explosion: [10, 0.3], fire: [3, 0.7], laser: [0, 0.8], physical: [10, 0] } as Record<string, [number, number]> },
];
const SPAWN_TABLE: Record<string, [string, [number, number][]][]> = {
  'biter-spawner': [
    ['small-biter', [[0, 0.3], [0.6, 0]]], ['medium-biter', [[0.2, 0], [0.6, 0.3], [0.7, 0.1]]], ['big-biter', [[0.5, 0], [1, 0.4]]], ['behemoth-biter', [[0.9, 0], [1, 0.3]]],
  ],
  'spitter-spawner': [
    ['small-biter', [[0, 0.3], [0.35, 0]]], ['small-spitter', [[0.25, 0], [0.5, 0.3], [0.7, 0]]], ['medium-spitter', [[0.4, 0], [0.7, 0.3], [0.9, 0.1]]], ['big-spitter', [[0.5, 0], [1, 0.4]]], ['behemoth-spitter', [[0.9, 0], [1, 0.3]]],
  ],
};
function weightAt(pts: [number, number][], e: number) {
  if (e < pts[0][0]) return 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (e >= x0 && e <= x1) return y0 + (y1 - y0) * (e - x0) / Math.max(1e-6, x1 - x0);
  }
  return pts[pts.length - 1][1];
}
export function pickUnit(spawner: string, evo: number, r = Math.random()): string {
  const table = SPAWN_TABLE[spawner];
  const ws = table.map(([n, pts]) => [n, weightAt(pts, evo)] as [string, number]);
  const sum = ws.reduce((s, [, w]) => s + w, 0);
  let x = r * sum;
  for (const [n, w] of ws) { if ((x -= w) <= 0) return n; }
  return ws[0][0];
}

const ENEMY_RESIST_SPAWNER: Record<string, [number, number]> = { explosion: [5, 0], fire: [3, 0.6], physical: [2, 0.15] };

function resistDamage(amount: number, type: string, res: Record<string, [number, number]>): number {
  const r = res[type];
  if (!r) return amount;
  let d = amount - r[0];
  if (d < 1) d = 1 / (2 + r[0] - amount); // Factorio low-damage formula approximation
  return Math.max(0, d * (1 - r[1]));
}

// ---------------- Base ----------------
export class EnemyBase {
  id: number;
  x: number; y: number;
  spawners: Spawner[] = [];
  worms: Worm[] = [];
  pollutionBudget = 0;
  pendingAttack: string[] = [];
  nextAttack = 0;
  aggro = 0;     // ticks of aggression after being attacked
  constructor(id: number, x: number, y: number) { this.id = id; this.x = x; this.y = y; }
  get alive() { return this.spawners.some(s => !s.dead) || this.worms.some(w => !w.dead); }
}

// ---------------- Spawner ----------------
export class Spawner extends Entity {
  kind: 'biter-spawner' | 'spitter-spawner' = 'biter-spawner';
  variant = 0;
  base: EnemyBase | null = null;
  owned: EnemyUnit[] = [];
  virtual = 0;          // units existing only as a count while far from player
  cooldown = 0;
  pulse = Math.random() * 6;
  constructor(p: string, x: number, y: number, d: any) { super('biter-spawner', x, y, 0); this.w = 4; this.h = 4; this.health = 350; }
  get isBuilding() { return false; }
  get minable() { return false; }
  get maxHealth() { return 350 * (1 + 9 * Math.pow(G.game.enemies?.evolution ?? 0, 2)); }
  get phase() { return PHASE.NONE; }
  get enemyBase() { return true; }
  damage(amount: number, type = 'physical', source?: any) {
    const d = resistDamage(amount, type, ENEMY_RESIST_SPAWNER);
    this.health -= d; this.lastHit = G.game.tick;
    if (this.base) G.game.enemies.alertBase(this.base, source);
    if (this.health <= 0 && !this.dead) G.game.enemies.onDeath(this, source);
    return d;
  }
  draw(r: Renderer) {
    const a = r.atlas;
    const sp = `${this.kind}-${this.variant % 2}`;
    const k = 1 + Math.sin(G.game.renderTime * 2 + this.pulse) * 0.015;
    r.draw('objects', a.get(sp), this.x, this.y, WHITE, 0, k, this.y + 1);
    r.draw('shadow', a.get(sp + '-shadow'), this.x, this.y);
  }
  serialize() { return { k: this.kind, v: this.variant, vi: this.virtual + this.owned.filter(u => !u.dead).length, b: this.base?.id }; }
  load(d: any) { this.kind = d.k; this.variant = d.v; this.virtual = d.vi || 0; (this as any)._baseId = d.b; }
}

// ---------------- Worm ----------------
export class Worm extends Entity {
  tier = 0;
  base: EnemyBase | null = null;
  cooldown = 0;
  anim = Math.random() * 8;
  target: Entity | null = null;
  constructor(p: string, x: number, y: number, d: any) { super('worm', x, y, 0); this.w = 2; this.h = 2; this.health = 200; }
  get def() { return WORMS[this.tier]; }
  get maxHealth() { return this.def.hp; }
  get isBuilding() { return false; }
  get minable() { return false; }
  get enemyBase() { return true; }
  get phase() { return PHASE.COMBAT; }
  damage(amount: number, type = 'physical', source?: any) {
    const d = resistDamage(amount, type, this.def.resist);
    this.health -= d; this.lastHit = G.game.tick;
    if (this.base) G.game.enemies.alertBase(this.base, source);
    if (this.health <= 0 && !this.dead) G.game.enemies.onDeath(this, source);
    return d;
  }
  update() {
    const g = G.game;
    if (this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + this.def.regen / 60);
    if (this.cooldown > 0) { this.cooldown--; return; }
    if ((g.tick + this.id) % 10 !== 0) return;
    if (g.peaceful && !(this.base && this.base.aggro > 0)) return;
    const t = g.enemies.findPlayerTarget(this.x, this.y, this.def.range);
    if (!t) return;
    this.cooldown = 92; // 0.65 attacks/s
    g.combat?.spitAcid(this.x, this.y - 1.5, t, this.def.damage, this.def.puddle, 1.4 + this.tier * 0.2, 0.6);
    this.anim += 2;
  }
  draw(r: Renderer) {
    const a = r.atlas;
    const f = Math.floor(G.game.renderTime * 6 + this.anim) % 8;
    const d = this.def;
    r.draw('objects', a.get('worm-' + f), this.x, this.y, rgba(d.tint[0], d.tint[1], d.tint[2], 1), 0, d.scale, this.y + 0.5);
  }
  serialize() { return { t: this.tier, b: this.base?.id }; }
  load(d: any) { this.tier = d.t || 0; (this as any)._baseId = d.b; }
}

// ---------------- Units ----------------
const S_IDLE = 0, S_GATHER = 1, S_ATTACK = 2, S_RETURN = 3;
export class EnemyUnit extends Entity {
  def: UnitDef;
  unitName: string;
  home: Spawner | null = null;
  state = S_IDLE;
  target: Entity | null = null;
  targetPos: [number, number] | null = null;
  cooldown = 0;
  face = 0;
  animT = Math.random() * 8;
  attacking = 0;
  group: AttackGroup | null = null;
  wanderT = 0;
  stuck = 0;
  slow = 0;
  isEnemyUnit = true;
  constructor(name: string, x: number, y: number) {
    super('enemy-unit', x, y, 0);
    this.unitName = name;
    this.def = UNITS[name];
    this.health = this.def.hp;
    this.w = this.h = 0.6 * this.def.scale + 0.2;
  }
  get maxHealth() { return this.def.hp; }
  get isBuilding() { return false; }
  get minable() { return false; }
  get blocksMovement() { return false; }
  damage(amount: number, type = 'physical', source?: any) {
    const d = resistDamage(amount, type, this.def.resist);
    this.health -= d; this.lastHit = G.game.tick;
    if (source && (source instanceof Character || source.isBuilding || source.isFriendlyUnit)) { this.target = source; this.state = S_ATTACK; }
    if (this.health <= 0 && !this.dead) G.game.enemies.onDeath(this, source);
    return d;
  }
  update() {
    const g = G.game, en = g.enemies;
    if (this.health < this.def.hp) this.health = Math.min(this.def.hp, this.health + this.def.regen / 60);
    if (this.cooldown > 0) this.cooldown--;
    if (this.attacking > 0) this.attacking--;
    if (this.slow > 0) this.slow--;
    const spd = this.def.speed * (this.slow > 0 ? 0.5 : 1);
    // acquire nearby targets (player, combat robots, turrets)
    if ((g.tick + this.id) % 15 === 0 && !(g.peaceful && this.state === S_IDLE && !(this.home?.base && this.home.base.aggro > 0))) {
      if (!this.target || this.target.dead) this.target = null;
      const aggroR = this.state === S_ATTACK ? 15 : this.state === S_IDLE ? 9 : 12;
      const t = en.findPlayerTarget(this.x, this.y, aggroR, true);
      if (t && (!this.target || dist(this, t) < dist(this, this.target) - 2)) { this.target = t; if (this.state === S_IDLE) this.state = S_ATTACK; }
    }
    if (this.target && !this.target.dead) {
      const t = this.target;
      const bx = Math.max(0, Math.abs(this.x - t.x) - t.w / 2), by = Math.max(0, Math.abs(this.y - t.y) - t.h / 2);
      const d = Math.hypot(bx, by);
      if (d <= this.def.range + 0.4) { this.attack(t); return; }
      this.moveToward(this.target.x, this.target.y, spd);
      return;
    }
    this.target = null;
    if (this.state === S_ATTACK && this.group) {
      const gt = this.group.targetPos;
      if (dist2(this.x, this.y, gt[0], gt[1]) < 9) {
        // look for something to destroy near the target
        const t = en.nearestBuilding(this.x, this.y, 20);
        if (t) { this.target = t; return; }
        this.group.done = true;
        this.state = S_RETURN;
        return;
      }
      this.followPath(spd);
      return;
    }
    if (this.state === S_GATHER && this.group) {
      const rp = this.group.rally;
      if (dist2(this.x, this.y, rp[0], rp[1]) > 6) this.moveToward(rp[0], rp[1], spd * 0.8);
      else this.animT += 0;
      return;
    }
    if (this.state === S_RETURN || this.state === S_ATTACK) {
      if (this.home && !this.home.dead) {
        if (dist(this, this.home) > 8) { this.moveToward(this.home.x, this.home.y, spd * 0.7); return; }
      } else if (!this.home || this.home.dead) {
        // homeless: settle
      }
      this.state = S_IDLE; this.group = null;
    }
    // idle wandering
    if (--this.wanderT <= 0) {
      this.wanderT = 120 + Math.random() * 300;
      const hx = this.home ? this.home.x : this.x, hy = this.home ? this.home.y : this.y;
      this.targetPos = [hx + (Math.random() - 0.5) * 14, hy + (Math.random() - 0.5) * 14];
    }
    if (this.targetPos && dist2(this.x, this.y, this.targetPos[0], this.targetPos[1]) > 1) this.moveToward(this.targetPos[0], this.targetPos[1], spd * 0.35);
  }
  attack(t: Entity) {
    if ((t as any).vehicle) { t = (t as any).vehicle; this.target = t; }
    this.face = dirTo(t.x - this.x, t.y - this.y);
    if (this.cooldown > 0) return;
    this.cooldown = this.def.cooldown;
    this.attacking = 20;
    const g = G.game;
    if (this.def.kind === 'spitter') g.combat?.spitAcid(this.x, this.y - 0.4, t, this.def.damage, this.def.puddle || 0, 1, this.def.slow || 0.6);
    else { t.damage(this.def.damage, this.def.dtype, this); g.sound.play('bite', 0.5, this.x, this.y); }
    if (t.isBuilding) g.ui?.alert('attack', t);
  }
  moveToward(tx: number, ty: number, spd: number) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) return;
    let vx = dx / d * Math.min(spd, d), vy = dy / d * Math.min(spd, d);
    // separation from other units
    this.step(vx, vy);
  }
  step(vx: number, vy: number) {
    const w = G.game.world;
    const nx = this.x + vx, ny = this.y + vy;
    const blocker = this.blockedBy(nx, ny);
    if (!blocker) { this.x = nx; this.y = ny; this.stuck = 0; }
    else if (blocker !== 'water' && blocker.isBuilding && !(blocker as any).enemyBase) {
      // attack obstacle
      this.target = blocker;
    } else {
      // slide
      if (!this.blockedBy(this.x + vx, this.y)) this.x += vx;
      else if (!this.blockedBy(this.x, this.y + vy)) this.y += vy;
      else if (++this.stuck > 30) { this.x += (Math.random() - 0.5) * 0.3; this.y += (Math.random() - 0.5) * 0.3; this.stuck = 0; }
    }
    this.face = dirTo(vx, vy);
    this.animT += Math.hypot(vx, vy) * 2.2 / this.def.scale;
  }
  blockedBy(x: number, y: number): Entity | 'water' | null {
    const w = G.game.world;
    const tx = Math.floor(x), ty = Math.floor(y);
    const c = w.chunkAt(tx, ty);
    if (!c) return 'water';
    if (isWaterTile(c.tiles[((ty & 31) << 5) | (tx & 31)])) return 'water';
    const o = c.occ[((ty & 31) << 5) | (tx & 31)];
    if (o && o.blocksMovement && !(o as any).enemyBase && o.type !== 'tree') {
      const inset = o.collisionInset;
      if (x > o.x - o.w / 2 + inset - 0.1 && x < o.x + o.w / 2 - inset + 0.1 && y > o.y - o.h / 2 + inset - 0.1 && y < o.y + o.h / 2 - inset + 0.1) return o;
    }
    return null;
  }
  followPath(spd: number) {
    const gr = this.group!;
    const ff = gr.field;
    if (!ff) { this.moveToward(gr.targetPos[0], gr.targetPos[1], spd); return; }
    const tx = Math.floor(this.x), ty = Math.floor(this.y);
    let best = ff.get(tx, ty), bx = tx, by = ty;
    if (best < 0) { this.moveToward(gr.targetPos[0], gr.targetPos[1], spd); return; }
    for (const [dx, dy] of NEIGH8) {
      const v = ff.get(tx + dx, ty + dy);
      if (v >= 0 && v < best) { best = v; bx = tx + dx; by = ty + dy; }
    }
    this.moveToward(bx + 0.5, by + 0.5, spd);
  }
  draw(r: Renderer) {
    const a = r.atlas;
    const d = this.def;
    const tint = rgba(d.tint[0], d.tint[1], d.tint[2], 1);
    const fr = this.attacking > 0 ? `${d.kind}-attack-${this.face}-${Math.floor((20 - this.attacking) / 5) % 4}` : `${d.kind}-run-${this.face}-${Math.floor(this.animT) % BUG_FRAMES}`;
    r.draw('objects', a.get(fr), this.x, this.y, tint, 0, d.scale * 1.75, this.y);
    if (this.health < d.hp && G.game.tick - this.lastHit < 300) {
      const f = this.health / d.hp;
      r.drawRect('overlay', a.get('white'), this.x, this.y - d.scale - 0.2, d.scale * 1.2, 0.08, rgba(0, 0, 0, 0.6));
      r.drawRect('overlay', a.get('white'), this.x - d.scale * 0.6 * (1 - f), this.y - d.scale - 0.2, d.scale * 1.2 * f, 0.06, rgba(0.9, 0.2, 0.15, 1));
    }
  }
}
const NEIGH8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const dist = (a: Entity, b: Entity) => Math.hypot(a.x - b.x, a.y - b.y);
const dist2 = (x0: number, y0: number, x1: number, y1: number) => (x0 - x1) ** 2 + (y0 - y1) ** 2;
function dirTo(dx: number, dy: number) { const a = Math.atan2(dx, -dy); return ((Math.round(a / (Math.PI * 2 / BUG_DIRS)) % BUG_DIRS) + BUG_DIRS) % BUG_DIRS; }

// Flow field toward a target (Dijkstra with building costs)
class FlowField {
  x0: number; y0: number; w: number; h: number; d: Int32Array;
  constructor(x0: number, y0: number, w: number, h: number) { this.x0 = x0; this.y0 = y0; this.w = w; this.h = h; this.d = new Int32Array(w * h).fill(-1); }
  get(x: number, y: number) { const lx = x - this.x0, ly = y - this.y0; if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) return -1; return this.d[ly * this.w + lx]; }
  static build(tx: number, ty: number, fx: number, fy: number): FlowField {
    const g = G.game, w = g.world;
    const pad = 24;
    const W = Math.min(320, Math.abs(tx - fx) + pad * 2), H = Math.min(320, Math.abs(ty - fy) + pad * 2);
    let x0 = Math.min(tx, fx) - pad, y0 = Math.min(ty, fy) - pad;
    // long attacks: anchor the window on the target so it is always inside the field
    if (tx - x0 >= W - pad / 2) x0 = tx - W + pad;
    if (ty - y0 >= H - pad / 2) y0 = ty - H + pad;
    const ff = new FlowField(x0, y0, W, H);
    const cost = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = w.tile(x0 + x, y0 + y);
      if (isWaterTile(t) || t === 0) { cost[y * W + x] = 255; continue; }
      const o = w.occAt(x0 + x, y0 + y);
      cost[y * W + x] = o && o.blocksMovement ? (o.isBuilding ? 12 : o.type === 'tree' ? 3 : 40) : 1;
    }
    // bucket Dijkstra
    const buckets: number[][] = [];
    if (tx - x0 < 0 || tx - x0 >= W || ty - y0 < 0 || ty - y0 >= H) return ff;
    const start = (ty - y0) * W + (tx - x0);
    ff.d[start] = 0; buckets[0] = [start];
    for (let b = 0; b < buckets.length; b++) {
      const q = buckets[b]; if (!q) continue;
      for (let qi = 0; qi < q.length; qi++) {
        const i = q[qi];
        if (ff.d[i] !== b) continue;
        const x = i % W, y = (i / W) | 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          const c = cost[j]; if (c === 255) continue;
          const nd = b + c;
          if (ff.d[j] === -1 || nd < ff.d[j]) { ff.d[j] = nd; (buckets[nd] = buckets[nd] || []).push(j); }
        }
      }
      if (b > 20000) break;
    }
    return ff;
  }
}

export class AttackGroup {
  units: EnemyUnit[] = [];
  rally: [number, number];
  targetPos: [number, number];
  field: FlowField | null = null;
  launchAt: number;
  launched = false;
  done = false;
  constructor(rally: [number, number], target: [number, number], launchAt: number) { this.rally = rally; this.targetPos = target; this.launchAt = launchAt; }
}

// ---------------- System ----------------
export class EnemySystem {
  bases: EnemyBase[] = [];
  units: EnemyUnit[] = [];
  groups: AttackGroup[] = [];
  evo = 0;             // evolution factor 0..1
  nextBaseId = 1;
  nextExpansion = 60 * 60 * 10;
  lastActivate = 0;
  constructor() { }
  get evolution() { return this.evo; }
  addEvo(inc: number) { this.evo += inc * (1 - this.evo); }
  get enabled() { return !G.game.settings.noEnemies; }
  isEnemy(e: Entity) { return e instanceof EnemyUnit || e instanceof Spawner || e instanceof Worm; }

  pending: { kind: string; x: number; y: number; variant: number }[] = [];
  corpses: Remnants[] = [];
  // Entities of a base can straddle chunks that are not generated yet: defer them until they are.
  retryPending() {
    if (!this.pending.length) return;
    const w = G.game.world;
    const ready = this.pending.filter(p => { const r = p.kind === 'spawner' ? 3 : 2; return !!(w.chunkAt(Math.floor(p.x - r), Math.floor(p.y - r)) && w.chunkAt(Math.floor(p.x + r), Math.floor(p.y + r)) && w.chunkAt(Math.floor(p.x - r), Math.floor(p.y + r)) && w.chunkAt(Math.floor(p.x + r), Math.floor(p.y - r))); });
    if (!ready.length) return;
    this.pending = this.pending.filter(p => !ready.includes(p));
    for (const p of ready) this.spawnBase(p);
  }
  spawnBase(g: { kind: string; x: number; y: number; variant: number }) {
    const game = G.game;
    { const w = game.world, r = g.kind === 'spawner' ? 3 : 2;
      for (const [dx, dy] of [[-r, -r], [r, r], [-r, r], [r, -r]]) if (!w.chunkAt(Math.floor(g.x + dx), Math.floor(g.y + dy))) { this.pending.push(g); return; } }
    // group by proximity
    let base = this.bases.find(b => Math.hypot(b.x - g.x, b.y - g.y) < 40);
    if (!base) { base = new EnemyBase(this.nextBaseId++, g.x, g.y); this.bases.push(base); }
    const w = game.world;
    if (g.kind === 'spawner') {
      const s = new Spawner('biter-spawner', Math.round(g.x), Math.round(g.y), 0);
      s.kind = g.variant === 1 ? 'spitter-spawner' : 'biter-spawner';
      s.variant = Math.floor(hash2(Math.floor(g.x), Math.floor(g.y), 5) * 2);
      if (!this.areaFree(s.tx, s.ty, 4, 4)) return;
      s.base = base; base.spawners.push(s);
      s.virtual = 4 + Math.floor(Math.random() * 3);
      w.addEntity(s);
    } else {
      const wm = new Worm('worm', Math.round(g.x), Math.round(g.y), 0);
      wm.tier = g.variant; wm.health = wm.def.hp;
      if (!this.areaFree(wm.tx, wm.ty, 2, 2)) return;
      wm.base = base; base.worms.push(wm);
      w.addEntity(wm);
      game.updatables[PHASE.COMBAT].push(wm);
    }
  }
  areaFree(x0: number, y0: number, w: number, h: number) {
    const world = G.game.world;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const c = world.chunkAt(x, y);
      if (!c) return false;
      if (isWaterTile(world.tile(x, y))) return false;
      const o = world.occAt(x, y);
      if (o) { if (o.type === 'tree' || o.type === 'simple-entity') G.game.removeEntity(o); else return false; }
    }
    return true;
  }

  onPollution(amount: number) { this.addEvo(0.0000009 * amount); }
  absorbPollution(c: any) {
    if (!this.enabled || G.game.peaceful) return;
    const x0 = c.cx * CHUNK, y0 = c.cy * CHUNK;
    for (const b of this.bases) {
      if (b.x < x0 - 64 || b.x >= x0 + CHUNK + 64 || b.y < y0 - 64 || b.y >= y0 + CHUNK + 64) continue;
      for (const s of b.spawners) {
        if (s.dead || c.pollution <= 0) continue;
        if (s.x < x0 || s.x >= x0 + CHUNK || s.y < y0 || s.y >= y0 + CHUNK) continue;
        const take = Math.min(c.pollution, c.pollution > 20 ? 20 + 0.01 * c.pollution : c.pollution);
        c.pollution -= take;
        b.pollutionBudget += take;
      }
    }
  }
  alertBase(b: EnemyBase, source: any) {
    b.aggro = 60 * 20;
    const t = source && !source.dead ? source : null;
    for (const s of b.spawners) {
      this.materialize(s, 6);
      for (const u of s.owned) if (!u.dead && u.state === S_IDLE) { u.state = S_ATTACK; if (t && (t instanceof Character || t.isBuilding || t.isFriendlyUnit)) u.target = t; }
    }
  }
  findPlayerTarget(x: number, y: number, r: number, includeBuildings = false): Entity | null {
    const g = G.game;
    let best: Entity | null = null, bd = r;
    const ch = g.player.character;
    if (!ch.dead && !g.player.dead) {
      const d = Math.hypot(ch.x - x, ch.y - y);
      if (d < bd) { bd = d; best = ch.vehicle || ch; }
    }
    for (const u of g.world.units) {
      if (!(u as any).isFriendlyUnit && !(u as any).isVehicle) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bd) { bd = d; best = u; }
    }
    if (includeBuildings || true) {
      const ents = g.world.entitiesIn(x - r, y - r, x + r, y + r, e => e.isBuilding && (e.type.includes('turret') || includeBuildings && !e.proto.walkable), 4);
      for (const e of ents) {
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bd && (e.type.includes('turret') || d < r * 0.6)) { bd = d; best = e; }
      }
    }
    return best;
  }
  nearestBuilding(x: number, y: number, r: number): Entity | null {
    const ents = G.game.world.entitiesIn(x - r, y - r, x + r, y + r, e => e.isBuilding && !e.dead && e.type !== 'straight-rail' && e.type !== 'curved-rail', 6);
    let best: Entity | null = null, bd = 1e9;
    for (const e of ents) { const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  // turn virtual units into real units around spawner
  materialize(s: Spawner, max = 99) {
    while (s.virtual > 0 && max-- > 0) {
      s.virtual--;
      this.spawnUnit(s, pickUnit(s.kind, this.evolution));
    }
  }
  spawnUnit(s: Spawner, name: string): EnemyUnit | null {
    const a = Math.random() * Math.PI * 2;
    const u = new EnemyUnit(name, s.x + Math.cos(a) * 3, s.y + Math.sin(a) * 3);
    if (u.blockedBy(u.x, u.y)) { u.x = s.x + Math.cos(a) * 2.5; u.y = s.y + 2.5; }
    u.home = s;
    s.owned.push(u);
    this.units.push(u);
    G.game.world.addUnit(u);
    return u;
  }
  onDeath(e: Entity, source?: any) {
    const g = G.game;
    if (e.dead) return;
    if (e instanceof EnemyUnit) {
      e.dead = true;
      g.world.removeUnit(e);
      const r = new Remnants('remnants', e.x, e.y, 0);
      r.sprite = e.def.kind + '-corpse'; r.size = e.def.scale * 1.6; r.born = g.tick;
      g.world.addEntity(r, false);
      this.corpses.push(r);
      g.fx?.blood(e.x, e.y);
      g.stats.kill(e.unitName);
      g.sound.play('biter-death', 0.5, e.x, e.y);
      return;
    }
    // spawner / worm
    g.removeEntity(e);
    g.fx?.explosion(e.x, e.y, e instanceof Spawner ? 2 : 1.2);
    g.fx?.blood(e.x, e.y);
    g.stats.kill(e instanceof Spawner ? e.kind : 'worm');
    if (e instanceof Spawner) {
      this.addEvo(0.002);
      for (const u of e.owned) if (!u.dead) { u.home = null; }
      const r = new Remnants('remnants', e.x, e.y, 0); r.size = 2.2; r.born = g.tick; g.world.addEntity(r, false);
      this.corpses.push(r);
    }
  }

  tick() {
    if (!this.enabled) return;
    const g = G.game;
    this.addEvo(0.000004 / 60);
    const p = g.player;
    // activate bases near the player (materialize units), deactivate far ones
    if (g.tick % 60 === 0) {
      for (const b of this.bases) {
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        if (d < 90) for (const s of b.spawners) if (!s.dead) this.materialize(s, 2);
        if (d > 160 && b.aggro <= 0) {
          for (const s of b.spawners) {
            for (const u of s.owned) if (!u.dead && u.state === S_IDLE && !u.group) { u.dead = true; g.world.removeUnit(u); s.virtual++; }
            s.owned = s.owned.filter(u => !u.dead);
          }
        }
        if (b.aggro > 0) b.aggro -= 60;
      }
      this.units = this.units.filter(u => !u.dead);
      // corpses fade after 5 minutes
      if (this.corpses.length && g.tick % 600 === 0) {
        const keep: Remnants[] = [];
        for (const c of this.corpses) { if (g.tick - c.born > 18000) { if (!c.dead) { c.dead = true; g.world.removeEntity(c); } } else keep.push(c); }
        this.corpses = keep.length > 400 ? (keep.slice(0, keep.length - 400).forEach(c => { c.dead = true; g.world.removeEntity(c); }), keep.slice(-400)) : keep;
      }
    }
    // spawner production: refill pools
    if (g.tick % 30 === 0) {
      const cd = Math.round(360 - 210 * this.evolution);
      for (const b of this.bases) for (const s of b.spawners) {
        if (s.dead) continue;
        if (s.health < s.maxHealth) s.health = Math.min(s.maxHealth, s.health + 1.2 / 2);
        s.cooldown -= 30;
        if (s.cooldown > 0) continue;
        s.cooldown = cd;
        const total = s.virtual + s.owned.filter(u => !u.dead).length;
        if (total < 7) {
          if (Math.hypot(b.x - p.x, b.y - p.y) < 90) this.spawnUnit(s, pickUnit(s.kind, this.evolution));
          else s.virtual++;
        }
      }
    }
    // pollution attacks
    if (g.tick % 120 === 0 && !g.peaceful) this.planAttacks();
    // update units
    for (const u of this.units) if (!u.dead) u.update();
    // groups
    for (const gr of this.groups) {
      if (!gr.launched && g.tick >= gr.launchAt) {
        gr.launched = true;
        const fx = Math.floor(gr.rally[0]), fy = Math.floor(gr.rally[1]);
        gr.field = FlowField.build(Math.floor(gr.targetPos[0]), Math.floor(gr.targetPos[1]), fx, fy);
        for (const u of gr.units) if (!u.dead) u.state = S_ATTACK;
      }
      gr.units = gr.units.filter(u => !u.dead);
      if (gr.launched && (!gr.units.length || gr.done)) gr.done = true;
      // give up after 5 minutes (unreachable target, blocked by water...)
      if (gr.launched && g.tick - gr.launchAt > 60 * 60 * 5) {
        for (const u of gr.units) if (u.group === gr) { u.group = null; u.state = S_RETURN; u.target = null; }
        gr.done = true;
      }
    }
    this.groups = this.groups.filter(gr => !gr.done || gr.units.some(u => !u.dead && u.state === S_ATTACK));
    // expansion
    if (g.tick >= this.nextExpansion) { this.nextExpansion = g.tick + 60 * 60 * (4 + Math.random() * 56); this.expand(); }
  }

  planAttacks() {
    const g = G.game;
    for (const b of this.bases) {
      if (!b.alive || b.pollutionBudget < 4) continue;
      const live = b.spawners.filter(s => !s.dead);
      if (!live.length) continue;
      // convert budget into attack members
      while (b.pollutionBudget > 0) {
        const s = live[Math.floor(Math.random() * live.length)];
        const name = pickUnit(s.kind, this.evolution);
        const cost = UNITS[name].pollution;
        if (b.pollutionBudget < cost) break;
        b.pollutionBudget -= cost;
        b.pendingAttack.push(name);
        if (b.pendingAttack.length > 60) break;
      }
      if (b.nextAttack === 0) b.nextAttack = g.tick + 60 * 60 * (1 + Math.random() * 9);
      if (b.pendingAttack.length >= 5 && g.tick >= b.nextAttack) {
        const target = this.nearestBuilding(b.x, b.y, 400) ;
        if (!target) { b.pendingAttack = []; continue; }
        const rally: [number, number] = [b.x + (target.x - b.x) * 0.08, b.y + (target.y - b.y) * 0.08];
        const gr = new AttackGroup(rally, [target.x, target.y], g.tick + 60 * 20);
        for (const name of b.pendingAttack) {
          const s = live[Math.floor(Math.random() * live.length)];
          const u = this.spawnUnit(s, name);
          if (u) { u.group = gr; u.state = S_GATHER; gr.units.push(u); }
        }
        b.pendingAttack = [];
        b.nextAttack = 0;
        this.groups.push(gr);
      }
    }
  }

  expand() {
    const g = G.game;
    const live = this.bases.filter(b => b.alive && b.spawners.some(s => !s.dead));
    if (!live.length) return;
    const src = live[Math.floor(Math.random() * live.length)];
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2, d = CHUNK * (2 + Math.random() * 5);
      const x = src.x + Math.cos(a) * d, y = src.y + Math.sin(a) * d;
      if (!g.world.chunkAt(Math.floor(x), Math.floor(y))) continue;
      // keep away from player buildings
      if (g.world.entitiesIn(x - 48, y - 48, x + 48, y + 48, e => e.isBuilding, 4).length) continue;
      if (Math.hypot(x, y) < 200) continue;
      const n = 1 + Math.floor(Math.random() * 2 + this.evolution * 2);
      for (let i = 0; i < n; i++) this.spawnBase({ kind: 'spawner', x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, variant: Math.random() < 0.4 ? 1 : 0 });
      const evo = this.evolution;
      const wt = evo > 0.9 ? 3 : evo > 0.5 ? 2 : evo > 0.3 ? 1 : 0;
      if (Math.random() < 0.7) this.spawnBase({ kind: 'worm', x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 14, variant: wt });
      return;
    }
  }

  serialize() {
    return { ev: this.evo, nb: this.nextBaseId, ne: this.nextExpansion, pend: this.pending, bases: this.bases.map(b => ({ id: b.id, x: b.x, y: b.y, pb: b.pollutionBudget })) };
  }
  load(d: any) {
    if (!d) return;
    this.evo = d.ev ?? (d.evo ? d.evo / (1 + d.evo) : 0); this.nextBaseId = d.nb || 1; this.nextExpansion = d.ne || this.nextExpansion; this.pending = d.pend || [];
    const byId = new Map<number, EnemyBase>();
    this.bases = (d.bases || []).map((b: any) => { const eb = new EnemyBase(b.id, b.x, b.y); eb.pollutionBudget = b.pb || 0; byId.set(b.id, eb); return eb; });
    this.corpses = [];
    for (const e of G.game.world.entities.values()) {
      if (e instanceof Remnants && (e.sprite.endsWith('-corpse') || e.size === 2.2)) this.corpses.push(e);
      if (e instanceof Spawner || e instanceof Worm) {
        let b = byId.get((e as any)._baseId);
        if (!b) { b = new EnemyBase(this.nextBaseId++, e.x, e.y); this.bases.push(b); byId.set(b.id, b); }
        e.base = b;
        if (e instanceof Spawner) b.spawners.push(e); else b.worms.push(e);
      }
    }
  }
}
registerEntity(['biter-spawner'], Spawner);
registerEntity(['worm'], Worm);
