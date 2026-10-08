// Texture atlas (WebGL2 texture array) built from procedurally drawn canvases.

export interface Sprite {
  name: string; layer: number;
  u0: number; v0: number; u1: number; v1: number;
  pw: number; ph: number;      // pixel size
  w: number; h: number;        // world size in tiles
  ox: number; oy: number;      // offset of sprite center relative to anchor, in tiles
}

export const PX = 64; // pixels per tile for entity sprites
const PAGE = 2048;
const PAD = 3;

interface Pending { name: string; canvas: HTMLCanvasElement | OffscreenCanvas; ox: number; oy: number; scale: number; }

export class Atlas {
  sprites = new Map<string, Sprite>();
  pending: Pending[] = [];
  tex: WebGLTexture | null = null;
  pages = 0;

  add(name: string, canvas: HTMLCanvasElement | OffscreenCanvas, ox = 0, oy = 0, scale = PX) {
    this.pending.push({ name, canvas, ox, oy, scale });
  }
  get(name: string): Sprite | undefined { return this.sprites.get(name); }
  has(name: string) { return this.sprites.has(name) || this.pending.some(p => p.name === name); }

  build(gl: WebGL2RenderingContext) {
    const items = this.pending.slice().sort((a, b) => b.canvas.height - a.canvas.height || b.canvas.width - a.canvas.width);
    // Shelf pack into pages
    const placements: { p: Pending; page: number; x: number; y: number }[] = [];
    let page = 0, x = 0, y = 0, shelfH = 0;
    for (const p of items) {
      const w = p.canvas.width + PAD * 2, h = p.canvas.height + PAD * 2;
      if (w > PAGE || h > PAGE) { console.warn('sprite too big', p.name, w, h); continue; }
      if (x + w > PAGE) { x = 0; y += shelfH; shelfH = 0; }
      if (y + h > PAGE) { page++; x = 0; y = 0; shelfH = 0; }
      placements.push({ p, page, x, y });
      x += w; shelfH = Math.max(shelfH, h);
    }
    this.pages = page + 1;
    const pageCanvases: HTMLCanvasElement[] = [];
    for (let i = 0; i < this.pages; i++) {
      const c = document.createElement('canvas'); c.width = PAGE; c.height = PAGE;
      pageCanvases.push(c);
    }
    for (const pl of placements) {
      const ctx = pageCanvases[pl.page].getContext('2d')!;
      const cw = pl.p.canvas.width, ch = pl.p.canvas.height;
      const sx = pl.x + PAD, sy = pl.y + PAD;
      // Extrude edges into padding to reduce bleeding
      ctx.drawImage(pl.p.canvas as any, 0, 0, cw, 1, sx, sy - PAD, cw, PAD);
      ctx.drawImage(pl.p.canvas as any, 0, ch - 1, cw, 1, sx, sy + ch, cw, PAD);
      ctx.drawImage(pl.p.canvas as any, 0, 0, 1, ch, sx - PAD, sy, PAD, ch);
      ctx.drawImage(pl.p.canvas as any, cw - 1, 0, 1, ch, sx + cw, sy, PAD, ch);
      ctx.drawImage(pl.p.canvas as any, sx, sy);
      this.sprites.set(pl.p.name, {
        name: pl.p.name, layer: pl.page,
        u0: sx / PAGE, v0: sy / PAGE, u1: (sx + cw) / PAGE, v1: (sy + ch) / PAGE,
        pw: cw, ph: ch, w: cw / pl.p.scale, h: ch / pl.p.scale, ox: pl.p.ox, oy: pl.p.oy,
      });
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    const levels = 5;
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, PAGE, PAGE, this.pages);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    for (let i = 0; i < this.pages; i++) {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, PAGE, PAGE, 1, gl.RGBA, gl.UNSIGNED_BYTE, pageCanvases[i]);
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, levels - 1);
    this.tex = tex;
    this.pending = [];
    (this as any)._debugPages = pageCanvases;
  }
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
