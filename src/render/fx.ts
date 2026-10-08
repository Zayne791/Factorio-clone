// Visual effects: smoke, explosions, projectiles traces, fire, muzzle flashes, floating text.
import { G } from '../core';
import type { Renderer } from '../engine/renderer';
import { rgba, additive, WHITE } from '../engine/renderer';

interface Particle { kind: number; x: number; y: number; vx: number; vy: number; t: number; life: number; size: number; rot: number; color?: number; x2?: number; y2?: number; }
const SMOKE = 0, EXPL = 1, TRACER = 2, LASER = 3, MUZZLE = 4, SPARK = 5, ACID = 6, FIRE = 7, BLOOD = 8;

export class Effects {
  parts: Particle[] = [];
  texts: { x: number; y: number; text: string; color: string; t: number }[] = [];
  update() {
    const ps = this.parts;
    let j = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.t++;
      p.x += p.vx; p.y += p.vy;
      if (p.kind === SMOKE) { p.vx *= 0.98; p.vy *= 0.98; p.size *= 1.006; }
      if (p.t < p.life) ps[j++] = p;
    }
    ps.length = j;
    for (const t of this.texts) t.t++;
    this.texts = this.texts.filter(t => t.t < 120);
  }
  smoke(x: number, y: number, size = 1) {
    if (this.parts.length > 3000) return;
    this.parts.push({ kind: SMOKE, x, y, vx: 0.004 + Math.random() * 0.006, vy: -0.012 - Math.random() * 0.008, t: 0, life: 150 + Math.random() * 80, size: 0.6 * size, rot: Math.random() * 6 });
  }
  explosion(x: number, y: number, size = 1) {
    this.parts.push({ kind: EXPL, x, y, vx: 0, vy: 0, t: 0, life: 36, size: size * 2.2, rot: Math.random() * 6 });
    for (let i = 0; i < 4 * size; i++) this.smoke(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size, size * 1.5);
    for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, s = 0.05 + Math.random() * 0.1; this.parts.push({ kind: SPARK, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 20 + Math.random() * 20, size: 0.1, rot: 0 }); }
  }
  tracer(x1: number, y1: number, x2: number, y2: number) {
    this.parts.push({ kind: TRACER, x: x1, y: y1, x2, y2, vx: 0, vy: 0, t: 0, life: 4, size: 0.08, rot: 0 });
  }
  laser(x1: number, y1: number, x2: number, y2: number) {
    this.parts.push({ kind: LASER, x: x1, y: y1, x2, y2, vx: 0, vy: 0, t: 0, life: 10, size: 0.18, rot: 0 });
  }
  muzzle(x: number, y: number) { this.parts.push({ kind: MUZZLE, x, y, vx: 0, vy: 0, t: 0, life: 3, size: 0.6, rot: 0 }); }
  acid(x: number, y: number, size = 1) { this.parts.push({ kind: ACID, x, y, vx: 0, vy: 0, t: 0, life: 300, size, rot: Math.random() * 6 }); }
  fire(x: number, y: number, life = 120) { this.parts.push({ kind: FIRE, x, y, vx: 0, vy: -0.004, t: 0, life, size: 0.8 + Math.random() * 0.4, rot: 0 }); }
  blood(x: number, y: number) { this.parts.push({ kind: BLOOD, x, y, vx: 0, vy: 0, t: 0, life: 900, size: 0.8 + Math.random() * 0.6, rot: Math.random() * 6 }); }
  flyText(x: number, y: number, text: string, color = '#ffffff') {
    // stack texts at same spot
    const n = this.texts.filter(t => Math.abs(t.x - x) < 1 && t.t < 30).length;
    this.texts.push({ x, y: y - n * 0.4, text, color, t: 0 });
  }
  draw(r: Renderer) {
    const a = r.atlas;
    for (const p of this.parts) {
      const f = p.t / p.life;
      switch (p.kind) {
        case SMOKE: r.draw('air', a.get('smoke'), p.x, p.y, rgba(0.55, 0.55, 0.55, 0.45 * (1 - f)), p.rot, p.size * (1 + f * 2), 1e6); break;
        case EXPL: {
          const fr = Math.min(11, Math.floor(f * 12));
          r.draw('air', a.get('explosion-' + fr), p.x, p.y, WHITE, p.rot, p.size, 1e6);
          r.draw('light', a.get('light'), p.x, p.y, additive(1, 0.6, 0.3, 1 - f), 0, p.size * 6);
          break;
        }
        case TRACER: r.line('air', a.get('tracer'), p.x, p.y, p.x2!, p.y2!, 0.08, additive(1, 0.9, 0.6, 1 - f)); break;
        case LASER: r.line('air', a.get('laser-beam'), p.x, p.y, p.x2!, p.y2!, 0.2, additive(1, 0.3, 0.2, 1 - f)); r.draw('light', a.get('light'), p.x2!, p.y2!, additive(1, 0.3, 0.2), 0, 2); break;
        case MUZZLE: r.draw('air', a.get('muzzle'), p.x, p.y, additive(1, 0.9, 0.6, 1), 0, p.size, 1e6); r.draw('light', a.get('light'), p.x, p.y, additive(1, 0.8, 0.5), 0, 3); break;
        case SPARK: r.drawRect('air', a.get('white'), p.x, p.y, 0.08, 0.08, additive(1, 0.7, 0.3, 1 - f), 0, 1e6); break;
        case ACID: r.draw('ground2', a.get('acid'), p.x, p.y, rgba(1, 1, 1, 0.7 * (1 - f)), p.rot, p.size); break;
        case FIRE: {
          const fl = 0.7 + 0.3 * Math.sin(p.t * 0.5 + p.rot);
          r.draw('objects', a.get('flame'), p.x, p.y - 0.3, additive(1, 0.6, 0.2, fl * (1 - f * 0.5)), 0, p.size, p.y);
          r.draw('light', a.get('light'), p.x, p.y, additive(1, 0.5, 0.2, 1 - f), 0, 4);
          break;
        }
        case BLOOD: r.draw('ground2', a.get('blood'), p.x, p.y, rgba(1, 1, 1, 0.8 * (1 - f)), p.rot, p.size); break;
      }
    }
  }
}
