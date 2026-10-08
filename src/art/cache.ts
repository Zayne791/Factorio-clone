// Caches the generated texture atlas and icon sheets in IndexedDB so later launches skip
// procedural drawing (seconds on a tablet). Keyed by a build-time hash of the art + data sources.
import type { Atlas, Sprite } from '../engine/atlas';
import type { IconSheet } from './index';

declare const __ART_VERSION__: string;
const VERSION = typeof __ART_VERSION__ === 'string' ? __ART_VERSION__ : 'dev';
const DB = 'factory-art', STORE = 'art';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function req<T>(r: IDBRequest<T>): Promise<T> { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

interface CachedArt {
  version: string;
  pages: Blob[];
  sprites: Sprite[];
  icons: Omit<IconSheet, 'url' | 'index'> & { index: [string, number][]; blob: Blob };
  techs: Omit<IconSheet, 'url' | 'index'> & { index: [string, number][]; blob: Blob };
}

async function decode(b: Blob): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = URL.createObjectURL(b);
  await img.decode();
  return img;
}

export async function loadArtCache(atlas: Atlas, gl: WebGL2RenderingContext): Promise<{ icons: IconSheet; techs: IconSheet } | null> {
  try {
    if (!('indexedDB' in window) || new URLSearchParams(location.search).has('nocache')) return null;
    const db = await open();
    const d = await req<CachedArt | undefined>(db.transaction(STORE, 'readonly').objectStore(STORE).get('atlas'));
    db.close();
    if (!d || d.version !== VERSION || !d.pages?.length) return null;
    const pages = await Promise.all(d.pages.map(decode));
    atlas.buildFromCache(gl, pages, d.sprites);
    for (const p of pages) URL.revokeObjectURL(p.src);
    const sheet = (s: CachedArt['icons']): IconSheet => ({ url: URL.createObjectURL(s.blob), cols: s.cols, size: s.size, w: s.w, h: s.h, index: new Map(s.index), blob: s.blob });
    return { icons: sheet(d.icons), techs: sheet(d.techs) };
  } catch (e) {
    console.warn('art cache load failed', e);
    return null;
  }
}

function toBlob(c: HTMLCanvasElement): Promise<Blob | null> { return new Promise(res => c.toBlob(b => res(b), 'image/png')); }

export async function saveArtCache(atlas: Atlas, sheets: { icons: IconSheet; techs: IconSheet }) {
  try {
    if (!('indexedDB' in window) || !atlas.pageCanvases || !sheets.icons.blob || !sheets.techs.blob) return;
    const pages: Blob[] = [];
    for (const c of atlas.pageCanvases) {
      const b = await toBlob(c);
      if (!b) return;
      pages.push(b);
      await new Promise(r => setTimeout(r, 30));   // keep the UI responsive between encodes
    }
    const strip = (s: IconSheet) => ({ cols: s.cols, size: s.size, w: s.w, h: s.h, index: [...s.index.entries()], blob: s.blob! });
    const data: CachedArt = { version: VERSION, pages, sprites: [...atlas.sprites.values()], icons: strip(sheets.icons), techs: strip(sheets.techs) };
    const db = await open();
    await req(db.transaction(STORE, 'readwrite').objectStore(STORE).put(data, 'atlas'));
    db.close();
    atlas.pageCanvases = null;
  } catch (e) {
    console.warn('art cache save failed', e);
  }
}
