// The player: character unit, inventories, cursor, crafting queue, mining, building.
import { Entity, PHASE, registerEntity } from './entity';
import { Inventory, Stack, stackSize } from './inventory';
import { G, Dir, DIRS, clamp } from '../core';
import { ITEMS, RECIPES, RecipeProto, ENTITIES, RECIPES_FOR_ITEM, itemName } from '../data/protos';
import type { Renderer } from '../engine/renderer';
import { WHITE, rgba } from '../engine/renderer';
import { CHAR_FRAMES } from '../art/sprites-world';

export class Character extends Entity {
  vx = 0; vy = 0;
  face = 4;      // 0..7 (0 = north)
  animT = 0;
  moving = false;
  mining = false;
  shooting = false;
  regenDelay = 0;
  vehicle: Entity | null = null;
  slow = 0;
  constructor(p: string, x: number, y: number, d: Dir) { super('character', x, y, 0); this.w = 0.4; this.h = 0.4; this.health = 250; }
  get maxHealth() { return 250; }
  get isBuilding() { return false; }
  get blocksMovement() { return false; }
  get phase() { return PHASE.NONE; }
  get selectable() { return true; }
  get minable() { return false; }
  damage(amount: number, type = 'physical', source?: any) {
    const pl = G.game.player;
    // armor resistances
    const arm = pl.armor.slots[0];
    let d = amount;
    if (arm) {
      const res = ITEMS[arm.id].armor!.resist[type];
      if (res) d = Math.max(Math.min(1, amount), (amount - res[0]) * (1 - res[1]));
    }
    // energy shields
    d = pl.absorbShield(d);
    this.health -= d;
    this.regenDelay = 600;
    this.lastHit = G.game.tick;
    if (this.health <= 0 && !this.dead) pl.die();
    return d;
  }
  draw(r: Renderer) {
    if (this.vehicle) return;
    const a = r.atlas;
    const pl = G.game.player;
    const armor = pl.armor.slots[0]?.id;
    const suffix = armor === 'power-armor' || armor === 'power-armor-mk2' ? '-power' : armor === 'heavy-armor' || armor === 'modular-armor' ? '-heavy' : '';
    let sp: string;
    if (this.moving) sp = `char${suffix}-run-${this.face}-${Math.floor(this.animT) % CHAR_FRAMES}`;
    else if (this.mining) sp = `char${suffix}-mine-${this.face}-${Math.floor(this.animT * 0.5) % 4}`;
    else if (this.shooting) sp = `char${suffix}-shoot-${this.face}`;
    else sp = `char${suffix}-idle-${this.face}`;
    r.draw('objects', a.get(sp), this.x, this.y, WHITE, 0, 1.0, this.y + 0.2);
    if (this.health < this.maxHealth && G.game.tick - this.lastHit < 600) {
      const f = this.health / this.maxHealth;
      r.drawRect('overlay', a.get('white'), this.x, this.y - 2.0, 1.0, 0.12, rgba(0, 0, 0, 0.7));
      r.drawRect('overlay', a.get('white'), this.x - 0.5 + 0.5 * f, this.y - 2.0, 1.0 * f, 0.08, rgba(f < 0.3 ? 1 : 0.2, f < 0.3 ? 0.2 : 0.85, 0.2, 1));
    }
  }
}
registerEntity(['character'], Character);

export interface CraftJob { recipe: string; count: number; progress: number; reserved: Stack[]; userCount: number; }

export class Player {
  character: Character;
  main: Inventory;
  guns = new Inventory(3);
  ammo = new Inventory(3);
  armor = new Inventory(1);
  trash = new Inventory(10);
  cursor: Stack | null = null;
  cursorGhost: string | null = null;       // item id of ghost cursor
  cursorFrom = -1;
  quickbar: (string | null)[] = new Array(20).fill(null);
  craftQueue: CraftJob[] = [];
  selectedGun = 0;
  mineTarget: Entity | [number, number] | null = null;
  mineProgress = 0;
  mineSoundT = 0;
  respawnT = -1;
  spawnX = 0; spawnY = 0;
  moveX = 0; moveY = 0;
  running = false;
  shieldHP = 0;
  logisticRequests: { id: string; min: number; max: number }[] = [];
  personalLogistics = true;
  armorGrid: { id: string; x: number; y: number; energy: number }[] = [];
  battery = 0;
  shootCooldown = 0;
  shootTarget: [number, number] | null = null;
  craftedHistory: Record<string, number> = {};

  constructor(x: number, y: number) {
    this.character = new Character('character', x, y, 0);
    this.spawnX = x; this.spawnY = y;
    this.main = new Inventory(80);
  }
  get x() { return this.character.x; }
  get y() { return this.character.y; }
  get dead() { return this.character.dead || this.respawnT >= 0; }
  get reach() { return 10; }
  get resourceReach() { return 2.7; }
  get miningSpeed() { return 0.5 * (1 + G.game.bonus.miningSpeed); }

  inventorySize() {
    const arm = this.armor.slots[0];
    return 80 + G.game.bonus.inventorySlots + (arm ? ITEMS[arm.id].armor!.invBonus || 0 : 0);
  }
  resizeInventory() {
    const spill = this.main.resize(this.inventorySize());
    for (const s of spill) G.game.spillItem(this.x, this.y, s.id, s.n);
  }

  // ---- inventory helpers ----
  count(id: string) { return this.main.count(id) + (this.cursor && this.cursor.id === id ? this.cursor.n : 0); }
  give(id: string, n: number, spill = true): number {
    let left = n;
    // fill cursor stack of same item first? no: inventory first, like Factorio
    if (ITEMS[id]?.gun && this.guns.slots.some(s => !s)) left -= this.guns.insert(id, Math.min(left, 1));
    if (ITEMS[id]?.ammo && left > 0) {
      const gunCats = this.guns.slots.map(s => s ? ITEMS[s.id].gun!.cat : null);
      if (gunCats.includes(ITEMS[id].ammo!.cat)) left -= this.ammo.insert(id, left);
    }
    if (ITEMS[id]?.armor && !this.armor.slots[0] && left > 0) { left -= this.armor.insert(id, 1); this.onArmorChanged(); }
    if (left > 0) left -= this.main.insert(id, left);
    if (left > 0 && spill) { G.game.spillItem(this.x, this.y, id, left); G.game.ui?.flyText(this.x, this.y, `Inventory full`, '#ff8a6a'); }
    return n - left;
  }
  take(id: string, n: number): number {
    let got = this.main.remove(id, n);
    if (got < n && this.cursor && this.cursor.id === id) {
      const k = Math.min(n - got, this.cursor.n);
      this.cursor.n -= k; got += k;
      if (this.cursor.n <= 0) this.cursor = null;
    }
    return got;
  }
  onArmorChanged() {
    this.resizeInventory();
    const arm = this.armor.slots[0];
    if (!arm) { this.armorGrid = []; return; }
    if (arm.data?.grid) this.armorGrid = arm.data.grid; else { if (!arm.data) arm.data = {}; arm.data.grid = this.armorGrid = []; }
  }

  // ---- cursor ----
  pickToCursor(slot: number) {
    const s = this.main.slots[slot];
    if (this.cursor) {
      // put cursor into slot (swap/merge)
      if (!s) { this.main.slots[slot] = this.cursor; this.cursor = null; }
      else if (s.id === this.cursor.id && !s.data) {
        const k = Math.min(stackSize(s.id) - s.n, this.cursor.n);
        s.n += k; this.cursor.n -= k;
        if (this.cursor.n <= 0) this.cursor = null;
      } else { this.main.slots[slot] = this.cursor; this.cursor = s; }
      this.main.changed();
      return;
    }
    if (s) { this.cursor = s; this.main.slots[slot] = null; this.cursorFrom = slot; this.main.changed(); }
  }
  clearCursor() {
    if (this.cursor?.data?.temp) this.cursor = null;
    if (this.cursor) {
      const c = this.cursor; this.cursor = null;
      if (this.cursorFrom >= 0 && !this.main.slots[this.cursorFrom]) { this.main.slots[this.cursorFrom] = c; this.main.changed(); }
      else { const n = this.main.insertStack(c); if (n < c.n) G.game.spillItem(this.x, this.y, c.id, c.n - n); }
    }
    this.cursorGhost = null;
    this.cursorFrom = -1;
  }
  selectItem(id: string) {
    // pipette / quickbar: move a stack of this item into the cursor
    this.clearCursor();
    for (let i = 0; i < this.main.slots.length; i++) {
      const s = this.main.slots[i];
      if (s && s.id === id) { this.cursor = s; this.main.slots[i] = null; this.cursorFrom = i; this.main.changed(); return true; }
    }
    if (ITEMS[id]?.place || ITEMS[id]?.placeTile) { this.cursorGhost = id; return true; }
    return false;
  }
  cursorItem(): string | null { return this.cursor?.id ?? this.cursorGhost; }

  // ---- crafting ----
  canCraft(rid: string, count = 1): number {
    // returns max craftable (bounded by count) considering intermediates
    let lo = 0;
    for (let n = 1; n <= count; n++) { if (this.plan(rid, n)) lo = n; else break; }
    return lo;
  }
  craftableCount(rid: string): number {
    // quick estimate up to 999
    let hi = 1, best = 0;
    while (hi <= 4096 && this.plan(rid, hi)) { best = hi; hi *= 2; }
    let lo = best; hi = Math.min(hi, 4096);
    while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (this.plan(rid, mid)) lo = mid; else hi = mid; }
    return lo;
  }
  // Build crafting plan: returns jobs (intermediates first) or null if impossible
  plan(rid: string, count: number): CraftJob[] | null {
    const avail = this.main.contents();
    const jobs: CraftJob[] = [];
    const enabled = G.game.research.enabledRecipes;
    const need = (id: string, n: number, depth: number): boolean => {
      const have = avail.get(id) || 0;
      if (have >= n) { avail.set(id, have - n); return true; }
      const missing = n - have;
      avail.set(id, 0);
      if (depth > 6) return false;
      const rids = (RECIPES_FOR_ITEM[id] || []).filter(r => RECIPES[r].hand && enabled.has(r) && RECIPES[r].res.length === 1);
      if (!rids.length) return false;
      const r = RECIPES[rids[0]];
      const per = r.res[0].n;
      const times = Math.ceil(missing / per);
      for (const ing of r.ing) if (!need(ing.id, ing.n * times, depth + 1)) return false;
      jobs.push({ recipe: r.id, count: times, progress: 0, reserved: [], userCount: 0 });
      const extra = times * per - missing;
      if (extra > 0) avail.set(id, (avail.get(id) || 0) + extra);
      return true;
    };
    const r = RECIPES[rid];
    if (!r || !r.hand || !enabled.has(rid)) return null;
    for (const ing of r.ing) if (!need(ing.id, ing.n * count, 0)) return null;
    jobs.push({ recipe: rid, count, progress: 0, reserved: [], userCount: count });
    return jobs;
  }
  queueCraft(rid: string, count: number): boolean {
    let n = count;
    let jobs = this.plan(rid, n);
    while (!jobs && n > 1) { n = Math.floor(n / 2); jobs = this.plan(rid, n); }
    if (!jobs) { G.game.ui?.flyText(this.x, this.y, 'Missing ingredients', '#ff8a6a'); return false; }
    // reserve base ingredients for each job: only take what isn't produced by earlier jobs in the plan
    const produced = new Map<string, number>();
    for (const j of jobs) {
      const r = RECIPES[j.recipe];
      for (const ing of r.ing) {
        let req = ing.n * j.count;
        const fromPlan = Math.min(req, produced.get(ing.id) || 0);
        if (fromPlan > 0) { produced.set(ing.id, (produced.get(ing.id) || 0) - fromPlan); req -= fromPlan; }
        if (req > 0) { const got = this.main.remove(ing.id, req); j.reserved.push({ id: ing.id, n: got }); }
      }
      produced.set(r.res[0].id, (produced.get(r.res[0].id) || 0) + r.res[0].n * j.count);
      (j as any).fromPlan = true;
    }
    // intermediate results are consumed internally: mark which jobs feed others
    for (let i = 0; i < jobs.length - 1; i++) (jobs[i] as any).intermediate = true;
    this.craftQueue.push(...jobs);
    return true;
  }
  cancelCraft(idx: number, count = 1) {
    const j = this.craftQueue[idx];
    if (!j) return;
    const k = Math.min(count, j.count);
    for (const st of j.reserved) {
      const back = Math.round(st.n * k / j.count);
      if (back > 0) { this.give(st.id, back); st.n -= back; }
    }
    j.count -= k;
    if (j.count <= 0) { this.craftQueue.splice(idx, 1); if (idx === 0 && this.craftQueue[0] && (this.craftQueue[0] as any).fromPlan) this.claimIntermediates(this.craftQueue[0]); }
  }
  updateCrafting() {
    const j = this.craftQueue[0];
    if (!j) return;
    const r = RECIPES[j.recipe];
    j.progress += 1 / (r.time * 60) * (G.game.cheatFastCraft ? 20 : 1);
    while (j.progress >= 1 && j.count > 0) {
      j.progress -= 1;
      j.count--;
      for (const ing of r.ing) { const st = j.reserved.find(x => x.id === ing.id); if (st) st.n = Math.max(0, st.n - ing.n); }
      for (const p of r.res) {
        G.game.stats.produce(p.id, p.n);
        if ((j as any).intermediate) {
          // goes to inventory; later job will take it
          this.main.insert(p.id, p.n);
        } else this.give(p.id, p.n);
      }
      // later jobs consume intermediates from inventory when they start
      G.game.sound.play('craft', 0.3);
      if (j.count <= 0) {
        this.craftQueue.shift();
        const nj = this.craftQueue[0];
        if (nj && (nj as any).fromPlan) this.claimIntermediates(nj);
        break;
      }
    }
  }
  private claimIntermediates(j: CraftJob) {
    // take ingredients not already reserved
    const r = RECIPES[j.recipe];
    for (const ing of r.ing) {
      const res = j.reserved.find(s => s.id === ing.id);
      const have = res ? res.n : 0;
      const need = ing.n * j.count - have;
      if (need > 0) { const got = this.main.remove(ing.id, need); if (res) res.n += got; else j.reserved.push({ id: ing.id, n: got }); }
    }
  }

  // ---- mining ----
  canReach(x: number, y: number, dist = this.reach) { return Math.hypot(x - this.x, y - this.y) <= dist; }
  mineTime(t: Entity | [number, number]): number {
    if (Array.isArray(t)) {
      const [rid] = G.game.world.res(t[0], t[1]);
      return rid === 'uranium-ore' ? 2 : 1;
    }
    return (t as any).mineTime ?? t.proto.mineTime ?? 0.5;
  }
  updateMining(active: boolean, target: Entity | [number, number] | null) {
    const ch = this.character;
    if (!active || !target) { this.mineTarget = null; this.mineProgress = 0; ch.mining = false; return; }
    const same = this.mineTarget && target && (Array.isArray(target) ? Array.isArray(this.mineTarget) && this.mineTarget[0] === target[0] && this.mineTarget[1] === target[1] : this.mineTarget === target);
    if (!same) { this.mineTarget = target; this.mineProgress = 0; }
    const tx = Array.isArray(target) ? target[0] + 0.5 : target.x, ty = Array.isArray(target) ? target[1] + 0.5 : target.y;
    const natural = Array.isArray(target) || !target.isBuilding;
    if (!this.canReach(tx, ty, natural ? this.resourceReach + (Array.isArray(target) ? 0 : 1.2) : this.reach)) { ch.mining = false; return; }
    ch.mining = true;
    ch.face = faceTo(tx - ch.x, ty - ch.y);
    ch.animT += 0.18;
    const t = this.mineTime(target);
    this.mineProgress += this.miningSpeed / (t * 60) * (G.game.cheatFastCraft ? 10 : 1);
    if (G.game.tick % 20 === 0) G.game.sound.play(Array.isArray(target) ? 'mine-ore' : natural ? 'mine-wood' : 'mine-building', 0.4);
    if (this.mineProgress >= 1) {
      this.mineProgress = 0;
      G.game.playerMine(target);
    }
  }

  // ---- energy shield / equipment ----
  absorbShield(d: number) {
    if (this.shieldHP <= 0) return d;
    const k = Math.min(this.shieldHP, d);
    this.shieldHP -= k;
    return d - k;
  }
  equipmentStats() {
    let gen = 0, cap = 0, shieldMax = 0, move = 0, robots = 0, area = 0, night = false, belt = false;
    for (const e of this.armorGrid) {
      const q = ITEMS[e.id].equip!;
      if (q.kind === 'generator') gen += q.power!;
      if (q.kind === 'battery') cap += q.capacity!;
      if (q.kind === 'shield') shieldMax += q.shield!;
      if (q.kind === 'movement') move += q.moveBonus!;
      if (q.kind === 'roboport') { robots += q.robots!; area = Math.max(area, q.area!); }
      if (q.kind === 'nightvision') night = true;
      if (q.kind === 'belt-immunity') belt = true;
    }
    return { gen, cap, shieldMax, move, robots, area, night, belt };
  }

  die() {
    const g = G.game;
    const ch = this.character;
    ch.dead = true;
    // corpse with items
    const items: Stack[] = [];
    for (const inv of [this.main, this.guns, this.ammo, this.armor, this.trash]) { for (const s of inv.slots) if (s) items.push(s); inv.clear(); }
    if (this.cursor) { items.push(this.cursor); this.cursor = null; }
    for (const j of this.craftQueue) for (const s of j.reserved) items.push(s);
    this.craftQueue = [];
    if (items.length) g.spawnCorpse(ch.x, ch.y, items);
    this.respawnT = 600;
    g.ui?.showMessage('You died. Respawning in 10 seconds...');
    g.sound.play('death', 1);
  }
  respawn() {
    const ch = new Character('character', this.spawnX, this.spawnY, 0);
    this.character = ch;
    G.game.world.addUnit(ch);
    this.respawnT = -1;
    this.armorGrid = [];
    this.resizeInventory();
    this.give('pistol', 1); this.give('firearm-magazine', 10);
  }

  serialize() {
    return {
      x: this.x, y: this.y, h: this.character.health, m: this.main.serialize(), g: this.guns.serialize(), a: this.ammo.serialize(), ar: this.armor.serialize(), t: this.trash.serialize(),
      c: this.cursor, q: this.quickbar, cq: this.craftQueue, sx: this.spawnX, sy: this.spawnY, sg: this.selectedGun, lr: this.logisticRequests, bat: this.battery, sh: this.shieldHP,
    };
  }
  load(d: any) {
    this.character.x = d.x; this.character.y = d.y; this.character.health = d.h ?? 250;
    this.main.resize(d.m.s.length); this.main.load(d.m); this.guns.load(d.g); this.ammo.load(d.a); this.armor.load(d.ar); this.trash.load(d.t);
    this.cursor = d.c || null; this.quickbar = d.q || this.quickbar; this.craftQueue = d.cq || []; this.spawnX = d.sx ?? 0; this.spawnY = d.sy ?? 0; this.selectedGun = d.sg || 0;
    this.logisticRequests = d.lr || []; this.battery = d.bat || 0; this.shieldHP = d.sh || 0;
    const arm = this.armor.slots[0];
    this.armorGrid = arm?.data?.grid || [];
  }
}

export function faceTo(dx: number, dy: number): number {
  const a = Math.atan2(dx, -dy); // 0 = north, clockwise
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}
