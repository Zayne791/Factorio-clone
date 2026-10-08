// Global game reference and shared helpers.
import type { Game } from './game';

export const G: { game: Game } = { game: null as any };
export const TPS = 60;
export const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export type Dir = 0 | 1 | 2 | 3;

export function rotOffset(x: number, y: number, dir: number): [number, number] {
  switch (dir & 3) {
    case 0: return [x, y];
    case 1: return [-y, x];
    case 2: return [-x, -y];
    default: return [y, -x];
  }
}
export const opposite = (d: number) => ((d + 2) & 3) as Dir;
export const tileKey = (x: number, y: number) => ((x + 0x8000) << 16) | ((y + 0x8000) & 0xffff);
export const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function fmtNum(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'G';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e4) return Math.floor(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.floor(n));
}
export function fmtPower(w: number): string {
  if (w >= 1e9) return (w / 1e9).toFixed(2) + ' GW';
  if (w >= 1e6) return (w / 1e6).toFixed(w >= 1e8 ? 0 : 1) + ' MW';
  if (w >= 1e3) return (w / 1e3).toFixed(w >= 1e5 ? 0 : 1) + ' kW';
  return w.toFixed(0) + ' W';
}
export function fmtEnergy(j: number): string {
  if (j >= 1e9) return (j / 1e9).toFixed(1) + ' GJ';
  if (j >= 1e6) return (j / 1e6).toFixed(1) + ' MJ';
  if (j >= 1e3) return (j / 1e3).toFixed(1) + ' kJ';
  return j.toFixed(0) + ' J';
}
export function fmtTime(sec: number): string {
  if (sec < 60) return (Math.round(sec * 10) / 10) + 's';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
