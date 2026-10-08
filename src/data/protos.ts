// Core prototype definitions: items, fluids, recipes, technologies, entities.
// Numbers follow the official Factorio 2.0 (base game) wiki values.
import { GEN_ITEMS, GEN_RECIPES, GEN_TECHS } from './generated';

export type Dir = 0 | 1 | 2 | 3; // N E S W

export interface Stack { id: string; n: number; }

export interface ItemProto {
  id: string; name: string; stack: number; ptype: string;
  group: string; subgroup: string; order: number;
  fuel?: number; fuelCat?: 'chemical' | 'nuclear';
  burntResult?: string;
  place?: string; placeTile?: string;
  ammoCat?: string; ammo?: AmmoInfo; gun?: GunInfo;
  module?: ModuleEffect; armor?: ArmorInfo; equip?: EquipInfo; capsule?: CapsuleInfo;
  barrelOf?: string; science?: boolean; durability?: number; heal?: number;
  fuelAccel?: number; fuelTopSpeed?: number; tool?: boolean;
  hidden?: boolean;
}
export interface AmmoInfo { cat: 'bullet' | 'shotgun' | 'cannon' | 'rocket' | 'flamethrower' | 'artillery'; damage: number; dtype: string; magazine: number; pellets?: number; aoe?: number; aoeDamage?: number; aoeType?: string; pierce?: number; range?: number; }
export interface GunInfo { cat: string; range: number; rate: number; dmgBonus?: number; }
export interface ModuleEffect { speed?: number; prod?: number; energy?: number; pollution?: number; cat: 'speed' | 'productivity' | 'efficiency'; tier: number; }
export interface ArmorInfo { resist: Record<string, [number, number]>; grid?: [number, number]; invBonus?: number; }
export interface EquipInfo { w: number; h: number; kind: string; power?: number; capacity?: number; shield?: number; moveBonus?: number; robots?: number; area?: number; chargePads?: number; damage?: number; range?: number; rate?: number; }
export interface CapsuleInfo { kind: 'heal' | 'grenade' | 'cluster' | 'poison' | 'slowdown' | 'defender' | 'distractor' | 'destroyer' | 'cliff' | 'remote'; range: number; cooldown: number; }

export interface FluidProto { id: string; name: string; color: [number, number, number]; flowColor: [number, number, number]; temp?: number; }

export interface RecipeProto {
  id: string; name: string; time: number; cat: string;
  ing: { id: string; n: number; fluid: boolean }[];
  res: { id: string; n: number; fluid: boolean; p?: number }[];
  enabled: boolean; main: string; group: string; subgroup: string; order: number; hand: boolean;
  icon?: string; allowProd: boolean; hidden?: boolean;
}

export interface TechLevel { level: number; time: number; packs: string[]; count: number; }
export interface TechProto {
  id: string; name: string; prereq: string[]; unlocks: string[];
  time: number; packs: string[]; count: number;
  trigger?: { type: string; target: string; count: number };
  effects: TechEffect[];
  maxLevel: number; // 1 for normal, N for leveled, Infinity for infinite
  firstLevel: number; costFormula?: (lvl: number) => number;
  levelInfo?: TechLevel[];
  icon: string; order: number;
}
export interface TechEffect { type: string; target?: string; value: number; }

// ---------- Fluids ----------
export const FLUIDS: Record<string, FluidProto> = {
  'water': { id: 'water', name: 'Water', color: [0.12, 0.38, 0.7], flowColor: [0.7, 0.8, 1], temp: 15 },
  'steam': { id: 'steam', name: 'Steam', color: [0.78, 0.78, 0.8], flowColor: [1, 1, 1], temp: 165 },
  'crude-oil': { id: 'crude-oil', name: 'Crude oil', color: [0.14, 0.12, 0.12], flowColor: [0.5, 0.45, 0.45] },
  'heavy-oil': { id: 'heavy-oil', name: 'Heavy oil', color: [0.65, 0.2, 0.02], flowColor: [1, 0.5, 0.2] },
  'light-oil': { id: 'light-oil', name: 'Light oil', color: [0.86, 0.58, 0.05], flowColor: [1, 0.85, 0.4] },
  'petroleum-gas': { id: 'petroleum-gas', name: 'Petroleum gas', color: [0.42, 0.18, 0.45], flowColor: [0.8, 0.5, 0.8] },
  'lubricant': { id: 'lubricant', name: 'Lubricant', color: [0.15, 0.6, 0.12], flowColor: [0.5, 1, 0.4] },
  'sulfuric-acid': { id: 'sulfuric-acid', name: 'Sulfuric acid', color: [0.78, 0.85, 0.1], flowColor: [1, 1, 0.5] },
};
export const isFluid = (id: string) => !!FLUIDS[id];

// ---------- Crafting groups ----------
export const GROUPS = ['logistics', 'production', 'intermediate-products', 'combat'];
export const GROUP_NAMES: Record<string, string> = {
  'logistics': 'Logistics', 'production': 'Production', 'intermediate-products': 'Intermediate products', 'combat': 'Combat',
};
// subgroup -> [group, members...] in display order
const SUBGROUPS: [string, string, string[]][] = [
  ['storage', 'logistics', ['wooden-chest', 'iron-chest', 'steel-chest', 'storage-tank']],
  ['belt', 'logistics', ['transport-belt', 'fast-transport-belt', 'express-transport-belt', 'underground-belt', 'fast-underground-belt', 'express-underground-belt', 'splitter', 'fast-splitter', 'express-splitter']],
  ['inserter', 'logistics', ['burner-inserter', 'inserter', 'long-handed-inserter', 'fast-inserter', 'bulk-inserter']],
  ['energy-pipe-distribution', 'logistics', ['small-electric-pole', 'medium-electric-pole', 'big-electric-pole', 'substation', 'pipe', 'pipe-to-ground', 'pump']],
  ['train-transport', 'logistics', ['rail', 'train-stop', 'rail-signal', 'rail-chain-signal', 'locomotive', 'cargo-wagon', 'fluid-wagon', 'artillery-wagon']],
  ['transport', 'logistics', ['car', 'tank', 'spidertron', 'spidertron-remote']],
  ['logistic-network', 'logistics', ['logistic-robot', 'construction-robot', 'active-provider-chest', 'passive-provider-chest', 'storage-chest', 'buffer-chest', 'requester-chest', 'roboport']],
  ['circuit-network', 'logistics', ['small-lamp', 'red-wire', 'green-wire', 'arithmetic-combinator', 'decider-combinator', 'constant-combinator', 'selector-combinator', 'power-switch', 'programmable-speaker', 'display-panel']],
  ['terrain', 'logistics', ['stone-brick', 'concrete', 'hazard-concrete', 'refined-concrete', 'refined-hazard-concrete', 'landfill', 'cliff-explosives']],
  ['tool', 'production', ['repair-pack', 'blueprint', 'deconstruction-planner', 'upgrade-planner', 'blueprint-book']],
  ['energy', 'production', ['boiler', 'steam-engine', 'solar-panel', 'accumulator', 'nuclear-reactor', 'heat-pipe', 'heat-exchanger', 'steam-turbine']],
  ['extraction-machine', 'production', ['burner-mining-drill', 'electric-mining-drill', 'offshore-pump', 'pumpjack']],
  ['smelting-machine', 'production', ['stone-furnace', 'steel-furnace', 'electric-furnace']],
  ['production-machine', 'production', ['assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3', 'oil-refinery', 'chemical-plant', 'centrifuge', 'lab']],
  ['module', 'production', ['beacon', 'speed-module', 'speed-module-2', 'speed-module-3', 'efficiency-module', 'efficiency-module-2', 'efficiency-module-3', 'productivity-module', 'productivity-module-2', 'productivity-module-3']],
  ['space-related', 'production', ['rocket-silo', 'satellite', 'cargo-landing-pad']],
  ['fluid-recipes', 'intermediate-products', ['basic-oil-processing', 'advanced-oil-processing', 'coal-liquefaction', 'heavy-oil-cracking', 'light-oil-cracking']],
  ['raw-resource', 'intermediate-products', ['wood', 'coal', 'stone', 'iron-ore', 'copper-ore', 'uranium-ore', 'raw-fish']],
  ['raw-material', 'intermediate-products', ['iron-plate', 'copper-plate', 'steel-plate', 'solid-fuel-from-light-oil', 'solid-fuel-from-heavy-oil', 'solid-fuel-from-petroleum-gas', 'solid-fuel', 'plastic-bar', 'sulfur', 'battery', 'explosives', 'lubricant', 'sulfuric-acid']],
  ['intermediate-product', 'intermediate-products', ['copper-cable', 'iron-stick', 'iron-gear-wheel', 'barrel', 'electronic-circuit', 'advanced-circuit', 'processing-unit', 'engine-unit', 'electric-engine-unit', 'flying-robot-frame', 'rocket-part', 'low-density-structure', 'rocket-fuel', 'nuclear-fuel']],
  ['uranium-processing', 'intermediate-products', ['uranium-processing', 'uranium-235', 'uranium-238', 'uranium-fuel-cell', 'depleted-uranium-fuel-cell', 'nuclear-fuel-reprocessing', 'kovarex-enrichment-process']],
  ['fill-barrel', 'intermediate-products', ['water-barrel', 'crude-oil-barrel', 'heavy-oil-barrel', 'light-oil-barrel', 'petroleum-gas-barrel', 'lubricant-barrel', 'sulfuric-acid-barrel']],
  ['empty-barrel', 'intermediate-products', ['empty-water-barrel', 'empty-crude-oil-barrel', 'empty-heavy-oil-barrel', 'empty-light-oil-barrel', 'empty-petroleum-gas-barrel', 'empty-lubricant-barrel', 'empty-sulfuric-acid-barrel']],
  ['science-pack', 'intermediate-products', ['automation-science-pack', 'logistic-science-pack', 'military-science-pack', 'chemical-science-pack', 'production-science-pack', 'utility-science-pack', 'space-science-pack']],
  ['gun', 'combat', ['pistol', 'submachine-gun', 'shotgun', 'combat-shotgun', 'rocket-launcher', 'flamethrower']],
  ['ammo', 'combat', ['firearm-magazine', 'piercing-rounds-magazine', 'uranium-rounds-magazine', 'shotgun-shell', 'piercing-shotgun-shell', 'cannon-shell', 'explosive-cannon-shell', 'uranium-cannon-shell', 'explosive-uranium-cannon-shell', 'artillery-shell', 'rocket', 'explosive-rocket', 'atomic-bomb', 'flamethrower-ammo']],
  ['capsule', 'combat', ['grenade', 'cluster-grenade', 'poison-capsule', 'slowdown-capsule', 'defender-capsule', 'distractor-capsule', 'destroyer-capsule']],
  ['armor', 'combat', ['light-armor', 'heavy-armor', 'modular-armor', 'power-armor', 'power-armor-mk2']],
  ['equipment', 'combat', ['solar-panel-equipment', 'fission-reactor-equipment', 'battery-equipment', 'battery-mk2-equipment', 'belt-immunity-equipment', 'exoskeleton-equipment', 'personal-roboport-equipment', 'personal-roboport-mk2-equipment', 'night-vision-equipment']],
  ['military-equipment', 'combat', ['energy-shield-equipment', 'energy-shield-mk2-equipment', 'personal-laser-defense-equipment', 'discharge-defense-equipment']],
  ['defensive-structure', 'combat', ['stone-wall', 'gate', 'radar', 'land-mine', 'gun-turret', 'laser-turret', 'flamethrower-turret', 'artillery-turret']],
];
export const SUBGROUP_ORDER: string[] = SUBGROUPS.map(s => s[0]);
const subOf: Record<string, [string, string, number]> = {};
SUBGROUPS.forEach(([sg, g, members], si) => members.forEach((m, mi) => { subOf[m] = [g, sg, si * 100 + mi]; }));

// ---------- Item extras ----------
const PLACE: Record<string, string> = {};
const PLACE_TILE: Record<string, string> = {
  'stone-brick': 'stone-path', 'concrete': 'concrete', 'hazard-concrete': 'hazard-concrete',
  'refined-concrete': 'refined-concrete', 'refined-hazard-concrete': 'refined-hazard-concrete', 'landfill': 'landfill',
};

const AMMO: Record<string, AmmoInfo> = {
  'firearm-magazine': { cat: 'bullet', damage: 5, dtype: 'physical', magazine: 10 },
  'piercing-rounds-magazine': { cat: 'bullet', damage: 8, dtype: 'physical', magazine: 10 },
  'uranium-rounds-magazine': { cat: 'bullet', damage: 24, dtype: 'physical', magazine: 10 },
  'shotgun-shell': { cat: 'shotgun', damage: 5, dtype: 'physical', magazine: 10, pellets: 12 },
  'piercing-shotgun-shell': { cat: 'shotgun', damage: 8, dtype: 'physical', magazine: 10, pellets: 16, pierce: 2 },
  'cannon-shell': { cat: 'cannon', damage: 200, dtype: 'physical', magazine: 1, pierce: 1000, aoeDamage: 100, aoeType: 'explosion' },
  'explosive-cannon-shell': { cat: 'cannon', damage: 180, dtype: 'physical', magazine: 1, aoe: 4, aoeDamage: 300, aoeType: 'explosion', pierce: 100 },
  'uranium-cannon-shell': { cat: 'cannon', damage: 300, dtype: 'physical', magazine: 1, pierce: 2200, aoeDamage: 210, aoeType: 'explosion' },
  'explosive-uranium-cannon-shell': { cat: 'cannon', damage: 350, dtype: 'physical', magazine: 1, aoe: 4.25, aoeDamage: 315, aoeType: 'explosion', pierce: 150 },
  'rocket': { cat: 'rocket', damage: 200, dtype: 'explosion', magazine: 1 },
  'explosive-rocket': { cat: 'rocket', damage: 50, dtype: 'explosion', magazine: 1, aoe: 6.5, aoeDamage: 100, aoeType: 'explosion' },
  'atomic-bomb': { cat: 'rocket', damage: 400, dtype: 'explosion', magazine: 1, aoe: 35, aoeDamage: 1000, aoeType: 'explosion' },
  'flamethrower-ammo': { cat: 'flamethrower', damage: 2, dtype: 'fire', magazine: 100 },
  'artillery-shell': { cat: 'artillery', damage: 1000, dtype: 'physical', magazine: 1, aoe: 4, aoeDamage: 1000, aoeType: 'explosion' },
};
const GUNS: Record<string, GunInfo> = {
  'pistol': { cat: 'bullet', range: 15, rate: 4 },
  'submachine-gun': { cat: 'bullet', range: 18, rate: 10 },
  'shotgun': { cat: 'shotgun', range: 15, rate: 1.5 },
  'combat-shotgun': { cat: 'shotgun', range: 15, rate: 2, dmgBonus: 0.5 },
  'rocket-launcher': { cat: 'rocket', range: 36, rate: 1 },
  'flamethrower': { cat: 'flamethrower', range: 15, rate: 60 },
};
const MODULES: Record<string, ModuleEffect> = {
  'speed-module': { cat: 'speed', tier: 1, speed: 0.2, energy: 0.5 },
  'speed-module-2': { cat: 'speed', tier: 2, speed: 0.3, energy: 0.6 },
  'speed-module-3': { cat: 'speed', tier: 3, speed: 0.5, energy: 0.7 },
  'efficiency-module': { cat: 'efficiency', tier: 1, energy: -0.3 },
  'efficiency-module-2': { cat: 'efficiency', tier: 2, energy: -0.4 },
  'efficiency-module-3': { cat: 'efficiency', tier: 3, energy: -0.5 },
  'productivity-module': { cat: 'productivity', tier: 1, prod: 0.04, speed: -0.05, energy: 0.4, pollution: 0.05 },
  'productivity-module-2': { cat: 'productivity', tier: 2, prod: 0.06, speed: -0.1, energy: 0.6, pollution: 0.07 },
  'productivity-module-3': { cat: 'productivity', tier: 3, prod: 0.1, speed: -0.15, energy: 0.8, pollution: 0.1 },
};
const ARMORS: Record<string, ArmorInfo> = {
  'light-armor': { resist: { acid: [0, 0.2], explosion: [2, 0.2], fire: [0, 0.1], physical: [3, 0.2] } },
  'heavy-armor': { resist: { acid: [0, 0.4], explosion: [20, 0.3], fire: [0, 0.3], physical: [6, 0.3] } },
  'modular-armor': { resist: { acid: [0, 0.5], explosion: [30, 0.35], fire: [0, 0.4], physical: [6, 0.3] }, grid: [5, 5], invBonus: 10 },
  'power-armor': { resist: { acid: [0, 0.6], explosion: [40, 0.4], fire: [0, 0.6], physical: [8, 0.3] }, grid: [6, 8], invBonus: 20 },
  'power-armor-mk2': { resist: { acid: [0, 0.7], explosion: [60, 0.5], fire: [0, 0.7], physical: [10, 0.4] }, grid: [10, 10], invBonus: 30 },
};
const EQUIP: Record<string, EquipInfo> = {
  'solar-panel-equipment': { w: 1, h: 1, kind: 'generator', power: 30e3 },
  'fission-reactor-equipment': { w: 4, h: 4, kind: 'generator', power: 750e3 },
  'battery-equipment': { w: 1, h: 2, kind: 'battery', capacity: 20e6 },
  'battery-mk2-equipment': { w: 1, h: 2, kind: 'battery', capacity: 100e6 },
  'belt-immunity-equipment': { w: 1, h: 1, kind: 'belt-immunity', power: 100e3 },
  'exoskeleton-equipment': { w: 2, h: 4, kind: 'movement', power: 200e3, moveBonus: 0.3 },
  'personal-roboport-equipment': { w: 2, h: 2, kind: 'roboport', robots: 10, area: 15, chargePads: 2, capacity: 35e6, power: 2e6 },
  'personal-roboport-mk2-equipment': { w: 2, h: 2, kind: 'roboport', robots: 25, area: 20, chargePads: 4, capacity: 35e6, power: 4e6 },
  'night-vision-equipment': { w: 2, h: 2, kind: 'nightvision', power: 10e3 },
  'energy-shield-equipment': { w: 2, h: 2, kind: 'shield', shield: 50, power: 240e3, capacity: 120e3 },
  'energy-shield-mk2-equipment': { w: 2, h: 2, kind: 'shield', shield: 150, power: 360e3, capacity: 180e3 },
  'personal-laser-defense-equipment': { w: 2, h: 2, kind: 'laser', power: 75e3, capacity: 220e3, damage: 10, range: 15, rate: 1.5 },
  'discharge-defense-equipment': { w: 2, h: 2, kind: 'discharge', power: 800e3, capacity: 4040e3, damage: 100, range: 10, rate: 0.4 },
};
const CAPSULES: Record<string, CapsuleInfo> = {
  'raw-fish': { kind: 'heal', range: 0, cooldown: 30 },
  'grenade': { kind: 'grenade', range: 15, cooldown: 30 },
  'cluster-grenade': { kind: 'cluster', range: 20, cooldown: 30 },
  'poison-capsule': { kind: 'poison', range: 25, cooldown: 30 },
  'slowdown-capsule': { kind: 'slowdown', range: 25, cooldown: 30 },
  'defender-capsule': { kind: 'defender', range: 20, cooldown: 15 },
  'distractor-capsule': { kind: 'distractor', range: 25, cooldown: 30 },
  'destroyer-capsule': { kind: 'destroyer', range: 25, cooldown: 30 },
  'cliff-explosives': { kind: 'cliff', range: 10, cooldown: 30 },
};

// ---------- Entities ----------
export interface FluidConn { x: number; y: number; dir: Dir; box: number; underground?: boolean; }
export interface FluidBoxDef { kind: 'input' | 'output' | 'pass'; volume: number; filter?: string; conns: FluidConn[]; }
export interface EntityProto {
  id: string; name: string; type: string; w: number; h: number; health: number;
  mineTime: number; item: string; mapColor?: string;
  rotatable?: boolean; flippable?: boolean;
  energy?: number; drain?: number; source?: 'electric' | 'burner' | 'heat' | 'none' | 'void';
  pollution?: number; speed?: number; modules?: number; cats?: string[];
  slots?: number; beltSpeed?: number; tier?: number; ugMax?: number;
  rotSpeed?: number; extSpeed?: number; pickup?: [number, number]; drop?: [number, number];
  handSize?: number; bulk?: boolean; filterable?: boolean;
  miningArea?: number; outPos?: [number, number];
  reach?: number; supply?: number; poleColor?: string;
  fluidBoxes?: FluidBoxDef[];
  power?: number; fluidUse?: number; maxTemp?: number;
  capacity?: number; resist?: Record<string, [number, number]>;
  range?: number; minRange?: number; rate?: number; turretAmmo?: string;
  light?: { r: number; color: [number, number, number] };
  collide?: number; // collision inset
  layer?: 'floor' | 'object' | 'rail';
  vehicle?: boolean; walkable?: boolean;
  logistic?: string; requestSlots?: number;
}

const ER = (fire: number, impact = 0) => ({ fire: [0, fire] as [number, number], impact: [0, impact] as [number, number] });

const E: EntityProto[] = [
  // Containers
  { id: 'wooden-chest', name: 'Wooden chest', type: 'container', w: 1, h: 1, health: 100, mineTime: 0.1, item: 'wooden-chest', slots: 16, mapColor: 'a87c3a' },
  { id: 'iron-chest', name: 'Iron chest', type: 'container', w: 1, h: 1, health: 200, mineTime: 0.2, item: 'iron-chest', slots: 32, mapColor: 'b5b5b5', resist: ER(0.8, 0.3) },
  { id: 'steel-chest', name: 'Steel chest', type: 'container', w: 1, h: 1, health: 350, mineTime: 0.2, item: 'steel-chest', slots: 48, mapColor: '9e9e9e', resist: ER(0.9, 0.6) },
  { id: 'active-provider-chest', name: 'Active provider chest', type: 'container', w: 1, h: 1, health: 350, mineTime: 0.1, item: 'active-provider-chest', slots: 48, logistic: 'active-provider', mapColor: 'a83ea8', resist: ER(0.9, 0.6) },
  { id: 'passive-provider-chest', name: 'Passive provider chest', type: 'container', w: 1, h: 1, health: 350, mineTime: 0.1, item: 'passive-provider-chest', slots: 48, logistic: 'passive-provider', mapColor: 'c23a3a', resist: ER(0.9, 0.6) },
  { id: 'storage-chest', name: 'Storage chest', type: 'container', w: 1, h: 1, health: 350, mineTime: 0.1, item: 'storage-chest', slots: 48, logistic: 'storage', mapColor: 'c2a53a', resist: ER(0.9, 0.6) },
  { id: 'buffer-chest', name: 'Buffer chest', type: 'container', w: 1, h: 1, health: 350, mineTime: 0.1, item: 'buffer-chest', slots: 48, logistic: 'buffer', requestSlots: 30, mapColor: '3ac23a', resist: ER(0.9, 0.6) },
  { id: 'requester-chest', name: 'Requester chest', type: 'container', w: 1, h: 1, health: 350, mineTime: 0.1, item: 'requester-chest', slots: 48, logistic: 'requester', requestSlots: 30, mapColor: '3a76c2', resist: ER(0.9, 0.6) },
  { id: 'storage-tank', name: 'Storage tank', type: 'storage-tank', w: 3, h: 3, health: 500, mineTime: 0.5, item: 'storage-tank', rotatable: true, mapColor: '7e8a95',
    fluidBoxes: [{ kind: 'pass', volume: 25000, conns: [{ x: -1, y: -1, dir: 0, box: 0 }, { x: -1, y: -1, dir: 3, box: 0 }, { x: 1, y: 1, dir: 2, box: 0 }, { x: 1, y: 1, dir: 1, box: 0 }] }] },
  // Belts
  { id: 'transport-belt', name: 'Transport belt', type: 'transport-belt', w: 1, h: 1, health: 150, mineTime: 0.1, item: 'transport-belt', rotatable: true, beltSpeed: 8, tier: 1, mapColor: 'c8a040', layer: 'floor', walkable: true, resist: ER(0.9) },
  { id: 'fast-transport-belt', name: 'Fast transport belt', type: 'transport-belt', w: 1, h: 1, health: 160, mineTime: 0.1, item: 'fast-transport-belt', rotatable: true, beltSpeed: 16, tier: 2, mapColor: 'd84a3a', layer: 'floor', walkable: true, resist: ER(0.5) },
  { id: 'express-transport-belt', name: 'Express transport belt', type: 'transport-belt', w: 1, h: 1, health: 170, mineTime: 0.1, item: 'express-transport-belt', rotatable: true, beltSpeed: 24, tier: 3, mapColor: '50a0d8', layer: 'floor', walkable: true, resist: ER(0.5) },
  { id: 'underground-belt', name: 'Underground belt', type: 'underground-belt', w: 1, h: 1, health: 150, mineTime: 0.1, item: 'underground-belt', rotatable: true, beltSpeed: 8, tier: 1, ugMax: 5, mapColor: 'c8a040', resist: ER(0.6, 0.3) },
  { id: 'fast-underground-belt', name: 'Fast underground belt', type: 'underground-belt', w: 1, h: 1, health: 160, mineTime: 0.1, item: 'fast-underground-belt', rotatable: true, beltSpeed: 16, tier: 2, ugMax: 7, mapColor: 'd84a3a', resist: ER(0.6, 0.3) },
  { id: 'express-underground-belt', name: 'Express underground belt', type: 'underground-belt', w: 1, h: 1, health: 170, mineTime: 0.1, item: 'express-underground-belt', rotatable: true, beltSpeed: 24, tier: 3, ugMax: 9, mapColor: '50a0d8', resist: ER(0.6, 0.3) },
  { id: 'splitter', name: 'Splitter', type: 'splitter', w: 2, h: 1, health: 170, mineTime: 0.1, item: 'splitter', rotatable: true, beltSpeed: 8, tier: 1, mapColor: 'c8a040', resist: ER(0.6) },
  { id: 'fast-splitter', name: 'Fast splitter', type: 'splitter', w: 2, h: 1, health: 180, mineTime: 0.1, item: 'fast-splitter', rotatable: true, beltSpeed: 16, tier: 2, mapColor: 'd84a3a', resist: ER(0.6) },
  { id: 'express-splitter', name: 'Express splitter', type: 'splitter', w: 2, h: 1, health: 190, mineTime: 0.1, item: 'express-splitter', rotatable: true, beltSpeed: 24, tier: 3, mapColor: '50a0d8', resist: ER(0.6) },
  // Inserters (rotation in turns/tick)
  { id: 'burner-inserter', name: 'Burner inserter', type: 'inserter', w: 1, h: 1, health: 100, mineTime: 0.1, item: 'burner-inserter', rotatable: true, energy: 144e3, source: 'burner', rotSpeed: 281 / 360 / 60, pickup: [0, -1], drop: [0, 1], handSize: 1, mapColor: '006090', resist: ER(0.9) },
  { id: 'inserter', name: 'Inserter', type: 'inserter', w: 1, h: 1, health: 150, mineTime: 0.1, item: 'inserter', rotatable: true, energy: 15.1e3, drain: 400, source: 'electric', rotSpeed: 302 / 360 / 60, pickup: [0, -1], drop: [0, 1], handSize: 1, mapColor: '006090', resist: ER(0.9) },
  { id: 'long-handed-inserter', name: 'Long-handed inserter', type: 'inserter', w: 1, h: 1, health: 160, mineTime: 0.1, item: 'long-handed-inserter', rotatable: true, energy: 21.4e3, drain: 400, source: 'electric', rotSpeed: 432 / 360 / 60, pickup: [0, -2], drop: [0, 2], handSize: 1, mapColor: '006090', resist: ER(0.9) },
  { id: 'fast-inserter', name: 'Fast inserter', type: 'inserter', w: 1, h: 1, health: 150, mineTime: 0.1, item: 'fast-inserter', rotatable: true, energy: 59.3e3, drain: 500, source: 'electric', rotSpeed: 864 / 360 / 60, pickup: [0, -1], drop: [0, 1], handSize: 1, filterable: true, mapColor: '006090', resist: ER(0.9) },
  { id: 'bulk-inserter', name: 'Bulk inserter', type: 'inserter', w: 1, h: 1, health: 160, mineTime: 0.1, item: 'bulk-inserter', rotatable: true, energy: 169e3, drain: 1000, source: 'electric', rotSpeed: 864 / 360 / 60, pickup: [0, -1], drop: [0, 1], handSize: 2, bulk: true, filterable: true, mapColor: '006090', resist: ER(0.9) },
  // Poles
  { id: 'small-electric-pole', name: 'Small electric pole', type: 'electric-pole', w: 1, h: 1, health: 100, mineTime: 0.1, item: 'small-electric-pole', reach: 7.5, supply: 2.5, mapColor: '006090', collide: 0.35 },
  { id: 'medium-electric-pole', name: 'Medium electric pole', type: 'electric-pole', w: 1, h: 1, health: 100, mineTime: 0.1, item: 'medium-electric-pole', reach: 9, supply: 3.5, mapColor: '006090', collide: 0.35, resist: ER(1) },
  { id: 'big-electric-pole', name: 'Big electric pole', type: 'electric-pole', w: 2, h: 2, health: 150, mineTime: 0.1, item: 'big-electric-pole', reach: 32, supply: 2, mapColor: '006090', collide: 0.35, resist: ER(1) },
  { id: 'substation', name: 'Substation', type: 'electric-pole', w: 2, h: 2, health: 200, mineTime: 0.1, item: 'substation', reach: 18, supply: 9, mapColor: '006090', resist: ER(0.9) },
  // Pipes
  { id: 'pipe', name: 'Pipe', type: 'pipe', w: 1, h: 1, health: 100, mineTime: 0.1, item: 'pipe', mapColor: '4c6573', resist: ER(0.8, 0.3),
    fluidBoxes: [{ kind: 'pass', volume: 100, conns: [{ x: 0, y: 0, dir: 0, box: 0 }, { x: 0, y: 0, dir: 1, box: 0 }, { x: 0, y: 0, dir: 2, box: 0 }, { x: 0, y: 0, dir: 3, box: 0 }] }] },
  { id: 'pipe-to-ground', name: 'Pipe to ground', type: 'pipe-to-ground', w: 1, h: 1, health: 150, mineTime: 0.1, item: 'pipe-to-ground', rotatable: true, ugMax: 11, mapColor: '4c6573', resist: ER(0.8, 0.4),
    fluidBoxes: [{ kind: 'pass', volume: 100, conns: [{ x: 0, y: 0, dir: 0, box: 0 }, { x: 0, y: 0, dir: 2, box: 0, underground: true }] }] },
  { id: 'pump', name: 'Pump', type: 'pump', w: 1, h: 2, health: 180, mineTime: 0.2, item: 'pump', rotatable: true, energy: 30e3, source: 'electric', mapColor: '4c6573', resist: ER(0.8, 0.3),
    fluidBoxes: [{ kind: 'input', volume: 200, conns: [{ x: 0, y: 0.5, dir: 2, box: 0 }] }, { kind: 'output', volume: 200, conns: [{ x: 0, y: -0.5, dir: 0, box: 1 }] }] },
  // Rail
  { id: 'straight-rail', name: 'Rail', type: 'straight-rail', w: 2, h: 2, health: 200, mineTime: 0.2, item: 'rail', mapColor: '8c8c8c', layer: 'rail', walkable: true },
  { id: 'curved-rail', name: 'Curved rail', type: 'curved-rail', w: 4, h: 8, health: 200, mineTime: 0.2, item: 'rail', mapColor: '8c8c8c', layer: 'rail', walkable: true },
  { id: 'train-stop', name: 'Train stop', type: 'train-stop', w: 2, h: 2, health: 250, mineTime: 0.2, item: 'train-stop', rotatable: true, mapColor: '8c2a2a', light: { r: 5, color: [1, 0.9, 0.7] } },
  { id: 'rail-signal', name: 'Rail signal', type: 'rail-signal', w: 1, h: 1, health: 100, mineTime: 0.1, item: 'rail-signal', rotatable: true, mapColor: 'c0c0c0' },
  { id: 'rail-chain-signal', name: 'Rail chain signal', type: 'rail-chain-signal', w: 1, h: 1, health: 100, mineTime: 0.1, item: 'rail-chain-signal', rotatable: true, mapColor: 'c0c0c0' },
  { id: 'locomotive', name: 'Locomotive', type: 'locomotive', w: 2, h: 6, health: 1000, mineTime: 0.5, item: 'locomotive', energy: 600e3, source: 'burner', vehicle: true, mapColor: 'd02a2a' },
  { id: 'cargo-wagon', name: 'Cargo wagon', type: 'cargo-wagon', w: 2, h: 6, health: 600, mineTime: 0.5, item: 'cargo-wagon', slots: 40, vehicle: true, mapColor: 'd02a2a' },
  { id: 'fluid-wagon', name: 'Fluid wagon', type: 'fluid-wagon', w: 2, h: 6, health: 600, mineTime: 0.5, item: 'fluid-wagon', capacity: 50000, vehicle: true, mapColor: 'd02a2a' },
  { id: 'artillery-wagon', name: 'Artillery wagon', type: 'artillery-wagon', w: 2, h: 6, health: 600, mineTime: 0.5, item: 'artillery-wagon', vehicle: true, range: 224, minRange: 32, rate: 0.3, mapColor: 'd02a2a' },
  { id: 'car', name: 'Car', type: 'car', w: 2, h: 3, health: 450, mineTime: 0.4, item: 'car', energy: 150e3, source: 'burner', slots: 80, vehicle: true, mapColor: 'd02a2a' },
  { id: 'tank', name: 'Tank', type: 'car', w: 3, h: 4, health: 2000, mineTime: 0.5, item: 'tank', energy: 600e3, source: 'burner', slots: 80, vehicle: true, mapColor: 'd02a2a' },
  { id: 'spidertron', name: 'Spidertron', type: 'spider-vehicle', w: 2, h: 2, health: 3000, mineTime: 1, item: 'spidertron', slots: 80, vehicle: true, mapColor: 'd02a2a' },
  // Logistic network
  { id: 'roboport', name: 'Roboport', type: 'roboport', w: 4, h: 4, health: 500, mineTime: 0.1, item: 'roboport', energy: 5e6, drain: 50e3, source: 'electric', mapColor: '006090', resist: ER(0.6, 0.3), light: { r: 6, color: [1, 0.85, 0.6] } },
  // Circuit network
  { id: 'small-lamp', name: 'Lamp', type: 'lamp', w: 1, h: 1, health: 100, mineTime: 0.1, item: 'small-lamp', energy: 5e3, source: 'electric', mapColor: '006090', light: { r: 20, color: [1, 1, 0.92] }, collide: 0.15 },
  { id: 'arithmetic-combinator', name: 'Arithmetic combinator', type: 'arithmetic-combinator', w: 1, h: 2, health: 150, mineTime: 0.1, item: 'arithmetic-combinator', rotatable: true, energy: 1e3, source: 'electric', mapColor: '006090' },
  { id: 'decider-combinator', name: 'Decider combinator', type: 'decider-combinator', w: 1, h: 2, health: 150, mineTime: 0.1, item: 'decider-combinator', rotatable: true, energy: 1e3, source: 'electric', mapColor: '006090' },
  { id: 'selector-combinator', name: 'Selector combinator', type: 'selector-combinator', w: 1, h: 2, health: 150, mineTime: 0.1, item: 'selector-combinator', rotatable: true, energy: 1e3, source: 'electric', mapColor: '006090' },
  { id: 'constant-combinator', name: 'Constant combinator', type: 'constant-combinator', w: 1, h: 1, health: 120, mineTime: 0.1, item: 'constant-combinator', rotatable: true, mapColor: '006090' },
  { id: 'power-switch', name: 'Power switch', type: 'power-switch', w: 2, h: 2, health: 200, mineTime: 0.2, item: 'power-switch', reach: 9, mapColor: '006090' },
  { id: 'programmable-speaker', name: 'Programmable speaker', type: 'programmable-speaker', w: 1, h: 1, health: 150, mineTime: 0.1, item: 'programmable-speaker', energy: 2e3, source: 'electric', mapColor: '006090' },
  { id: 'display-panel', name: 'Display panel', type: 'display-panel', w: 1, h: 1, health: 50, mineTime: 0.2, item: 'display-panel', rotatable: true, mapColor: '006090' },
  // Energy
  { id: 'boiler', name: 'Boiler', type: 'boiler', w: 3, h: 2, health: 200, mineTime: 0.2, item: 'boiler', rotatable: true, energy: 1.8e6, source: 'burner', pollution: 30, mapColor: '007aa0', resist: { explosion: [0, 0.3], fire: [0, 0.9], impact: [0, 0.3] },
    fluidBoxes: [{ kind: 'pass', volume: 200, filter: 'water', conns: [{ x: -1, y: 0.5, dir: 3, box: 0 }, { x: 1, y: 0.5, dir: 1, box: 0 }] }, { kind: 'output', volume: 200, filter: 'steam', conns: [{ x: 0, y: -0.5, dir: 0, box: 1 }] }],
    light: { r: 2.5, color: [1, 0.55, 0.2] } },
  { id: 'steam-engine', name: 'Steam engine', type: 'generator', w: 3, h: 5, health: 400, mineTime: 0.3, item: 'steam-engine', rotatable: true, power: 900e3, fluidUse: 0.5, maxTemp: 165, mapColor: '007aa0', resist: ER(0.7, 0.3),
    fluidBoxes: [{ kind: 'pass', volume: 200, filter: 'steam', conns: [{ x: 0, y: -2, dir: 0, box: 0 }, { x: 0, y: 2, dir: 2, box: 0 }] }] },
  { id: 'steam-turbine', name: 'Steam turbine', type: 'generator', w: 3, h: 5, health: 300, mineTime: 0.3, item: 'steam-turbine', rotatable: true, power: 5.82e6, fluidUse: 1, maxTemp: 500, mapColor: '007aa0', resist: ER(0.7),
    fluidBoxes: [{ kind: 'pass', volume: 200, filter: 'steam', conns: [{ x: 0, y: -2, dir: 0, box: 0 }, { x: 0, y: 2, dir: 2, box: 0 }] }] },
  { id: 'solar-panel', name: 'Solar panel', type: 'solar-panel', w: 3, h: 3, health: 200, mineTime: 0.1, item: 'solar-panel', power: 60e3, mapColor: '1f2124' },
  { id: 'accumulator', name: 'Accumulator', type: 'accumulator', w: 2, h: 2, health: 150, mineTime: 0.1, item: 'accumulator', capacity: 5e6, power: 300e3, mapColor: '006090' },
  { id: 'nuclear-reactor', name: 'Nuclear reactor', type: 'reactor', w: 5, h: 5, health: 500, mineTime: 0.5, item: 'nuclear-reactor', energy: 40e6, source: 'burner', maxTemp: 1000, mapColor: '006090', light: { r: 8, color: [0.4, 1, 0.4] } },
  { id: 'heat-pipe', name: 'Heat pipe', type: 'heat-pipe', w: 1, h: 1, health: 200, mineTime: 0.1, item: 'heat-pipe', maxTemp: 1000, mapColor: '6e5a4a', walkable: false },
  { id: 'heat-exchanger', name: 'Heat exchanger', type: 'heat-exchanger', w: 3, h: 2, health: 200, mineTime: 0.1, item: 'heat-exchanger', rotatable: true, energy: 10e6, source: 'heat', maxTemp: 1000, mapColor: '007aa0',
    fluidBoxes: [{ kind: 'pass', volume: 200, filter: 'water', conns: [{ x: -1, y: 0.5, dir: 3, box: 0 }, { x: 1, y: 0.5, dir: 1, box: 0 }] }, { kind: 'output', volume: 200, filter: 'steam', conns: [{ x: 0, y: -0.5, dir: 0, box: 1 }] }] },
  // Extraction
  { id: 'burner-mining-drill', name: 'Burner mining drill', type: 'mining-drill', w: 2, h: 2, health: 150, mineTime: 0.3, item: 'burner-mining-drill', rotatable: true, energy: 150e3, source: 'burner', speed: 0.25, miningArea: 2, outPos: [-0.5, -1.3], pollution: 12, cats: ['basic-solid'], mapColor: '006090', light: { r: 1.5, color: [1, 0.5, 0.2] } },
  { id: 'electric-mining-drill', name: 'Electric mining drill', type: 'mining-drill', w: 3, h: 3, health: 300, mineTime: 0.3, item: 'electric-mining-drill', rotatable: true, energy: 90e3, source: 'electric', speed: 0.5, miningArea: 5, outPos: [0, -1.85], pollution: 10, modules: 3, cats: ['basic-solid'], mapColor: '006090',
    fluidBoxes: [{ kind: 'input', volume: 200, conns: [{ x: -1, y: 0, dir: 3, box: 0 }, { x: 1, y: 0, dir: 1, box: 0 }, { x: 0, y: 1, dir: 2, box: 0 }] }] },
  { id: 'offshore-pump', name: 'Offshore pump', type: 'offshore-pump', w: 1, h: 2, health: 150, mineTime: 0.1, item: 'offshore-pump', rotatable: true, mapColor: '006090', resist: ER(0.7, 0.3),
    fluidBoxes: [{ kind: 'output', volume: 100, filter: 'water', conns: [{ x: 0, y: -0.5, dir: 0, box: 0 }] }] },
  { id: 'pumpjack', name: 'Pumpjack', type: 'mining-drill', w: 3, h: 3, health: 200, mineTime: 0.5, item: 'pumpjack', rotatable: true, energy: 90e3, source: 'electric', speed: 1, miningArea: 1, pollution: 10, modules: 2, cats: ['basic-fluid'], mapColor: '006090',
    fluidBoxes: [{ kind: 'output', volume: 1000, conns: [{ x: 1, y: -1, dir: 0, box: 0 }] }] },
  // Smelting
  { id: 'stone-furnace', name: 'Stone furnace', type: 'furnace', w: 2, h: 2, health: 200, mineTime: 0.2, item: 'stone-furnace', energy: 90e3, source: 'burner', speed: 1, pollution: 2, cats: ['smelting'], mapColor: '006090', resist: { explosion: [0, 0.3], fire: [0, 0.9], impact: [0, 0.3] }, light: { r: 2, color: [1, 0.55, 0.2] } },
  { id: 'steel-furnace', name: 'Steel furnace', type: 'furnace', w: 2, h: 2, health: 300, mineTime: 0.2, item: 'steel-furnace', energy: 90e3, source: 'burner', speed: 2, pollution: 4, cats: ['smelting'], mapColor: '006090', resist: ER(1), light: { r: 2, color: [1, 0.55, 0.2] } },
  { id: 'electric-furnace', name: 'Electric furnace', type: 'furnace', w: 3, h: 3, health: 350, mineTime: 0.2, item: 'electric-furnace', energy: 180e3, drain: 6e3, source: 'electric', speed: 2, pollution: 1, modules: 2, cats: ['smelting'], mapColor: '006090', resist: ER(0.8), light: { r: 2.5, color: [1, 0.55, 0.25] } },
  // Production
  { id: 'assembling-machine-1', name: 'Assembling machine 1', type: 'assembling-machine', w: 3, h: 3, health: 300, mineTime: 0.2, item: 'assembling-machine-1', energy: 75e3, drain: 2.5e3, source: 'electric', speed: 0.5, pollution: 4, modules: 0, cats: ['crafting', 'advanced-crafting', 'basic-crafting'], mapColor: '006090', resist: ER(0.7) },
  { id: 'assembling-machine-2', name: 'Assembling machine 2', type: 'assembling-machine', w: 3, h: 3, health: 350, mineTime: 0.2, item: 'assembling-machine-2', rotatable: true, energy: 150e3, drain: 5e3, source: 'electric', speed: 0.75, pollution: 3, modules: 2, cats: ['crafting', 'advanced-crafting', 'basic-crafting', 'crafting-with-fluid'], mapColor: '006090', resist: ER(0.7),
    fluidBoxes: [{ kind: 'input', volume: 1000, conns: [{ x: 0, y: -1, dir: 0, box: 0 }] }, { kind: 'output', volume: 100, conns: [{ x: 0, y: 1, dir: 2, box: 1 }] }] },
  { id: 'assembling-machine-3', name: 'Assembling machine 3', type: 'assembling-machine', w: 3, h: 3, health: 400, mineTime: 0.2, item: 'assembling-machine-3', rotatable: true, energy: 375e3, drain: 12.5e3, source: 'electric', speed: 1.25, pollution: 2, modules: 4, cats: ['crafting', 'advanced-crafting', 'basic-crafting', 'crafting-with-fluid'], mapColor: '006090', resist: ER(0.7),
    fluidBoxes: [{ kind: 'input', volume: 1000, conns: [{ x: 0, y: -1, dir: 0, box: 0 }] }, { kind: 'output', volume: 100, conns: [{ x: 0, y: 1, dir: 2, box: 1 }] }] },
  { id: 'oil-refinery', name: 'Oil refinery', type: 'assembling-machine', w: 5, h: 5, health: 350, mineTime: 0.2, item: 'oil-refinery', rotatable: true, energy: 420e3, drain: 14e3, source: 'electric', speed: 1, pollution: 6, modules: 3, cats: ['oil-processing'], mapColor: '006090', light: { r: 3, color: [1, 0.6, 0.2] },
    fluidBoxes: [
      { kind: 'input', volume: 1000, conns: [{ x: 1, y: 2, dir: 2, box: 0 }] },
      { kind: 'input', volume: 1000, conns: [{ x: -1, y: 2, dir: 2, box: 1 }] },
      { kind: 'output', volume: 1000, conns: [{ x: -2, y: -2, dir: 0, box: 2 }] },
      { kind: 'output', volume: 1000, conns: [{ x: 0, y: -2, dir: 0, box: 3 }] },
      { kind: 'output', volume: 1000, conns: [{ x: 2, y: -2, dir: 0, box: 4 }] },
    ] },
  { id: 'chemical-plant', name: 'Chemical plant', type: 'assembling-machine', w: 3, h: 3, health: 300, mineTime: 0.1, item: 'chemical-plant', rotatable: true, energy: 210e3, drain: 7e3, source: 'electric', speed: 1, pollution: 4, modules: 3, cats: ['chemistry'], mapColor: '006090',
    fluidBoxes: [
      { kind: 'input', volume: 1000, conns: [{ x: -1, y: 1, dir: 2, box: 0 }] },
      { kind: 'input', volume: 1000, conns: [{ x: 1, y: 1, dir: 2, box: 1 }] },
      { kind: 'output', volume: 1000, conns: [{ x: -1, y: -1, dir: 0, box: 2 }] },
      { kind: 'output', volume: 1000, conns: [{ x: 1, y: -1, dir: 0, box: 3 }] },
    ] },
  { id: 'centrifuge', name: 'Centrifuge', type: 'assembling-machine', w: 3, h: 3, health: 350, mineTime: 0.1, item: 'centrifuge', energy: 350e3, drain: 11.6e3, source: 'electric', speed: 1, pollution: 4, modules: 2, cats: ['centrifuging'], mapColor: '006090', resist: ER(0.7), light: { r: 2.5, color: [0.4, 1, 0.4] } },
  { id: 'lab', name: 'Lab', type: 'lab', w: 3, h: 3, health: 150, mineTime: 0.2, item: 'lab', energy: 60e3, source: 'electric', speed: 1, modules: 2, mapColor: '006090', light: { r: 3, color: [0.6, 0.85, 1] } },
  { id: 'beacon', name: 'Beacon', type: 'beacon', w: 3, h: 3, health: 200, mineTime: 0.2, item: 'beacon', energy: 480e3, source: 'electric', modules: 2, supply: 3, mapColor: '006090' },
  { id: 'rocket-silo', name: 'Rocket silo', type: 'rocket-silo', w: 9, h: 9, health: 5000, mineTime: 1, item: 'rocket-silo', energy: 4e6, source: 'electric', speed: 1, modules: 4, cats: ['rocket-building'], mapColor: '006090', resist: ER(0.6, 0.6) },
  { id: 'cargo-landing-pad', name: 'Cargo landing pad', type: 'cargo-landing-pad', w: 8, h: 8, health: 1000, mineTime: 1, item: 'cargo-landing-pad', slots: 80, mapColor: '006090' },
  { id: 'radar', name: 'Radar', type: 'radar', w: 3, h: 3, health: 250, mineTime: 0.1, item: 'radar', energy: 300e3, source: 'electric', mapColor: '006090', resist: ER(0.7, 0.3) },
  // Combat
  { id: 'stone-wall', name: 'Wall', type: 'wall', w: 1, h: 1, health: 350, mineTime: 0.2, item: 'stone-wall', mapColor: 'cecfce', resist: { acid: [0, 0.8], explosion: [10, 0.3], fire: [0, 1], impact: [45, 0.6], laser: [0, 0.7], physical: [3, 0.2] } },
  { id: 'gate', name: 'Gate', type: 'gate', w: 1, h: 1, health: 350, mineTime: 0.1, item: 'gate', rotatable: true, mapColor: 'cecfce', resist: { acid: [0, 0.8], explosion: [10, 0.3], fire: [0, 1], impact: [45, 0.6], laser: [0, 0.7], physical: [3, 0.2] } },
  { id: 'gun-turret', name: 'Gun turret', type: 'ammo-turret', w: 2, h: 2, health: 400, mineTime: 0.5, item: 'gun-turret', range: 18, rate: 10, turretAmmo: 'bullet', mapColor: 'e0a030' },
  { id: 'laser-turret', name: 'Laser turret', type: 'electric-turret', w: 2, h: 2, health: 1000, mineTime: 0.5, item: 'laser-turret', energy: 1.2e6, drain: 24e3, source: 'electric', range: 24, rate: 1.5, mapColor: 'e0a030' },
  { id: 'flamethrower-turret', name: 'Flamethrower turret', type: 'fluid-turret', w: 2, h: 3, health: 1400, mineTime: 0.5, item: 'flamethrower-turret', rotatable: true, range: 30, minRange: 6, rate: 30, mapColor: 'e0a030', resist: ER(1),
    fluidBoxes: [{ kind: 'pass', volume: 100, conns: [{ x: -0.5, y: 1, dir: 3, box: 0 }, { x: 0.5, y: 1, dir: 1, box: 0 }] }] },
  { id: 'artillery-turret', name: 'Artillery turret', type: 'artillery-turret', w: 3, h: 3, health: 2000, mineTime: 0.5, item: 'artillery-turret', range: 224, minRange: 32, rate: 0.3, mapColor: 'e0a030' },
  { id: 'land-mine', name: 'Land mine', type: 'land-mine', w: 1, h: 1, health: 15, mineTime: 0.5, item: 'land-mine', walkable: true, collide: 0.4 },
];
export const ENTITIES: Record<string, EntityProto> = {};
for (const e of E) { ENTITIES[e.id] = e; PLACE[e.item] = PLACE[e.item] || e.id; }
PLACE['rail'] = 'straight-rail';

// Non-buildable world entities
export interface WorldEntityProto { id: string; name: string; type: string; health: number; mineTime: number; result: Stack[]; mapColor: string; r: number; }
export const TREE_TYPES = ['tree-01', 'tree-02', 'tree-03', 'tree-04', 'tree-05', 'tree-06', 'tree-07', 'tree-08', 'tree-09', 'dead-tree', 'dry-tree'];
export const ROCK_TYPES = ['huge-rock', 'big-rock', 'big-sand-rock'];

export const RESOURCES: Record<string, { id: string; name: string; item?: string; fluid?: string; mineTime: number; mapColor: string; color: [number, number, number]; requiresFluid?: string; infinite?: boolean }> = {
  'iron-ore': { id: 'iron-ore', name: 'Iron ore', item: 'iron-ore', mineTime: 1, mapColor: '688fa3', color: [0.41, 0.56, 0.64] },
  'copper-ore': { id: 'copper-ore', name: 'Copper ore', item: 'copper-ore', mineTime: 1, mapColor: 'c7623a', color: [0.8, 0.38, 0.22] },
  'coal': { id: 'coal', name: 'Coal', item: 'coal', mineTime: 1, mapColor: '000000', color: [0.08, 0.08, 0.08] },
  'stone': { id: 'stone', name: 'Stone', item: 'stone', mineTime: 1, mapColor: 'b09868', color: [0.69, 0.6, 0.42] },
  'uranium-ore': { id: 'uranium-ore', name: 'Uranium ore', item: 'uranium-ore', mineTime: 2, mapColor: '00b200', color: [0.1, 0.75, 0.05], requiresFluid: 'sulfuric-acid' },
  'crude-oil': { id: 'crude-oil', name: 'Crude oil', fluid: 'crude-oil', mineTime: 1, mapColor: 'c032c0', color: [0.75, 0.2, 0.75], infinite: true },
};
export const RESOURCE_IDS = ['iron-ore', 'copper-ore', 'coal', 'stone', 'uranium-ore', 'crude-oil'];

// ---------- Build items ----------
export const ITEMS: Record<string, ItemProto> = {};
for (const [id, g] of Object.entries(GEN_ITEMS)) {
  const sub = subOf[id] || ['intermediate-products', 'intermediate-product', 9999];
  const it: ItemProto = {
    id, name: g.name, stack: g.stack, ptype: g.ptype, group: sub[0], subgroup: sub[1], order: sub[2],
  };
  if (g.fuel) { it.fuel = g.fuel; it.fuelCat = id === 'uranium-fuel-cell' ? 'nuclear' : 'chemical'; }
  if (id === 'uranium-fuel-cell') it.burntResult = 'depleted-uranium-fuel-cell';
  if (PLACE[id]) it.place = PLACE[id];
  if (PLACE_TILE[id]) it.placeTile = PLACE_TILE[id];
  if (AMMO[id]) it.ammo = AMMO[id];
  if (GUNS[id]) it.gun = GUNS[id];
  if (MODULES[id]) it.module = MODULES[id];
  if (ARMORS[id]) it.armor = ARMORS[id];
  if (EQUIP[id]) it.equip = EQUIP[id];
  if (CAPSULES[id]) it.capsule = CAPSULES[id];
  if (g.barrelOf) it.barrelOf = g.barrelOf;
  if (g.ptype === 'tool' && id.endsWith('science-pack')) it.science = true;
  if (id === 'repair-pack') it.durability = 300;
  if (id === 'raw-fish') it.heal = 80;
  if (id === 'solid-fuel') { it.fuelAccel = 1.2; it.fuelTopSpeed = 1.05; }
  if (id === 'rocket-fuel') { it.fuelAccel = 1.8; it.fuelTopSpeed = 1.15; }
  if (id === 'nuclear-fuel') { it.fuelAccel = 2.5; it.fuelTopSpeed = 1.15; }
  if (['blueprint', 'deconstruction-planner', 'upgrade-planner', 'blueprint-book', 'red-wire', 'green-wire', 'spidertron-remote'].includes(id)) it.tool = true;
  if (id === 'red-wire' || id === 'green-wire' || id === 'rocket-part') it.hidden = id === 'rocket-part';
  ITEMS[id] = it;
}
ITEMS['wood'].fuel = 2e6; ITEMS['wood'].fuelCat = 'chemical';
ITEMS['coal'].fuel = 4e6; ITEMS['coal'].fuelCat = 'chemical';
ITEMS['solid-fuel'].fuel = 12e6;
ITEMS['rocket-fuel'].fuel = 100e6;
ITEMS['nuclear-fuel'].fuel = 1.21e9;
ITEMS['uranium-fuel-cell'].fuel = 8e9;

export const itemName = (id: string) => ITEMS[id]?.name || FLUIDS[id]?.name || id;

// ---------- Build recipes ----------
export const RECIPES: Record<string, RecipeProto> = {};
const HAND_CATS = new Set(['crafting']);
for (const [id, g] of Object.entries(GEN_RECIPES)) {
  const ing = g.ing.map(([i, n]: [string, number]) => ({ id: i, n, fluid: isFluid(i) }));
  let res = g.res.map(([i, n]: [string, number]) => ({ id: i, n, fluid: isFluid(i) }));
  if (id === 'uranium-processing') res = [{ id: 'uranium-235', n: 1, fluid: false, p: 0.007 }, { id: 'uranium-238', n: 1, fluid: false, p: 0.993 }];
  const main = res.length === 1 ? res[0].id : (id === 'uranium-processing' ? 'uranium-235' : id === 'kovarex-enrichment-process' ? 'uranium-235' : id === 'nuclear-fuel-reprocessing' ? 'uranium-238' : res[0].id);
  const sub = subOf[id] || subOf[main] || ['intermediate-products', 'intermediate-product', 9999];
  const hasFluid = ing.some(x => x.fluid) || res.some(x => x.fluid);
  const r: RecipeProto = {
    id, name: g.name, time: g.time, cat: g.cat, ing, res, enabled: !!g.enabled, main,
    group: sub[0], subgroup: sub[1], order: sub[2], hand: HAND_CATS.has(g.cat) && !hasFluid,
    allowProd: false,
  };
  if (res.length > 1 || res[0].fluid || id !== main) r.icon = id;
  RECIPES[id] = r;
}
// Productivity modules are allowed on intermediate products (Factorio rule)
const PROD_OK = new Set(['iron-plate', 'copper-plate', 'steel-plate', 'stone-brick', 'copper-cable', 'iron-stick', 'iron-gear-wheel',
  'electronic-circuit', 'advanced-circuit', 'processing-unit', 'engine-unit', 'electric-engine-unit', 'flying-robot-frame', 'rocket-part',
  'low-density-structure', 'rocket-fuel', 'nuclear-fuel', 'uranium-processing', 'uranium-fuel-cell', 'nuclear-fuel-reprocessing',
  'kovarex-enrichment-process', 'plastic-bar', 'sulfur', 'battery', 'explosives', 'lubricant', 'sulfuric-acid', 'basic-oil-processing',
  'advanced-oil-processing', 'coal-liquefaction', 'heavy-oil-cracking', 'light-oil-cracking', 'solid-fuel-from-light-oil',
  'solid-fuel-from-heavy-oil', 'solid-fuel-from-petroleum-gas', 'automation-science-pack', 'logistic-science-pack', 'military-science-pack',
  'chemical-science-pack', 'production-science-pack', 'utility-science-pack', 'empty-barrel', 'barrel', 'concrete', 'refined-concrete', 'landfill']);
for (const r of Object.values(RECIPES)) r.allowProd = PROD_OK.has(r.id);
RECIPES['rocket-part'].hidden = true;
export const SMELT_RECIPE_FOR: Record<string, string> = {};
for (const r of Object.values(RECIPES)) if (r.cat === 'smelting') SMELT_RECIPE_FOR[r.ing[0].id] = r.id;

// Recipes producing an item (for handcraft intermediate resolution)
export const RECIPES_FOR_ITEM: Record<string, string[]> = {};
for (const r of Object.values(RECIPES)) for (const p of r.res) (RECIPES_FOR_ITEM[p.id] = RECIPES_FOR_ITEM[p.id] || []).push(r.id);

// ---------- Technologies ----------
const LEVEL_EFFECTS: Record<string, (lvl: number) => TechEffect[]> = {
  'physical-projectile-damage': l => {
    const b = [0.1, 0.1, 0.2, 0.2, 0.2, 0.4][l - 1] ?? 0.4; const t = [0.1, 0.1, 0.2, 0.2, 0.2, 0.4][l - 1] ?? 0.7; const c = [0, 0, 0, 0, 0.9, 1.3][l - 1] ?? 1;
    const e: TechEffect[] = [{ type: 'ammo-damage', target: 'bullet', value: b }, { type: 'turret-attack', target: 'gun-turret', value: t }, { type: 'ammo-damage', target: 'shotgun', value: b }];
    if (c) e.push({ type: 'ammo-damage', target: 'cannon', value: c });
    return e;
  },
  'weapon-shooting-speed': l => {
    const b = [0.1, 0.2, 0.2, 0.3, 0.3, 0.4][l - 1]; const s = [0.1, 0.2, 0.2, 0.3, 0.4, 0.4][l - 1]; const r = [0, 0, 0.5, 0.7, 0.9, 1.3][l - 1]; const c = [0, 0, 0, 0, 0.8, 1.5][l - 1];
    const e: TechEffect[] = [{ type: 'gun-speed', target: 'bullet', value: b }, { type: 'gun-speed', target: 'shotgun', value: s }];
    if (r) e.push({ type: 'gun-speed', target: 'rocket', value: r });
    if (c) e.push({ type: 'gun-speed', target: 'cannon', value: c });
    return e;
  },
  'stronger-explosives': l => {
    const g = [0.25, 0.2, 0.2, 0.2, 0.2, 0.2][l - 1] ?? 0.2; const m = [0, 0.2, 0.2, 0.2, 0.2, 0.2][l - 1] ?? 0.2; const r = [0, 0, 0.3, 0.4, 0.5, 0.6][l - 1] ?? 0.5;
    const e: TechEffect[] = [{ type: 'ammo-damage', target: 'grenade', value: g }];
    if (m) e.push({ type: 'ammo-damage', target: 'landmine', value: m });
    if (r) e.push({ type: 'ammo-damage', target: 'rocket', value: r });
    return e;
  },
  'refined-flammables': l => { const v = [0.2, 0.2, 0.2, 0.3, 0.3, 0.4][l - 1] ?? 0.2; return [{ type: 'ammo-damage', target: 'flamethrower', value: v }, { type: 'turret-attack', target: 'flamethrower-turret', value: v }]; },
  'energy-weapons-damage': l => {
    const a = [0.2, 0.2, 0.3, 0.4, 0.5, 0.7][l - 1] ?? 0.7; const d = [0, 0, 0, 0, 0.4, 0.6][l - 1] ?? 0.3; const x = [0, 0, 0, 0, 0, 0.7][l - 1] ?? 0.7;
    const e: TechEffect[] = [{ type: 'ammo-damage', target: 'laser', value: a }];
    if (d) e.push({ type: 'ammo-damage', target: 'beam', value: d });
    if (x) e.push({ type: 'ammo-damage', target: 'electric', value: x });
    return e;
  },
  'laser-shooting-speed': l => [{ type: 'gun-speed', target: 'laser', value: [0.1, 0.2, 0.3, 0.3, 0.4, 0.4, 0.5][l - 1] }],
  'follower-robot-count': l => [{ type: 'follower-robots', value: [5, 10, 10, 20][l - 1] ?? 25 }],
  'worker-robot-speed': l => [{ type: 'robot-speed', value: [0.35, 0.4, 0.45, 0.55, 0.65][l - 1] ?? 0.65 }],
  'worker-robot-cargo-size': () => [{ type: 'robot-cargo', value: 1 }],
  'inserter-capacity-bonus': l => {
    const bulk = [1, 1, 1, 1, 2, 2, 2][l - 1]; const ns = (l === 2 || l === 7) ? 1 : 0;
    const e: TechEffect[] = [{ type: 'bulk-inserter-capacity', value: bulk }];
    if (ns) e.push({ type: 'inserter-capacity', value: ns });
    return e;
  },
  'lab-research-speed': l => [{ type: 'lab-speed', value: [0.2, 0.3, 0.4, 0.5, 0.5, 0.6][l - 1] }],
  'mining-productivity': () => [{ type: 'mining-productivity', value: 0.1 }],
  'braking-force': l => [{ type: 'braking', value: [0.1, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15][l - 1] }],
  'artillery-shell-range': () => [{ type: 'artillery-range', value: 0.3 }],
  'artillery-shell-shooting-speed': () => [{ type: 'gun-speed', target: 'artillery', value: 1 }],
};
const SIMPLE_EFFECTS: Record<string, TechEffect[]> = {
  'toolbelt': [{ type: 'inventory-slots', value: 10 }],
  'steel-axe': [{ type: 'mining-speed', value: 1 }],
  'space-science-pack': [],
};
const INFINITE: Record<string, (lvl: number) => number> = {
  'physical-projectile-damage': l => 1000 * Math.pow(2, l - 7),
  'stronger-explosives': l => 1000 * Math.pow(2, l - 7),
  'refined-flammables': l => 1000 * Math.pow(2, l - 7),
  'energy-weapons-damage': l => 1000 * Math.pow(2, l - 7),
  'follower-robot-count': l => 1000 * (l - 4),
  'worker-robot-speed': l => 1000 * Math.pow(2, l - 6),
  'mining-productivity': l => 2500 * (l - 3),
  'artillery-shell-range': l => 1000 * Math.pow(2, l),
  'artillery-shell-shooting-speed': l => 1000 * Math.pow(3, l - 1) + 1000,
};

export const TECHS: Record<string, TechProto> = {};
let techOrder = 0;
for (const [id, g] of Object.entries(GEN_TECHS)) {
  const t: TechProto = {
    id, name: g.name, prereq: g.prereq, unlocks: g.unlocks, time: g.time || 0, packs: g.packs || [], count: g.count || 0,
    effects: [], maxLevel: 1, firstLevel: 1, icon: id, order: techOrder++,
  };
  if (g.trigger) t.trigger = g.trigger;
  for (const u of g.unlocks) t.effects.push({ type: 'unlock-recipe', target: u, value: 1 });
  if (SIMPLE_EFFECTS[id]) t.effects.push(...SIMPLE_EFFECTS[id]);
  if (g.levels) {
    const lv: TechLevel[] = [];
    for (const row of g.levels) {
      const n = parseInt(row.level, 10);
      if (row.level.endsWith('+')) {
        t.maxLevel = Infinity;
        t.costFormula = INFINITE[id];
        lv.push({ level: n, time: row.time, packs: row.packs, count: -1 });
      } else {
        lv.push({ level: n, time: row.time, packs: row.packs, count: row.count });
        t.maxLevel = Math.max(t.maxLevel, n);
      }
    }
    t.levelInfo = lv;
  }
  if (INFINITE[id] && t.maxLevel === 1 && (id === 'artillery-shell-range' || id === 'artillery-shell-shooting-speed')) {
    t.maxLevel = Infinity; t.costFormula = INFINITE[id];
    t.levelInfo = [{ level: 1, time: 60, packs: t.packs, count: -1 }];
  }
  TECHS[id] = t;
}

export function techLevelCost(t: TechProto, lvl: number): { time: number; packs: string[]; count: number } {
  if (!t.levelInfo) return { time: t.time, packs: t.packs, count: t.count };
  let row = t.levelInfo[0];
  for (const r of t.levelInfo) if (r.level <= lvl) row = r;
  const count = row.count > 0 && row.level === lvl ? row.count : (t.costFormula ? Math.round(t.costFormula(lvl)) : row.count);
  return { time: row.time, packs: row.packs, count };
}
export function techLevelEffects(t: TechProto, lvl: number): TechEffect[] {
  const f = LEVEL_EFFECTS[t.id];
  if (f) return f(lvl);
  return t.effects;
}

// Science pack colors used in tech GUI
export const SCIENCE_PACKS = ['automation-science-pack', 'logistic-science-pack', 'military-science-pack', 'chemical-science-pack', 'production-science-pack', 'utility-science-pack', 'space-science-pack'];

export function entityForItem(itemId: string): EntityProto | undefined {
  const p = ITEMS[itemId]?.place;
  return p ? ENTITIES[p] : undefined;
}

export const TILE_ITEMS = PLACE_TILE;
