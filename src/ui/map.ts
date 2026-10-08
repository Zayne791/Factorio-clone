// Full map window.
import { Win, h, UI } from './ui';
import { drawMap } from './minimap';

export class MapWindow extends Win {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D;
  cx: number; cy: number; scale = 2;
  pollution = false;
  drag: [number, number, number, number] | null = null;
  pinch: { d: number; s: number } | null = null;
  ptrs = new Map<number, [number, number]>();
  constructor(ui: UI) {
    super(ui, 'Map', 'mapwin', 'map');
    this.el.style.inset = '8px';
    this.cx = ui.g.player.x; this.cy = ui.g.player.y;
    const bar = h('div', 'row', this.body);
    const pb = h('div', 'btn small', bar, 'Pollution'); pb.onclick = () => { this.pollution = !this.pollution; pb.classList.toggle('active', this.pollution); };
    const cb = h('div', 'btn small', bar, 'Center on player'); cb.onclick = () => { this.cx = ui.g.player.x; this.cy = ui.g.player.y; };
    h('div', 'spacer', bar);
    h('div', 'label', bar, 'Drag to pan · pinch/scroll to zoom');
    this.body.style.flex = '1';
    this.canvas = h('canvas', '', this.body) as HTMLCanvasElement;
    this.canvas.id = 'bigmap';
    this.canvas.style.marginTop = '6px';
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.addEventListener('pointerdown', e => { this.canvas.setPointerCapture(e.pointerId); this.ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (this.ptrs.size === 1) this.drag = [e.clientX, e.clientY, this.cx, this.cy]; else { const [a, b] = [...this.ptrs.values()]; this.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: this.scale }; this.drag = null; } });
    this.canvas.addEventListener('pointermove', e => {
      if (!this.ptrs.has(e.pointerId)) return;
      this.ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.pinch && this.ptrs.size >= 2) { const [a, b] = [...this.ptrs.values()]; this.scale = Math.max(0.25, Math.min(16, this.pinch.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / this.pinch.d)); return; }
      if (this.drag) { this.cx = this.drag[2] - (e.clientX - this.drag[0]) / this.scale; this.cy = this.drag[3] - (e.clientY - this.drag[1]) / this.scale; }
    });
    const up = (e: PointerEvent) => { this.ptrs.delete(e.pointerId); if (this.ptrs.size < 2) this.pinch = null; if (!this.ptrs.size) this.drag = null; };
    this.canvas.addEventListener('pointerup', up); this.canvas.addEventListener('pointercancel', up);
    this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.scale = Math.max(0.25, Math.min(16, this.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); }, { passive: false });
  }
  center() { }
  update() {
    const c = this.canvas;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    drawMap(this.ui.g, this.ctx, this.cx, this.cy, this.scale * dpr, c.width, c.height, { pollution: this.pollution });
  }
}
