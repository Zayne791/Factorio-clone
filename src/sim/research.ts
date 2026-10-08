// Research manager: technology progress, queue, trigger techs, bonuses.
import { TECHS, TechProto, RECIPES, techLevelCost, techLevelEffects, TechEffect, ITEMS } from '../data/protos';
import { G } from '../core';

export interface Bonuses {
  inserterCapacity: number; bulkInserterCapacity: number; labSpeed: number; miningProd: number;
  robotSpeed: number; robotCargo: number; followers: number; inventorySlots: number; miningSpeed: number;
  ammoDamage: Record<string, number>; turretDamage: Record<string, number>; gunSpeed: Record<string, number>;
  braking: number; artilleryRange: number;
}
export function emptyBonuses(): Bonuses {
  return { inserterCapacity: 0, bulkInserterCapacity: 0, labSpeed: 0, miningProd: 0, robotSpeed: 0, robotCargo: 0, followers: 0, inventorySlots: 0, miningSpeed: 0, ammoDamage: {}, turretDamage: {}, gunSpeed: {}, braking: 0, artilleryRange: 0 };
}

export class Research {
  levels: Record<string, number> = {};   // completed levels (1 for normal techs)
  current: string | null = null;
  progress = 0;                           // units done for current
  partial: Record<string, number> = {};   // saved progress per tech
  queue: string[] = [];
  triggerCounts: Record<string, number> = {};
  enabledRecipes = new Set<string>();
  onComplete: ((id: string, lvl: number) => void) | null = null;

  init() {
    for (const r of Object.values(RECIPES)) if (r.enabled) this.enabledRecipes.add(r.id);
  }
  isResearched(id: string) { const t = TECHS[id]; return (this.levels[id] || 0) >= (t?.maxLevel === Infinity ? 1 : Math.min(1, t?.maxLevel ?? 1)) && (this.levels[id] || 0) > 0 && this.isFullyDone(id); }
  isFullyDone(id: string) { const t = TECHS[id]; return (this.levels[id] || 0) >= t.maxLevel; }
  completedLevels(id: string) { return this.levels[id] || 0; }
  nextLevel(id: string) { return (this.levels[id] || 0) + 1; }
  prereqsDone(id: string) { return TECHS[id].prereq.every(p => (this.levels[p] || 0) > 0); }
  isAvailable(id: string) { return !this.isFullyDone(id) && this.prereqsDone(id); }
  isTrigger(id: string) { return !!TECHS[id].trigger; }
  cost(id: string) { return techLevelCost(TECHS[id], this.nextLevel(id)); }
  currentCost() { return this.cost(this.current!); }

  start(id: string) {
    if (!this.isAvailable(id) || this.isTrigger(id)) return false;
    if (this.current && this.current !== id) this.partial[this.current] = this.progress;
    this.current = id;
    this.progress = this.partial[id] || 0;
    return true;
  }
  enqueue(id: string) {
    if (this.isFullyDone(id)) return;
    // add prerequisites first
    const order: string[] = [];
    const visit = (t: string) => {
      if (this.isFullyDone(t) && TECHS[t].maxLevel !== Infinity) return;
      if ((this.levels[t] || 0) > 0 && t !== id) return;
      for (const p of TECHS[t].prereq) visit(p);
      if (!order.includes(t)) order.push(t);
    };
    visit(id);
    for (const t of order) if (!this.queue.includes(t) && !this.isTrigger(t)) this.queue.push(t);
    if (!this.current) this.advanceQueue();
  }
  dequeue(id: string) {
    this.queue = this.queue.filter(q => q !== id);
    if (this.current === id) { this.partial[id] = this.progress; this.current = null; this.progress = 0; this.advanceQueue(); }
  }
  advanceQueue() {
    while (this.queue.length) {
      const id = this.queue[0];
      if (this.isFullyDone(id)) { this.queue.shift(); continue; }
      if (this.isAvailable(id)) { this.start(id); return; }
      // blocked: try next available
      const avail = this.queue.find(q => this.isAvailable(q) && !this.isTrigger(q));
      if (avail) { this.start(avail); return; }
      return;
    }
  }
  addProgress(units: number) {
    if (!this.current) return;
    this.progress += units;
    const c = this.currentCost();
    if (this.progress >= c.count) this.complete(this.current);
  }
  complete(id: string) {
    const t = TECHS[id];
    const lvl = (this.levels[id] || 0) + 1;
    this.levels[id] = lvl;
    this.applyEffects(t, lvl);
    delete this.partial[id];
    if (this.current === id) {
      this.current = null; this.progress = 0;
      if (t.maxLevel > lvl && this.queue[0] === id) { /* keep researching next level if queued */ }
      else this.queue = this.queue.filter(q => q !== id);
    }
    this.onComplete && this.onComplete(id, lvl);
    this.advanceQueue();
  }
  applyEffects(t: TechProto, lvl: number) {
    const b = G.game.bonus;
    for (const e of techLevelEffects(t, lvl)) this.applyEffect(b, e);
    if (t.levelInfo === undefined) for (const u of t.unlocks) this.enabledRecipes.add(u);
    else if (lvl === 1) for (const u of t.unlocks) this.enabledRecipes.add(u);
  }
  applyEffect(b: Bonuses, e: TechEffect) {
    switch (e.type) {
      case 'unlock-recipe': this.enabledRecipes.add(e.target!); break;
      case 'inserter-capacity': b.inserterCapacity += e.value; break;
      case 'bulk-inserter-capacity': b.bulkInserterCapacity += e.value; break;
      case 'lab-speed': b.labSpeed += e.value; break;
      case 'mining-productivity': b.miningProd += e.value; break;
      case 'robot-speed': b.robotSpeed += e.value; break;
      case 'robot-cargo': b.robotCargo += e.value; break;
      case 'follower-robots': b.followers += e.value; break;
      case 'inventory-slots': b.inventorySlots += e.value; G.game.player.resizeInventory(); break;
      case 'mining-speed': b.miningSpeed += e.value; break;
      case 'ammo-damage': b.ammoDamage[e.target!] = (b.ammoDamage[e.target!] || 0) + e.value; break;
      case 'turret-attack': b.turretDamage[e.target!] = (b.turretDamage[e.target!] || 0) + e.value; break;
      case 'gun-speed': b.gunSpeed[e.target!] = (b.gunSpeed[e.target!] || 0) + e.value; break;
      case 'braking': b.braking += e.value; break;
      case 'artillery-range': b.artilleryRange += e.value; break;
    }
  }
  // Recompute all bonuses (after load)
  rebuildBonuses() {
    const b = G.game.bonus;
    Object.assign(b, (G.game.constructor as any).emptyBonuses ? (G.game.constructor as any).emptyBonuses() : emptyBonuses());
    this.enabledRecipes = new Set();
    this.init();
    for (const [id, lvl] of Object.entries(this.levels)) {
      const t = TECHS[id]; if (!t) continue;
      for (let l = 1; l <= lvl; l++) {
        for (const e of techLevelEffects(t, l)) if (e.type !== 'inventory-slots') this.applyEffect(b, e); else b.inventorySlots += e.value;
        for (const u of t.unlocks) this.enabledRecipes.add(u);
      }
    }
  }
  // ---- triggers ----
  private checkTrigger(type: string, target: string, n: number) {
    const key = type + ':' + target;
    this.triggerCounts[key] = (this.triggerCounts[key] || 0) + n;
    for (const t of Object.values(TECHS)) {
      if (!t.trigger || this.levels[t.id]) continue;
      if (t.trigger.type !== type || t.trigger.target !== target) continue;
      if (!this.prereqsDone(t.id)) continue;
      if (this.triggerCounts[key] >= t.trigger.count) this.complete(t.id);
    }
  }
  onCraft(item: string, n: number) { this.checkTrigger('craft-item', item, n); }
  onMined(res: string) { if (res === 'crude-oil' || res === 'uranium-ore') this.checkTrigger('mine-entity', res, 1); }
  onLaunch(item: string) { this.checkTrigger('send-item-to-orbit', item, 1); }
  // re-check triggers whose prereqs just completed
  recheckTriggers() {
    for (const t of Object.values(TECHS)) {
      if (!t.trigger || this.levels[t.id] || !this.prereqsDone(t.id)) continue;
      const key = t.trigger.type + ':' + t.trigger.target;
      if ((this.triggerCounts[key] || 0) >= t.trigger.count) this.complete(t.id);
    }
  }
  serialize() { return { l: this.levels, c: this.current, p: this.progress, pa: this.partial, q: this.queue, t: this.triggerCounts }; }
  load(d: any) {
    this.levels = d.l || {}; this.current = d.c || null; this.progress = d.p || 0; this.partial = d.pa || {}; this.queue = d.q || []; this.triggerCounts = d.t || {};
  }
}

// ---------------- Production statistics ----------------
const LEVELS = [
  { every: 60, keep: 300 },        // 1s samples, 5 min
  { every: 600, keep: 360 },       // 10s, 1 h
  { every: 36000, keep: 300 },     // 10 min, 50 h
  { every: 216000, keep: 1000 },   // 1 h, 1000 h
];
type Sample = Map<string, number>;
class Series {
  levels: { prod: Sample[]; cons: Sample[] }[] = LEVELS.map(() => ({ prod: [], cons: [] }));
  curP = new Map<string, number>(); curC = new Map<string, number>();
  acc: { p: Sample; c: Sample }[] = LEVELS.map(() => ({ p: new Map(), c: new Map() }));
  totalP = new Map<string, number>(); totalC = new Map<string, number>();
  add(m: Map<string, number>, k: string, n: number) { m.set(k, (m.get(k) || 0) + n); }
  tick(t: number) {
    if (t % 60 !== 0) return;
    for (let i = 0; i < LEVELS.length; i++) {
      for (const [k, v] of this.curP) this.add(this.acc[i].p, k, v);
      for (const [k, v] of this.curC) this.add(this.acc[i].c, k, v);
      if (t % LEVELS[i].every === 0) {
        const L = this.levels[i];
        L.prod.push(this.acc[i].p); L.cons.push(this.acc[i].c);
        if (L.prod.length > LEVELS[i].keep) { L.prod.shift(); L.cons.shift(); }
        this.acc[i] = { p: new Map(), c: new Map() };
      }
    }
    this.curP = new Map(); this.curC = new Map();
  }
}
export const STAT_RANGES = [
  { name: '5s', level: 0, samples: 5, secPer: 1 },
  { name: '1m', level: 0, samples: 60, secPer: 1 },
  { name: '10m', level: 1, samples: 60, secPer: 10 },
  { name: '1h', level: 1, samples: 360, secPer: 10 },
  { name: '10h', level: 2, samples: 60, secPer: 600 },
  { name: '50h', level: 2, samples: 300, secPer: 600 },
  { name: '250h', level: 3, samples: 250, secPer: 3600 },
  { name: '1000h', level: 3, samples: 1000, secPer: 3600 },
];
export class Stats {
  items = new Series();
  power = new Series();
  kills = new Series();
  pollution = new Series();
  produce(id: string, n: number) {
    this.items.add(this.items.curP, id, n); this.items.add(this.items.totalP, id, n);
    if (!ITEMS[id] || ITEMS[id]) G.game.research.onCraft(id, n);
  }
  consume(id: string, n: number) { this.items.add(this.items.curC, id, n); this.items.add(this.items.totalC, id, n); }
  powerUse(name: string, j: number) { this.power.add(this.power.curC, name, j); }
  powerProd(name: string, j: number) { this.power.add(this.power.curP, name, j); }
  kill(name: string) { this.kills.add(this.kills.curP, name, 1); this.kills.add(this.kills.totalP, name, 1); }
  tick(t: number) { this.items.tick(t); this.power.tick(t); this.kills.tick(t); this.pollution.tick(t); }
  // returns per-sample arrays for the given range
  series(s: Series, rangeIdx: number, which: 'prod' | 'cons'): Sample[] {
    const r = STAT_RANGES[rangeIdx];
    const arr = s.levels[r.level][which];
    return arr.slice(Math.max(0, arr.length - r.samples));
  }
  serialize() {
    const ser = (s: Series) => ({ tp: [...s.totalP], tc: [...s.totalC] });
    return { i: ser(this.items), k: ser(this.kills) };
  }
  load(d: any) {
    if (!d) return;
    this.items.totalP = new Map(d.i.tp); this.items.totalC = new Map(d.i.tc);
    this.kills.totalP = new Map(d.k.tp); this.kills.totalC = new Map(d.k.tc);
  }
}
