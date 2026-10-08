// Base entity class and shared subsystems (burner energy source, electric consumer).
import { ENTITIES, EntityProto, ITEMS } from '../data/protos';
import { Inventory, Stack } from './inventory';
import { G, rotOffset, Dir } from '../core';
import type { Renderer } from '../engine/renderer';

export const PHASE = { NONE: -1, BELT: 1, INSERTER: 2, MACHINE: 3, FLUID: 4, COMBAT: 5, UNIT: 6, ROBOT: 7, TRAIN: 8, CIRCUIT: 9, MISC: 10 };

export interface Wires { red: Set<Entity>; green: Set<Entity>; }

let NEXT_ID = 1;
export function setNextId(n: number) { NEXT_ID = n; }
export function getNextId() { return NEXT_ID; }

export class Entity {
  id: number;
  proto: EntityProto;
  name: string;
  type: string;
  x: number; y: number;
  dir: Dir;
  w: number; h: number;
  health: number;
  dead = false;
  // power
  elecNet: any = null;
  power = 1;          // satisfaction from last tick (0..1)
  demand = 0;         // J requested this tick
  // circuits
  wires: Wires | null = null;
  // misc state
  decon = false;      // marked for deconstruction
  status = '';
  active = true;      // circuit/enable flag
  lastHit = -1e9;
  warnIcon: string | null = null;
  flags = 0;          // bit 1 = mirrored

  constructor(protoId: string, x: number, y: number, dir: Dir = 0) {
    this.proto = ENTITIES[protoId] || ({ id: protoId, name: protoId, type: protoId, w: 1, h: 1, health: 100, mineTime: 0.5, item: '' } as EntityProto);
    this.name = this.proto.id;
    this.type = this.proto.type;
    this.id = NEXT_ID++;
    this.x = x; this.y = y;
    this.dir = (this.proto.rotatable ? dir : 0) as Dir;
    const swap = (this.dir & 1) === 1;
    this.w = swap ? this.proto.h : this.proto.w;
    this.h = swap ? this.proto.w : this.proto.h;
    this.health = this.proto.health;
  }
  get maxHealth() { return this.proto.health; }
  get tx() { return Math.round(this.x - this.w / 2); }
  get ty() { return Math.round(this.y - this.h / 2); }
  get phase(): number { return PHASE.NONE; }
  get selectable() { return true; }
  get minable() { return true; }
  get isBuilding() { return true; } // player-built structure
  get blocksMovement() { return !this.proto.walkable; }
  get collisionInset() { return this.proto.collide ?? 0.15; }

  // Absolute world position of a local offset (north-facing coords)
  local(lx: number, ly: number): [number, number] {
    const [rx, ry] = rotOffset(lx, ly, this.dir);
    return [this.x + rx, this.y + ry];
  }
  contains(px: number, py: number, pad = 0) {
    return px >= this.x - this.w / 2 - pad && px < this.x + this.w / 2 + pad && py >= this.y - this.h / 2 - pad && py < this.y + this.h / 2 + pad;
  }

  update(): void { }
  draw(r: Renderer, alt: boolean): void { }
  onPlaced(): void { }
  onRemoved(): void { }
  // Called when neighbours change (belt/pipe topology etc.)
  onNeighbourChanged(): void { }

  inventories(): Inventory[] { return []; }
  // Items returned when mined by player (excluding the entity item itself)
  contents(): Stack[] {
    const out: Stack[] = [];
    for (const inv of this.inventories()) for (const s of inv.slots) if (s) out.push({ ...s });
    return out;
  }
  // ---- item transfer API used by inserters, drills, players ----
  // How many of `id` would this entity accept from an inserter right now (0 = none)
  wants(id: string): number { return 0; }
  // Can it accept any item from an inserter (used for 'what to pick up' decisions)
  insertItem(id: string, n: number, src: 'inserter' | 'player' | 'drill' | 'robot' = 'inserter'): number { return 0; }
  // Take an output item for an inserter
  takeOutput(max: number, filter?: (id: string) => boolean): Stack | null { return null; }
  hasOutput(filter?: (id: string) => boolean): boolean { return false; }
  // Fuel request (burner entities)
  wantsFuel(id: string): number { return 0; }

  damage(amount: number, type = 'physical', source?: any) {
    const res = this.proto.resist?.[type];
    let d = amount;
    if (res) { d = Math.max(amount - res[0], amount < res[0] ? 1 : 0); d *= (1 - res[1]); if (d < 1 && amount >= 1) d = Math.min(1, amount); }
    this.health -= d;
    this.lastHit = G.game.tick;
    if (this.health <= 0 && !this.dead) G.game.destroyEntity(this, source);
    return d;
  }

  serialize(): any { return {}; }
  load(d: any) { }
  description(): string[] { return []; }
}

// ---- Burner energy source ----
export class Burner {
  fuel: Inventory;
  burnt: Inventory | null;
  energy = 0;            // remaining energy of current item (J)
  currentFuel: string | null = null;
  heat = 0;              // for animation
  constructor(slots = 1, burntSlots = 0, public fuelCat: 'chemical' | 'nuclear' = 'chemical') {
    this.fuel = new Inventory(slots);
    this.burnt = burntSlots ? new Inventory(burntSlots) : null;
  }
  // Consume `j` joules; returns fraction satisfied (0..1)
  consume(j: number): number {
    if (j <= 0) return 1;
    let got = 0;
    while (got < j) {
      if (this.energy <= 0) {
        if (!this.refuel()) break;
      }
      const k = Math.min(this.energy, j - got);
      this.energy -= k; got += k;
    }
    return got / j;
  }
  refuel(): boolean {
    const id = this.fuel.firstItem(i => (ITEMS[i]?.fuel ?? 0) > 0 && (ITEMS[i]?.fuelCat ?? 'chemical') === this.fuelCat);
    if (!id) return false;
    const it = ITEMS[id];
    if (it.burntResult && this.burnt) {
      if (!this.burnt.canInsert(it.burntResult, 1)) return false;
      this.burnt.insert(it.burntResult, 1);
    }
    this.fuel.remove(id, 1);
    this.energy += it.fuel!;
    this.currentFuel = id;
    G.game.stats.consume(id, 1);
    return true;
  }
  get hasFuel() { return this.energy > 0 || this.fuel.firstItem(i => (ITEMS[i]?.fuel ?? 0) > 0) !== null; }
  isFuel(id: string) { const it = ITEMS[id]; return !!it?.fuel && (it.fuelCat ?? 'chemical') === this.fuelCat; }
  // Inserter fuel top-up target count
  wantsFuel(id: string): number {
    if (!this.isFuel(id)) return 0;
    const have = this.fuel.count(id);
    const cur = this.fuel.firstItem();
    if (cur && cur !== id && this.fuel.freeSlots() === 0) return 0;
    const target = Math.max(1, Math.min(ITEMS[id].stack, Math.ceil(5 * 4e6 / ITEMS[id].fuel!)));
    return Math.max(0, Math.min(target - have, this.fuel.space(id)));
  }
  serialize() { return { f: this.fuel.serialize(), b: this.burnt?.serialize(), e: this.energy, c: this.currentFuel }; }
  load(d: any) { if (!d) return; this.fuel.load(d.f); if (d.b && this.burnt) this.burnt.load(d.b); this.energy = d.e || 0; this.currentFuel = d.c || null; }
}

export type EntityClass = new (protoId: string, x: number, y: number, dir: Dir) => Entity;
export const ENTITY_CLASSES: Record<string, EntityClass> = {};
export function registerEntity(types: string[], cls: EntityClass) { for (const t of types) ENTITY_CLASSES[t] = cls; }

export function createEntity(protoId: string, x: number, y: number, dir: Dir): Entity {
  const p = ENTITIES[protoId];
  const cls = (p && ENTITY_CLASSES[p.type]) || ENTITY_CLASSES[protoId] || Entity;
  return new cls(protoId, x, y, dir);
}
