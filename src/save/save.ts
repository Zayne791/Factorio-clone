// Save/load: full world serialization, gzip compression, IndexedDB storage, file export/import.
import { Game } from '../game';
import { Chunk, chunkKey } from '../world/world';
import { Entity, createEntity, setNextId, getNextId } from '../sim/entity';
import { G } from '../core';
import { Tree, Rock, Fish, ItemOnGround, Remnants } from '../sim/simple';
import { MapSettings } from '../world/mapgen';

const VERSION = 1;

function b64(u8: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH) as any);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export function serializeGame(g: Game): any {
  const chunks: any[] = [];
  for (const c of g.world.chunks.values()) {
    chunks.push([c.cx, c.cy, b64(c.tiles), b64(c.resType), b64(new Uint8Array(c.resAmount.buffer)), +c.pollution.toFixed(2), c.charted ? 1 : 0]);
  }
  const ents: any[] = [];
  const trees: number[] = [];
  const rocks: any[] = [];
  for (const e of g.world.entities.values()) {
    if (e.dead) continue;
    if (e === g.player.character) continue;
    if (e instanceof Tree) { trees.push(Math.round(e.x * 100), Math.round(e.y * 100), e.variant, e.leafStage); continue; }
    if (e instanceof Rock) { rocks.push([e.x, e.y, e.sub, e.variant]); continue; }
    if ((e as any).noSave) continue;
    if ((e as any).isEnemyUnit) continue;
    let d: any;
    try { d = e.serialize(); } catch { d = {}; }
    ents.push([e.id, e.name, e.type, +e.x.toFixed(4), +e.y.toFixed(4), e.dir, +e.health.toFixed(1), e.flags, d, e.decon ? 1 : 0]);
  }
  return {
    v: VERSION, name: g.gameName, settings: g.settings, tick: g.tick, playTicks: g.playTicks, daytime: g.daytime, nextId: getNextId(),
    research: g.research.serialize(), stats: g.stats.serialize(), player: g.player.serialize(), chunks, ents, trees, rocks,
    rockets: g.rocketsLaunched, victory: g.victory, pollutionTotal: g.totalPollutionProduced,
    enemies: g.enemies?.serialize?.(), trains: g.trains?.serialize?.(), logistics: g.logistics?.serialize?.(), circuits: g.circuits?.serialize?.(),
  };
}

export function loadGameState(data: any, setup: (g: Game) => any): Game {
  const settings: MapSettings = data.settings;
  const g = new Game(settings);
  const gen = g.world.onChunkGenerated;
  g.world.onChunkGenerated = null;
  for (const [cx, cy, t, rt, ra, pol, ch] of data.chunks) {
    const amounts = unb64(ra);
    const c = new Chunk(cx, cy, unb64(t), unb64(rt), new Uint32Array(amounts.buffer, amounts.byteOffset, amounts.byteLength / 4));
    c.pollution = pol; c.charted = !!ch;
    if (pol > 0) g.pollutionChunks.add(c);
    g.world.chunks.set(chunkKey(cx, cy), c);
  }
  g.world.tileVersion++;
  g.world.onChunkGenerated = gen;
  setup(g);
  g.gameName = data.name || 'Loaded game';
  g.tick = data.tick; g.playTicks = data.playTicks || data.tick; g.daytime = data.daytime;
  g.rocketsLaunched = data.rockets || 0; g.victory = !!data.victory; g.totalPollutionProduced = data.pollutionTotal || 0;
  // natural entities
  const tr = data.trees as number[];
  for (let i = 0; i < tr.length; i += 4) { const t = new Tree('tree', tr[i] / 100, tr[i + 1] / 100, 0); t.variant = tr[i + 2]; t.leafStage = tr[i + 3]; g.world.addEntity(t); }
  for (const [x, y, sub, v] of data.rocks) { const r = new Rock('rock', x, y, 0); r.sub = sub; r.variant = v; g.world.addEntity(r); }
  // entities
  const created: [Entity, any][] = [];
  let maxId = data.nextId || 1;
  for (const [id, name, type, x, y, dir, hp, flags, d, decon] of data.ents) {
    let e: Entity;
    try {
      if (type === 'item-on-ground') { e = new ItemOnGround('item-on-ground', x, y, 0); }
      else if (type === 'fish') e = new Fish('fish', x, y, 0);
      else if (type === 'remnants') e = new Remnants('remnants', x, y, 0);
      else if (type === 'character-corpse') { g.spawnCorpse(x, y, (d.i?.s || []).filter(Boolean).map((s: any) => ({ id: s[0], n: s[1] }))); continue; }
      else e = createEntity(name, x, y, dir);
    } catch (err) { console.warn('load failed', name, err); continue; }
    e.id = id; e.health = hp; e.flags = flags || 0; e.decon = !!decon;
    maxId = Math.max(maxId, id + 1);
    created.push([e, d]);
  }
  setNextId(maxId);
  for (const [e, d] of created) {
    if (e.type === 'item-on-ground' || e.type === 'fish' || e.type === 'remnants') { e.load(d); g.world.addEntity(e, false); continue; }
    if ((e as any).isGhost) { g.logistics?.restoreGhost?.(e, d); continue; }
    if (e.type === 'straight-rail' || e.type === 'curved-rail') { g.rails?.restore?.(e, d); continue; }
    // preload state needed before onPlaced
    if (e.type === 'electric-pole') e.load(d);
    if (e.type === 'underground-belt') e.load(d);
    g.addEntity(e);
  }
  for (const [e, d] of created) {
    if (['item-on-ground', 'fish', 'remnants', 'electric-pole'].includes(e.type)) continue;
    try { e.load(d); } catch (err) { console.warn('state load failed', e.name, err); }
  }
  g.power.restoreWires();
  g.belts.dirty = true; g.fluids.dirty = true;
  // player
  g.player.load(data.player);
  g.world.addUnit(g.player.character);
  g.research.load(data.research);
  g.research.rebuildBonuses();
  g.player.resizeInventory();
  g.stats.load(data.stats);
  g.enemies?.load?.(data.enemies);
  g.trains?.load?.(data.trains);
  g.logistics?.load?.(data.logistics);
  g.circuits?.load?.(data.circuits);
  return g;
}

// ---------------- compression ----------------
export async function compress(obj: any): Promise<Blob> {
  const json = JSON.stringify(obj);
  if (typeof (window as any).CompressionStream === 'function') {
    const cs = new (window as any).CompressionStream('gzip');
    const stream = new Blob([json]).stream().pipeThrough(cs);
    return await new Response(stream).blob();
  }
  return new Blob([json], { type: 'application/json' });
}
export async function decompress(blob: Blob): Promise<any> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b && typeof (window as any).DecompressionStream === 'function') {
    const ds = new (window as any).DecompressionStream('gzip');
    const text = await new Response(blob.stream().pipeThrough(ds)).text();
    return JSON.parse(text);
  }
  return JSON.parse(await blob.text());
}

// ---------------- IndexedDB ----------------
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('factory-saves', 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('saves')) d.createObjectStore('saves', { keyPath: 'name' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export interface SaveMeta { name: string; date: number; playTicks: number; size: number; }
export async function listSaves(): Promise<SaveMeta[]> {
  try {
    const d = await db();
    return await new Promise((res, rej) => {
      const out: SaveMeta[] = [];
      const tx = d.transaction('saves', 'readonly');
      const req = tx.objectStore('saves').openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { const v = c.value; out.push({ name: v.name, date: v.date, playTicks: v.playTicks, size: v.blob?.size || 0 }); c.continue(); } else res(out.sort((a, b) => b.date - a.date)); };
      req.onerror = () => rej(req.error);
    });
  } catch { return []; }
}
export async function writeSave(name: string, g: Game): Promise<void> {
  const blob = await compress(serializeGame(g));
  const d = await db();
  await new Promise<void>((res, rej) => {
    const tx = d.transaction('saves', 'readwrite');
    tx.objectStore('saves').put({ name, date: Date.now(), playTicks: g.playTicks, blob });
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
  try { localStorage.setItem('factory-last-save', name); } catch { /* */ }
}
export async function readSave(name: string): Promise<any> {
  const d = await db();
  const rec: any = await new Promise((res, rej) => {
    const tx = d.transaction('saves', 'readonly');
    const req = tx.objectStore('saves').get(name);
    req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
  });
  if (!rec) throw new Error('Save not found');
  return decompress(rec.blob);
}
export async function deleteSave(name: string) {
  const d = await db();
  await new Promise<void>((res, rej) => { const tx = d.transaction('saves', 'readwrite'); tx.objectStore('saves').delete(name); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
export async function exportSave(name: string) {
  const d = await db();
  const rec: any = await new Promise((res) => { const tx = d.transaction('saves', 'readonly'); const r = tx.objectStore('saves').get(name); r.onsuccess = () => res(r.result); });
  if (!rec) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(rec.blob);
  a.download = name.replace(/[^a-z0-9_-]+/gi, '_') + '.factorysave';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
export async function importSaveFile(file: File): Promise<any> { return decompress(file); }
