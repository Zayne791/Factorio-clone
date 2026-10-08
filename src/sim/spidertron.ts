// Spidertron: an 8-legged walker that steps over buildings and trees, carries a large trunk,
// auto-fires rockets at enemies and can be sent anywhere with the spidertron remote.
import { Vehicle, findEnemy, dmgMult } from './military';
import { registerEntity } from './entity';
import { Inventory } from './inventory';
import { G, Dir, clamp } from '../core';
import { ITEMS } from '../data/protos';
import type { Renderer } from '../engine/renderer';
import { WHITE, rgba, additive } from '../engine/renderer';
import { isWaterTile } from '../world/tiles';
import { h } from '../util/dom';

const LEGS = 8;
const SPEED = 0.26;       // tiles per tick at full stride
const BODY_H = 2.4;       // visual hover height in tiles

interface Leg { fx: number; fy: number; sx: number; sy: number; tx: number; ty: number; t: number; }

export class Spidertron extends Vehicle {
  legs: Leg[] = [];
  vx = 0; vy = 0;
  want: [number, number] = [0, 0];
  autopilot: [number, number] | null = null;
  gait = 0;
  rocketCD = 0;
  launcher = 0;
  label = '';
  constructor(p: string, x: number, y: number, d: Dir) {
    super(p, x, y, d);
    this.ammo = new Inventory(4);
    (this.ammo as any).accepts = (id: string) => ITEMS[id]?.ammo?.cat === 'rocket';
    this.w = this.h = 1.6;
    for (let i = 0; i < LEGS; i++) { const [hx, hy] = this.home(i); this.legs.push({ fx: hx, fy: hy, sx: hx, sy: hy, tx: hx, ty: hy, t: 1 }); }
  }
  get maxHealth() { return 3000; }
  home(i: number): [number, number] {
    const a = (i + 0.5) / LEGS * Math.PI * 2;
    const r = i % 2 ? 2.7 : 3.2;
    return [this.x + Math.cos(a) * r + this.vx * 10, this.y + Math.sin(a) * r * 0.85 + this.vy * 10];
  }
  inventories() { return [this.trunk, this.ammo]; }
  wantsFuel() { return 0; }
  insertItem(id: string, n: number) {
    if (ITEMS[id]?.ammo?.cat === 'rocket') { const k = this.ammo.insert(id, n); if (k) return k; }
    return this.trunk.insert(id, n);
  }
  damage(amount: number, type = 'physical', source?: any) {
    const res: Record<string, [number, number]> = { physical: [15, 0.6], explosion: [20, 0.75], acid: [0, 0.7], fire: [15, 0.6], impact: [50, 0.8] };
    const r = res[type];
    const d = r ? Math.max(amount > 0 ? 1 : 0, (amount - r[0]) * (1 - r[1])) : amount;
    this.health -= d; this.lastHit = G.game.tick;
    if (this.health <= 0 && !this.dead) {
      const g = G.game;
      if (this.driver) g.combat?.exitVehicle();
      g.fx?.explosion(this.x, this.y - 1, 3);
      g.sound.play('explosion', 1, this.x, this.y);
      this.dead = true;
      g.world.removeUnit(this);
      g.entityCountVersion++;
    }
    return d;
  }
  // Driven: absolute WASD directions like the character
  control(throttle: number, steer: number) {
    const mx = steer, my = -throttle;
    const len = Math.hypot(mx, my);
    this.want = len > 0.01 ? [mx / Math.max(1, len), my / Math.max(1, len)] : [0, 0];
    if (len > 0.01) this.autopilot = null;
  }
  blocked(x: number, y: number) {
    const w = G.game.world;
    const tx = Math.floor(x), ty = Math.floor(y);
    const c = w.chunkAt(tx, ty);
    if (!c) return true;
    // can wade over narrow water, but not into the middle of lakes
    if (isWaterTile(c.tiles[((ty & 31) << 5) | (tx & 31)])) {
      let water = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (w.isWater(tx + dx, ty + dy)) water++;
      return water > 18;
    }
    return false;
  }
  update() {
    const g = G.game;
    if (this.rocketCD > 0) this.rocketCD--;
    if (this.health < this.maxHealth && g.tick - this.lastHit > 600) this.health = Math.min(this.maxHealth, this.health + 0.2);
    // autopilot
    if (this.autopilot && !this.driver) {
      const [ax, ay] = this.autopilot;
      const dx = ax - this.x, dy = ay - this.y, d = Math.hypot(dx, dy);
      if (d < 0.6) { this.autopilot = null; this.want = [0, 0]; }
      else { const k = Math.min(1, d / 3); this.want = [dx / d * k, dy / d * k]; }
    } else if (!this.driver && !this.autopilot) this.want = [0, 0];
    // smooth acceleration toward wanted velocity
    const tvx = this.want[0] * SPEED, tvy = this.want[1] * SPEED;
    this.vx += clamp(tvx - this.vx, -0.012, 0.012); this.vy += clamp(tvy - this.vy, -0.012, 0.012);
    const nx = this.x + this.vx, ny = this.y + this.vy;
    if (this.blocked(nx, ny)) { this.vx *= -0.2; this.vy *= -0.2; }
    else { this.x = nx; this.y = ny; }
    this.speed = Math.hypot(this.vx, this.vy);
    if (this.speed > 0.01) this.orient = Math.atan2(this.vx, -this.vy);
    if (this.driver) { this.driver.x = this.x; this.driver.y = this.y; }
    // legs: alternate groups step when too far from their home point
    this.gait++;
    for (let i = 0; i < LEGS; i++) {
      const L = this.legs[i];
      if (L.t < 1) {
        L.t = Math.min(1, L.t + 0.14 + this.speed * 0.4);
        L.fx = L.sx + (L.tx - L.sx) * L.t; L.fy = L.sy + (L.ty - L.sy) * L.t;
        if (L.t >= 1 && this.speed > 0.05 && Math.random() < 0.3) g.sound.play('mine-building', 0.12, L.fx, L.fy);
        continue;
      }
      const [hx, hy] = this.home(i);
      const d = Math.hypot(hx - L.fx, hy - L.fy);
      const group = i % 2;
      const busy = this.legs.some((o, j) => j % 2 === group ? false : o.t < 1);
      if (d > 1.6 && !busy) { L.sx = L.fx; L.sy = L.fy; L.tx = hx; L.ty = hy; L.t = 0; }
    }
    // weapons: auto-fire rockets at nearby enemies
    if (this.rocketCD <= 0) {
      const sel = this.ammo.slots.findIndex(s => s && ITEMS[s.id]?.ammo?.cat === 'rocket');
      if (sel >= 0) {
        const t = findEnemy(this.x, this.y, 36);
        if (t) {
          const s = this.ammo.slots[sel]!;
          const am = ITEMS[s.id].ammo!;
          this.ammo.remove(s.id, 1);
          g.stats.consume(s.id, 1);
          const a = this.launcher++ / 4 * Math.PI * 2;
          const mx = this.x + Math.cos(a) * 0.5, my = this.y - BODY_H + Math.sin(a) * 0.3;
          g.combat.fireAmmo(s.id, am, mx, my, t.x, t.y, t, this, 36);
          this.rocketCD = Math.round(60 / (4 * (1 + (g.bonus.gunSpeed.rocket || 0))));
          void dmgMult;
        }
      }
    }
  }
  draw(r: Renderer) {
    const a = r.atlas, white = a.get('white');
    const bx = this.x, by = this.y - BODY_H + Math.sin(G.game.renderTime * 2 + this.id) * 0.06;
    // shadow of body
    r.draw('shadow', a.get('disc'), this.x + 0.6, this.y + 0.2, rgba(0, 0, 0, 0.5), 0, 1.6);
    // legs: hip -> knee (raised) -> foot
    for (let i = 0; i < LEGS; i++) {
      const L = this.legs[i];
      const ang = (i + 0.5) / LEGS * Math.PI * 2;
      const hx = bx + Math.cos(ang) * 0.45, hy = by + Math.sin(ang) * 0.3;
      const lift = L.t < 1 ? Math.sin(L.t * Math.PI) * 0.6 : 0;
      const fx = L.fx, fy = L.fy - lift;
      const kx = (hx + fx) / 2 + Math.cos(ang) * 0.4, ky = Math.min(hy, fy) - 1.3;
      const back = Math.sin(ang) < 0;
      const key = back ? by - 0.1 : this.y + 0.5;
      const col = rgba(0.16, 0.16, 0.15, 1), hi = rgba(0.36, 0.36, 0.34, 1);
      r.line('objects', white, hx, hy, kx, ky, 0.16, col, key);
      r.line('objects', white, kx, ky, fx, fy, 0.12, col, key);
      r.line('objects', white, kx, ky, fx, fy, 0.04, hi, key + 0.001);
      r.draw('objects', a.get('disc'), kx, ky, hi, 0, 0.22, key + 0.002);
      r.line('shadow', white, this.x + 0.5 + (hx - bx) * 0.5, this.y + 0.2, fx + 0.3, L.fy, 0.1, rgba(0, 0, 0, 0.4));
    }
    // body
    r.draw('objects', a.get('disc'), bx, by, rgba(0.12, 0.12, 0.12, 1), 0, 1.25, by + 0.05);
    r.draw('objects', a.get('disc'), bx - 0.12, by - 0.14, rgba(0.32, 0.32, 0.3, 1), 0, 0.95, by + 0.06);
    r.draw('objects', a.get('disc'), bx - 0.22, by - 0.26, rgba(0.55, 0.55, 0.52, 1), 0, 0.45, by + 0.07);
    // eyes facing the movement direction
    const fx = Math.sin(this.orient), fy = -Math.cos(this.orient);
    for (const k of [-1, 0, 1]) {
      const ex = bx + fx * 0.42 + fy * k * 0.18, ey = by + fy * 0.3 - fx * k * 0.12;
      r.draw('objects', a.get('disc'), ex, ey, additive(1, 0.15, 0.1, 1), 0, 0.12, by + 0.08);
      r.draw('light', a.get('light'), ex, ey, additive(1, 0.2, 0.1, 0.5), 0, 1.2);
    }
    if (G.game.darkness > 0.1) r.draw('light', a.get('light'), this.x + fx * 5, this.y + fy * 5, additive(1, 0.95, 0.85, 0.8), 0, 10);
    if (this.health < this.maxHealth && G.game.tick - this.lastHit < 600) {
      const f = this.health / this.maxHealth;
      r.drawRect('overlay', white, bx, by - 0.9, 1.6, 0.14, rgba(0, 0, 0, 0.7));
      r.drawRect('overlay', white, bx - 0.8 + 0.8 * f, by - 0.9, 1.6 * f, 0.1, rgba(0.25, 0.85, 0.2, 1));
    }
    if (this.autopilot) r.draw('overlay', a.get('ring'), this.autopilot[0], this.autopilot[1], rgba(0.4, 0.8, 1, 0.6), 0, 1);
  }
  serialize() { return { ...super.serialize(), ap: this.autopilot, lb: this.label }; }
  load(d: any) { super.load(d); this.autopilot = d.ap || null; this.label = d.lb || ''; for (let i = 0; i < LEGS; i++) { const [hx, hy] = this.home(i); Object.assign(this.legs[i], { fx: hx, fy: hy, sx: hx, sy: hy, tx: hx, ty: hy, t: 1 }); } }
  buildGUI(win: any, P: HTMLElement) {
    const ar = h('div', 'row', P); h('div', 'label', ar, 'Rockets');
    win.invGrid(ar, () => this.ammo, 4);
    const sp = h('div', 'mini-label', P);
    win.updaters.push(() => sp.textContent = `Speed ${Math.round(this.speed * 216)} km/h · ${this.autopilot ? 'Autopilot active' : 'Idle'} · Enter to ${this.driver ? 'exit' : 'drive'}`);
    h('div', 'subtitle', P, 'Trunk');
    const sc = h('div', 'scroll', P); sc.style.maxHeight = '40vh';
    win.invGrid(sc, () => this.trunk, 10);
  }
}
registerEntity(['spider-vehicle'], Spidertron);

// Spidertron remote: first click on a spidertron links it, later clicks send it to that position
export function useSpidertronRemote(x: number, y: number): boolean {
  const g = G.game, p = g.player;
  const cur = p.cursor;
  if (!cur || cur.id !== 'spidertron-remote') return false;
  const hit = g.world.units.find(u => u instanceof Spidertron && !u.dead && Math.hypot(u.x - x, u.y - y) < 1.8) as Spidertron | undefined;
  if (hit) { cur.data = { ...(cur.data || {}), spider: hit.id }; g.ui?.flyText(hit.x, hit.y - 3, 'Remote connected'); return true; }
  const id = cur.data?.spider;
  const sp = id ? g.world.entities.get(id) as Spidertron | undefined : undefined;
  if (!sp || sp.dead) { g.ui?.flyText(x, y, 'Click a spidertron to connect the remote', '#ff8a6a'); return true; }
  sp.autopilot = [x, y];
  g.sound.play('rotate', 0.4);
  return true;
}
