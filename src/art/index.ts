// Builds all procedural art into the GPU atlas and DOM icon sheets.
import { Atlas } from '../engine/atlas';
import { setAtlas } from './sprites-common';
import { buildBelts, buildChests, buildInserters, buildPoles, buildPipes, buildMisc } from './sprites-logistics';
import { buildProduction } from './sprites-production';
import { buildTrees, buildRocks, buildOres, buildDecoratives, buildCharacter, buildEnemies, buildMilitary, buildVehicles, buildRailParts, buildEffects, buildOverlays } from './sprites-world';
import { drawIconCanvas, ICON, VIRTUAL_SIGNALS, RECIPE_ICON_IDS, HAS_CUSTOM_ICON } from './icons';
import { ITEMS, FLUIDS, RECIPES, TECHS, ENTITIES } from '../data/protos';
import { mkc, rrect, css, Ctx } from './draw';

export interface IconSheet { url: string; cols: number; size: number; index: Map<string, number>; w: number; h: number; }

const ENTITY_ICON_SPRITES: Record<string, string> = {};

export async function buildArt(atlas: Atlas, progress: (p: number, msg: string) => Promise<void>): Promise<{ icons: IconSheet; techs: IconSheet }> {
  setAtlas(atlas);
  const steps: [string, () => void][] = [
    ['Belts', () => { buildMisc(); buildBelts(); }],
    ['Logistics', () => { buildChests(); buildInserters(); buildPoles(); buildPipes(); }],
    ['Machines', () => buildProduction()],
    ['Nature', () => { buildTrees(); buildRocks(); buildOres(); buildDecoratives(); }],
    ['Engineer', () => buildCharacter()],
    ['Enemies', () => buildEnemies()],
    ['Military', () => { buildMilitary(); buildVehicles(); buildRailParts(); }],
    ['Effects', () => { buildEffects(); buildOverlays(); }],
  ];
  for (let i = 0; i < steps.length; i++) {
    await progress(i / (steps.length + 3), 'Drawing ' + steps[i][0].toLowerCase() + '...');
    steps[i][1]();
  }
  // icons
  await progress(steps.length / (steps.length + 3), 'Drawing icons...');
  const pendingByName = new Map<string, HTMLCanvasElement>();
  for (const p of atlas.pending) pendingByName.set(p.name, p.canvas as HTMLCanvasElement);
  const entityIcon = (id: string, ctx: Ctx): boolean => {
    const ent = ITEMS[id]?.place;
    if (!ent) return false;
    const names = [ent, ent + '-0', ent + '-2', ent + '-v', ent + '-base', ent + '-in-0', `ug-1-in-0`];
    let c: HTMLCanvasElement | undefined;
    for (const n of names) { c = pendingByName.get(n); if (c) break; }
    if (!c) return false;
    const s = Math.min(60 / c.width, 60 / c.height);
    const w = c.width * s, h = c.height * s;
    ctx.drawImage(c, 32 - w / 2, 32 - h / 2, w, h);
    return true;
  };
  const keys: string[] = [];
  for (const id of Object.keys(ITEMS)) keys.push(id);
  for (const f of Object.keys(FLUIDS)) keys.push('fluid:' + f);
  for (const r of Object.values(RECIPES)) if (r.icon) keys.push('recipe:' + r.id);
  for (const s of VIRTUAL_SIGNALS) keys.push(s);
  const cols = 24;
  const rows = Math.ceil(keys.length / cols);
  const [sheet, sctx] = mkc(cols * ICON, rows * ICON);
  const index = new Map<string, number>();
  keys.forEach((k, i) => {
    let c: HTMLCanvasElement;
    if (k.startsWith('fluid:')) c = drawIconCanvas(k.slice(6), entityIcon);
    else c = drawIconCanvas(k, entityIcon);
    atlas.add('icon:' + k, c);
    sctx.drawImage(c, (i % cols) * ICON, Math.floor(i / cols) * ICON);
    index.set(k, i);
  });
  // tech icons (128px)
  await progress((steps.length + 1) / (steps.length + 3), 'Drawing technologies...');
  const TS = 128;
  const techIds = Object.keys(TECHS);
  const tcols = 16;
  const [tsheet, tctx] = mkc(tcols * TS, Math.ceil(techIds.length / tcols) * TS);
  const tindex = new Map<string, number>();
  techIds.forEach((id, i) => {
    const t = TECHS[id];
    const x = (i % tcols) * TS, y = Math.floor(i / tcols) * TS;
    const c = techIcon(id, k => { const ii = index.get(k); if (ii === undefined) return null; return [sheet, (ii % cols) * ICON, Math.floor(ii / cols) * ICON]; });
    tctx.drawImage(c, x, y);
    tindex.set(id, i);
    void t;
  });
  await progress((steps.length + 2) / (steps.length + 3), 'Uploading textures...');
  const url = await canvasURL(sheet);
  const turl = await canvasURL(tsheet);
  return {
    icons: { url, cols, size: ICON, index, w: sheet.width, h: sheet.height },
    techs: { url: turl, cols: tcols, size: TS, index: tindex, w: tsheet.width, h: tsheet.height },
  };
}

function canvasURL(c: HTMLCanvasElement): Promise<string> {
  return new Promise(res => {
    if (c.toBlob) c.toBlob(b => res(b ? URL.createObjectURL(b) : c.toDataURL()), 'image/png');
    else res(c.toDataURL());
  });
}

const BONUS_ICON: Record<string, [string, string]> = {
  'physical-projectile-damage': ['firearm-magazine', '+'], 'weapon-shooting-speed': ['submachine-gun', '»'], 'stronger-explosives': ['grenade', '+'],
  'refined-flammables': ['flamethrower-ammo', '+'], 'energy-weapons-damage': ['laser-turret', '+'], 'laser-shooting-speed': ['laser-turret', '»'],
  'follower-robot-count': ['defender-capsule', '+'], 'worker-robot-speed': ['logistic-robot', '»'], 'worker-robot-cargo-size': ['logistic-robot', '+'],
  'inserter-capacity-bonus': ['bulk-inserter', '+'], 'lab-research-speed': ['lab', '»'], 'mining-productivity': ['electric-mining-drill', '+'],
  'braking-force': ['locomotive', '»'], 'toolbelt': ['iron-chest', '+'], 'steel-axe': ['steel-plate', '⛏'], 'artillery-shell-range': ['artillery-shell', '+'],
  'artillery-shell-shooting-speed': ['artillery-shell', '»'], 'space-science-pack': ['space-science-pack', ''], 'flammables': ['flamethrower-ammo', ''],
  'laser': ['laser-turret', ''], 'modules': ['speed-module', ''], 'uranium-mining': ['uranium-ore', ''],
};
function techIcon(id: string, getIcon: (k: string) => [HTMLCanvasElement, number, number] | null): HTMLCanvasElement {
  const [c, ctx] = mkc(128, 128);
  const t = TECHS[id];
  let key: string | null = null, badge = '';
  if (BONUS_ICON[id]) { key = BONUS_ICON[id][0]; badge = BONUS_ICON[id][1]; }
  else if (t.unlocks.length) {
    const r = RECIPES[t.unlocks[0]];
    key = r ? (r.icon ? 'recipe:' + r.id : r.main) : null;
    if (t.unlocks.length > 1) {
      // compose up to 3 icons
      const ks = t.unlocks.slice(0, 3).map(u => { const rr = RECIPES[u]; return rr ? (rr.icon ? 'recipe:' + rr.id : rr.main) : null; }).filter(Boolean) as string[];
      if (ks.length >= 2) {
        const pos = ks.length === 2 ? [[30, 34, 72], [70, 58, 72]] : [[20, 18, 64], [62, 30, 64], [36, 62, 64]];
        ks.forEach((k, i) => { const g = getIcon(k); if (g) ctx.drawImage(g[0], g[1], g[2], 64, 64, pos[i][0] - 8, pos[i][1] - 8, pos[i][2], pos[i][2]); });
        return c;
      }
    }
  }
  if (key) { const g = getIcon(key); if (g) ctx.drawImage(g[0], g[1], g[2], 64, 64, 8, 8, 112, 112); }
  if (badge) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.arc(100, 100, 22, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#ffe080'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(badge, 100, 102);
  }
  return c;
}
