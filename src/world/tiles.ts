// Tile definitions. IDs must match the terrain shader conventions:
// 1..19 natural land, 20..25 water, 30+ player-placed.
export interface TileDef { id: number; name: string; a: [number, number, number]; b: [number, number, number]; style: [number, number]; map: [number, number, number]; walk: number; absorb: number; water?: boolean; player?: boolean; item?: string; }

const T = (id: number, name: string, a: [number, number, number], b: [number, number, number], style: [number, number], walk = 1, absorb = 0.000018, extra: Partial<TileDef> = {}): TileDef => ({
  id, name, a, b, style, walk, absorb, map: [a[0] * 0.5 + b[0] * 0.5, a[1] * 0.5 + b[1] * 0.5, a[2] * 0.5 + b[2] * 0.5], ...extra,
});

export const TILES: TileDef[] = [];
const defs: TileDef[] = [
  T(0, 'out-of-map', [0, 0, 0], [0, 0, 0], [0, 0], 0, 0.0001),
  T(1, 'grass-1', [0.235, 0.27, 0.115], [0.33, 0.36, 0.16], [0.55, 0.35]),
  T(2, 'grass-2', [0.26, 0.285, 0.13], [0.36, 0.37, 0.18], [0.55, 0.35]),
  T(3, 'grass-3', [0.31, 0.31, 0.16], [0.4, 0.38, 0.2], [0.5, 0.35]),
  T(4, 'grass-4', [0.31, 0.27, 0.17], [0.39, 0.33, 0.2], [0.5, 0.35]),
  T(5, 'dry-dirt', [0.4, 0.34, 0.25], [0.46, 0.39, 0.28], [0.35, 0.4]),
  T(6, 'dirt-1', [0.39, 0.31, 0.21], [0.45, 0.36, 0.24], [0.4, 0.4]),
  T(7, 'dirt-2', [0.37, 0.29, 0.2], [0.43, 0.34, 0.23], [0.4, 0.4]),
  T(8, 'dirt-3', [0.35, 0.28, 0.19], [0.41, 0.33, 0.22], [0.4, 0.4]),
  T(9, 'dirt-4', [0.33, 0.27, 0.19], [0.39, 0.32, 0.22], [0.4, 0.4]),
  T(10, 'dirt-5', [0.31, 0.26, 0.18], [0.37, 0.31, 0.21], [0.4, 0.4]),
  T(11, 'dirt-6', [0.3, 0.25, 0.18], [0.36, 0.3, 0.21], [0.4, 0.4]),
  T(12, 'dirt-7', [0.29, 0.24, 0.17], [0.35, 0.29, 0.2], [0.4, 0.4]),
  T(13, 'sand-1', [0.56, 0.47, 0.31], [0.62, 0.52, 0.35], [0.25, 0.3], 1, 0.000015),
  T(14, 'sand-2', [0.53, 0.44, 0.29], [0.59, 0.49, 0.33], [0.25, 0.3], 1, 0.000015),
  T(15, 'sand-3', [0.5, 0.42, 0.28], [0.56, 0.47, 0.31], [0.25, 0.3], 1, 0.000015),
  T(16, 'red-desert-0', [0.45, 0.37, 0.22], [0.52, 0.41, 0.25], [0.4, 0.35], 1, 0.000015),
  T(17, 'red-desert-1', [0.53, 0.39, 0.25], [0.58, 0.43, 0.28], [0.35, 0.35], 1, 0.000015),
  T(18, 'red-desert-2', [0.5, 0.36, 0.23], [0.56, 0.4, 0.26], [0.35, 0.35], 1, 0.000015),
  T(19, 'red-desert-3', [0.47, 0.34, 0.22], [0.53, 0.38, 0.25], [0.35, 0.35], 1, 0.000015),
  T(20, 'water', [0.06, 0.2, 0.25], [0.2, 0.31, 0.27], [0, 0], 0, 0.000025, { water: true }),
  T(21, 'deep-water', [0.035, 0.13, 0.18], [0.12, 0.25, 0.27], [0, 0], 0, 0.000025, { water: true }),
  T(22, 'water-green', [0.06, 0.22, 0.17], [0.18, 0.3, 0.2], [0, 0], 0, 0.000025, { water: true }),
  T(23, 'deep-water-green', [0.04, 0.16, 0.12], [0.12, 0.24, 0.17], [0, 0], 0, 0.000025, { water: true }),
  T(24, 'water-shallow', [0.18, 0.28, 0.24], [0.24, 0.33, 0.27], [0, 0], 0.6, 0.000025, { water: true }),
  T(25, 'water-mud', [0.22, 0.26, 0.2], [0.27, 0.3, 0.22], [0, 0], 0.6, 0.000025, { water: true }),
  T(30, 'landfill', [0.4, 0.34, 0.25], [0.44, 0.37, 0.27], [0.3, 0.3], 1, 0, { player: true, item: 'landfill' }),
  T(31, 'stone-path', [0.44, 0.41, 0.36], [0.56, 0.52, 0.45], [0.2, 0.2], 1.3, 0, { player: true, item: 'stone-brick' }),
  T(32, 'concrete', [0.47, 0.46, 0.43], [0.5, 0.49, 0.46], [0.2, 0.2], 1.4, 0, { player: true, item: 'concrete' }),
  T(33, 'hazard-concrete', [0.7, 0.55, 0.12], [0.12, 0.12, 0.11], [0.2, 0.2], 1.4, 0, { player: true, item: 'hazard-concrete' }),
  T(34, 'hazard-concrete-right', [0.7, 0.55, 0.12], [0.12, 0.12, 0.11], [0.2, 0.2], 1.4, 0, { player: true, item: 'hazard-concrete' }),
  T(35, 'refined-concrete', [0.36, 0.36, 0.35], [0.4, 0.4, 0.38], [0.2, 0.2], 1.5, 0, { player: true, item: 'refined-concrete' }),
  T(36, 'refined-hazard-concrete', [0.6, 0.46, 0.1], [0.1, 0.1, 0.1], [0.2, 0.2], 1.5, 0, { player: true, item: 'refined-hazard-concrete' }),
  T(37, 'refined-hazard-concrete-right', [0.6, 0.46, 0.1], [0.1, 0.1, 0.1], [0.2, 0.2], 1.5, 0, { player: true, item: 'refined-hazard-concrete' }),
  T(38, 'nuclear-ground', [0.2, 0.19, 0.17], [0.26, 0.24, 0.2], [0.5, 0.5], 1, 0.0000125),
];
for (const d of defs) TILES[d.id] = d;
export const TILE_BY_NAME: Record<string, number> = {};
for (const d of defs) TILE_BY_NAME[d.name] = d.id;
export const isWaterTile = (t: number) => t >= 20 && t <= 25;
export const isPlayerTile = (t: number) => t >= 30 && t <= 37;
export const PLACE_TILE_ID: Record<string, number> = {
  'stone-path': 31, 'concrete': 32, 'hazard-concrete': 33, 'refined-concrete': 35, 'refined-hazard-concrete': 36, 'landfill': 30,
};
