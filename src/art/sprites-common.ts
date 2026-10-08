// Shared helpers for entity sprite generation.
import { Atlas, PX } from '../engine/atlas';
import { mkc, makeShadowAt, Ctx } from './draw';

export let A: Atlas;
export function setAtlas(a: Atlas) { A = a; }

export interface Frame { c: HTMLCanvasElement; ctx: Ctx; x0: number; y0: number; W: number; H: number; top: number; bottom: number; side: number; wT: number; hT: number; }

// Canvas with footprint wT x hT tiles plus margins (tiles). x0,y0 = footprint top-left in canvas px.
export function frame(wT: number, hT: number, top = 0.6, bottom = 0.25, side = 0.25): Frame {
  const W = (wT + side * 2) * PX, H = (hT + top + bottom) * PX;
  const [c, ctx] = mkc(W, H);
  return { c, ctx, x0: side * PX, y0: top * PX, W, H, top, bottom, side, wT, hT };
}
export function add(name: string, f: Frame, shadow?: { dx?: number; dy?: number; k?: number; ground?: number; alpha?: number }) {
  const oy = (f.bottom - f.top) / 2;
  A.add(name, f.c, 0, oy);
  if (shadow) {
    const g = shadow.ground ?? (f.y0 + f.hT * PX);
    const s = makeShadowAt(f.c, shadow.dx ?? 0, shadow.dy ?? 0, shadow.k ?? 0, g, shadow.alpha ?? 1);
    A.add(name + '-shadow', s, 0, oy);
  }
}
export function addRaw(name: string, c: HTMLCanvasElement, ox = 0, oy = 0, scale = PX) { A.add(name, c, ox, oy, scale); }
export { PX };
