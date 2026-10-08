// Input: keyboard (Factorio bindings), mouse/trackpad, Apple Pencil (hover, tap, long-press), touch (joystick, pinch).
import { G, Dir, DIRS, clamp } from '../core';
import { Game } from '../game';
import { Renderer } from '../engine/renderer';
import { Entity } from '../sim/entity';
import { ENTITIES, ITEMS, entityForItem } from '../data/protos';
import { Preview, ViewState } from '../render/world-render';
import { BeltBase } from '../sim/belts';
import { ElectricPole } from '../sim/power';
import { faceTo } from '../sim/player';
import { isWaterTile } from '../world/tiles';
import { useSpidertronRemote } from '../sim/spidertron';

export class Input {
  g: Game; r: Renderer; canvas: HTMLCanvasElement;
  keys = new Set<string>();
  mx = 0; my = 0;               // device px
  wx = 0; wy = 0;               // world
  hasPointer = false;
  buildDir: Dir = 0;
  alt = false;
  mining = false;
  leftDown = false;
  dragStart: [number, number] | null = null;
  dragAxis: 'x' | 'y' | null = null;
  dragLast: [number, number] | null = null;
  lastPlaced: [number, number] | null = null;
  view: ViewState = { hover: null, hoverTile: null, preview: null, alt: false };
  touchMode = false;
  mineMode = false;             // touch toggle: taps mine
  joy = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
  pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; type: string; moved: boolean; longPress: boolean }>();
  pinch: { d: number; zoom: number } | null = null;
  longPressTimer: any = null;
  shooting = false;
  pickingUp = false;
  zoomTarget = 64;
  onOpenEntity: ((e: Entity) => void) | null = null;
  onKey: ((k: string, e: KeyboardEvent) => boolean) | null = null;
  lastKeyboardUse = 0;
  sel: { x0: number; y0: number; mode: string } | null = null;

  constructor(g: Game, r: Renderer, canvas: HTMLCanvasElement) {
    this.g = g; this.r = r; this.canvas = canvas;
    this.zoomTarget = r.zoom;
    window.addEventListener('keydown', e => this.keyDown(e));
    window.addEventListener('keyup', e => { this.keys.delete(e.code); if (e.code === 'KeyF') this.pickingUp = false; if (e.code === 'Space' || e.code === 'KeyC') this.shooting = false; });
    window.addEventListener('blur', () => { this.keys.clear(); this.mining = false; this.leftDown = false; this.shooting = false; });
    canvas.addEventListener('pointerdown', e => this.pointerDown(e));
    window.addEventListener('pointermove', e => this.pointerMove(e));
    window.addEventListener('pointerup', e => this.pointerUp(e));
    window.addEventListener('pointercancel', e => this.pointerUp(e, true));
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    // iOS gesture prevention
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('touchmove', e => { if ((e.target as HTMLElement).closest?.('.scroll')) return; e.preventDefault(); }, { passive: false });
  }

  zoom(f: number) {
    const dpr = this.r.dpr;
    this.zoomTarget = clamp(this.zoomTarget * f, 10 * dpr, 160 * dpr);
  }

  // ---------- keyboard ----------
  keyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') { if (e.code === 'Escape') (e.target as HTMLElement).blur(); return; }
    this.lastKeyboardUse = performance.now();
    if (this.onKey && this.onKey(e.code, e)) { e.preventDefault(); return; }
    this.keys.add(e.code);
    const g = this.g, p = g.player;
    const shift = e.shiftKey, ctrl = e.ctrlKey || e.metaKey;
    switch (e.code) {
      case 'KeyR': this.rotate(shift ? -1 : 1); break;
      case 'KeyQ': this.pipette(); break;
      case 'KeyZ': this.dropCursor(); break;
      case 'KeyF': this.pickingUp = true; break;
      case 'Space': case 'KeyC': if (!ctrl) this.shooting = true; else if (e.code === 'KeyC') g.logistics?.startTool('copy'); break;
      case 'AltLeft': case 'AltRight': this.alt = !this.alt; e.preventDefault(); break;
      case 'Tab': { const v = p.character.vehicle as any; if (v && v.gunSel !== undefined) v.gunSel++; else p.selectedGun = (p.selectedGun + 1) % 3; e.preventDefault(); break; }
      case 'Enter': g.ui?.toggleVehicle?.(); break;
      case 'Equal': case 'NumpadAdd': this.zoom(1.25); break;
      case 'Minus': case 'NumpadSubtract': this.zoom(0.8); break;
      case 'KeyV': if (ctrl) g.ui?.paste?.(); break;
      case 'KeyX': if (!ctrl) g.ui?.swapQuickbarRows?.(); else g.logistics?.startTool('cut'); break;
      case 'KeyB': if (ctrl) g.logistics?.startTool('blueprint'); break;
    }
    if (e.code.startsWith('Digit')) {
      let n = parseInt(e.code.slice(5), 10);
      n = n === 0 ? 9 : n - 1;
      if (shift) n += 10;
      const id = p.quickbar[n];
      if (id) { if (p.cursorItem() === id) p.clearCursor(); else if (!p.selectItem(id)) g.ui?.flyText(p.x, p.y, 'No ' + ITEMS[id].name, '#ff8a6a'); }
      e.preventDefault();
    }
    if (['Space', 'Tab', 'AltLeft', 'AltRight', 'F1', 'F2', 'F3', 'F4', 'F5'].includes(e.code)) e.preventDefault();
  }

  rotate(dir: number) {
    const p = this.g.player;
    if (p.cursorItem()) { this.buildDir = ((this.buildDir + dir + 4) & 3) as Dir; this.g.sound.play('rotate', 0.4); return; }
    const h = this.view.hover;
    if (h && h.isBuilding && h.proto.rotatable) this.g.ui?.rotateEntity(h, dir);
  }
  pipette() {
    const p = this.g.player;
    const h = this.view.hover;
    if (h && h.isBuilding && h.proto.item) {
      const item = h.proto.item;
      if (p.cursorItem() === item) { p.clearCursor(); return; }
      p.selectItem(item);
      if (h.proto.rotatable) this.buildDir = h.dir;
      return;
    }
    if (p.cursorItem()) p.clearCursor();
  }
  dropCursor() {
    const p = this.g.player;
    if (!p.cursor) return;
    const tx = this.wx, ty = this.wy;
    if (!p.canReach(tx, ty)) return;
    const t = this.g.world.occAt(Math.floor(tx), Math.floor(ty));
    if (t && t.isBuilding) { const n = t.insertItem(p.cursor.id, 1, 'player'); if (n > 0) { p.cursor.n--; if (p.cursor.n <= 0) p.cursor = null; } return; }
    this.g.spillItem(tx, ty, p.cursor.id, 1, true);
    p.cursor.n--; if (p.cursor.n <= 0) p.cursor = null;
  }
  copyHovered() { this.g.ui?.copySettings?.(this.view.hover); }

  // ---------- pointer ----------
  private toDevice(e: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [(e.clientX - rect.left) * this.r.dpr, (e.clientY - rect.top) * this.r.dpr];
  }
  private updateWorldPos() { [this.wx, this.wy] = this.r.screenToWorld(this.mx, this.my); }
  pointerDown(e: PointerEvent) {
    this.canvas.setPointerCapture?.(e.pointerId);
    const [x, y] = this.toDevice(e);
    const type = e.pointerType;
    if (type !== 'mouse') this.touchMode = true;
    this.pointers.set(e.pointerId, { x, y, sx: x, sy: y, t: performance.now(), type, moved: false, longPress: false });
    // joystick zone (touch only): bottom-left quarter
    if (type === 'touch' && this.g.ui?.joystickEnabled() && x < this.r.vw * 0.28 && y > this.r.vh * 0.45 && !this.joy.active) {
      this.joy = { active: true, id: e.pointerId, ox: x, oy: y, dx: 0, dy: 0 };
      this.g.ui?.showJoystick(x / this.r.dpr, y / this.r.dpr);
      return;
    }
    const touches = [...this.pointers.values()].filter(p => p.type === 'touch' && !(this.joy.active && this.joy.id === e.pointerId));
    if (type === 'touch' && touches.length === 2) {
      // start pinch; cancel any single-touch action
      this.cancelPress();
      const [a, b] = touches;
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoomTarget };
      return;
    }
    this.mx = x; this.my = y; this.hasPointer = true; this.updateWorldPos();
    if (type === 'mouse') {
      if (e.button === 2) { if (e.shiftKey) { this.copyHovered(); return; } this.mining = true; return; }
      if (e.button === 0) { this.leftDown = true; this.onPrimaryDown(e.shiftKey, e.ctrlKey || e.metaKey); }
      if (e.button === 1) { this.pipette(); }
      return;
    }
    // pen / touch
    if (this.mineMode) { this.mining = true; return; }
    const p = this.g.player;
    if (p.cursorItem()) { this.leftDown = true; this.onPrimaryDown(false, false); return; }
    // long press to mine
    this.longPressTimer = setTimeout(() => {
      const pp = this.pointers.get(e.pointerId);
      if (pp && !pp.moved) { pp.longPress = true; this.mining = true; this.g.ui?.haptic?.(); }
    }, 320);
  }
  cancelPress() {
    if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
    this.leftDown = false; this.mining = false; this.dragStart = null;
  }
  pointerMove(e: PointerEvent) {
    const [x, y] = this.toDevice(e);
    const pp = this.pointers.get(e.pointerId);
    if (this.joy.active && e.pointerId === this.joy.id) {
      const max = 60 * this.r.dpr;
      let dx = x - this.joy.ox, dy = y - this.joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx *= max / d; dy *= max / d; }
      this.joy.dx = dx / max; this.joy.dy = dy / max;
      this.g.ui?.moveJoystick(dx / this.r.dpr, dy / this.r.dpr);
      return;
    }
    if (pp) {
      pp.x = x; pp.y = y;
      if (Math.hypot(x - pp.sx, y - pp.sy) > 12 * this.r.dpr) { pp.moved = true; if (this.longPressTimer && !pp.longPress) { clearTimeout(this.longPressTimer); this.longPressTimer = null; } }
    }
    if (this.pinch) {
      const touches = [...this.pointers.values()].filter(p => p.type === 'touch' && !(this.joy.active && this.pointers.get(this.joy.id) === p));
      if (touches.length >= 2) {
        const [a, b] = touches;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const dpr = this.r.dpr;
        this.zoomTarget = clamp(this.pinch.zoom * d / this.pinch.d, 10 * dpr, 160 * dpr);
        this.r.zoom = this.zoomTarget;
      }
      return;
    }
    if (e.target !== this.canvas && !pp && e.pointerType === 'mouse' && (e.target as HTMLElement)?.closest?.('.win, .hud-el')) { this.hasPointer = false; return; }
    // pen hover (no buttons) or mouse move or touch drag
    if (e.pointerType === 'mouse' || e.pointerType === 'pen' || pp) {
      this.mx = x; this.my = y; this.hasPointer = true; this.updateWorldPos();
      if (this.leftDown) this.onPrimaryDrag();
    }
  }
  pointerUp(e: PointerEvent, cancel = false) {
    const pp = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.joy.active && e.pointerId === this.joy.id) { this.joy.active = false; this.joy.dx = this.joy.dy = 0; this.g.ui?.hideJoystick(); return; }
    if (this.pinch) { if ([...this.pointers.values()].filter(p => p.type === 'touch').length < 2) this.pinch = null; this.cancelPress(); return; }
    if (e.pointerType === 'mouse') {
      if (e.button === 2) this.mining = false;
      if (e.button === 0) { this.leftDown = false; this.dragStart = null; this.lastPlaced = null; this.finishSel(); }
      return;
    }
    if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
    const wasMining = this.mining;
    this.mining = false;
    if (this.leftDown) { this.leftDown = false; this.dragStart = null; this.lastPlaced = null; this.finishSel(); return; }
    if (cancel || !pp) return;
    if (!pp.moved && !pp.longPress && !wasMining) {
      // tap = click
      this.mx = pp.x; this.my = pp.y; this.updateWorldPos();
      this.refreshHover();
      this.onPrimaryDown(false, false);
      if (e.pointerType === 'touch') this.hasPointer = false;
    }
  }

  // ---------- actions ----------
  onPrimaryDown(shift: boolean, ctrl: boolean) {
    const g = this.g, p = g.player;
    if (p.dead) return;
    const item = p.cursorItem();
    if (item === 'blueprint' && p.cursor?.data?.bp) { g.logistics?.placeBlueprint(this.wx, this.wy); return; }
    const tool = item && ITEMS[item]?.tool;
    if (tool && (item === 'deconstruction-planner' || item === 'blueprint' || item === 'upgrade-planner')) {
      this.sel = { x0: this.wx, y0: this.wy, mode: item === 'deconstruction-planner' ? 'decon' : item === 'blueprint' ? (p.cursor?.data?.mode || 'blueprint') : 'upgrade' };
      return;
    }
    if (item === 'red-wire' || item === 'green-wire') { g.ui?.wireClick(this.view.hover, item === 'red-wire' ? 'red' : 'green'); return; }
    if (item && g.ui?.blueprintCursor) { g.ui.placeBlueprint(this.wx, this.wy); return; }
    if (item && (ITEMS[item].place || ITEMS[item].placeTile)) {
      // ctrl+click on entity with stack: fast insert
      if (ctrl && this.view.hover && this.view.hover.isBuilding) { g.ui?.fastTransfer(this.view.hover, true); return; }
      const ent = this.view.hover;
      // clicking an entity that accepts the item (e.g. fuel into furnace) inserts instead of building
      if (ent && ent.isBuilding && ITEMS[item].place && ent.name !== ITEMS[item].place && (ent.wantsFuel(item) > 0 || ent.wants(item) > 0) && !ITEMS[item].place) { g.ui?.fastTransfer(ent, true); return; }
      this.dragStart = [this.wx, this.wy];
      this.dragAxis = null;
      this.lastPlaced = null;
      this.tryBuildAtCursor(true);
      return;
    }
    if (item && ITEMS[item].capsule) { g.combat?.useCapsule(item, this.wx, this.wy); return; }
    if (item === 'spidertron-remote') { useSpidertronRemote(this.wx, this.wy); return; }
    const h = this.view.hover;
    if (h) {
      if (shift) { g.ui?.pasteSettings?.(h); return; }
      if (ctrl) { g.ui?.fastTransfer(h, false); return; }
      if (item && h.isBuilding) { const n = h.insertItem(item, p.cursor!.n, 'player'); if (n > 0) { p.cursor!.n -= n; if (p.cursor!.n <= 0) p.cursor = null; g.sound.play('insert', 0.5); return; } }
      if (h.type === 'character-corpse') { (h as any).loot(); return; }
      if (this.onOpenEntity) this.onOpenEntity(h);
    }
  }
  onPrimaryDrag() {
    const p = this.g.player;
    if (this.sel) return;
    if (!p.cursorItem() || !this.dragStart) return;
    this.tryBuildAtCursor(false);
  }
  finishSel() {
    if (!this.sel) return;
    const s = this.sel; this.sel = null;
    const x0 = Math.min(s.x0, this.wx), x1 = Math.max(s.x0, this.wx), y0 = Math.min(s.y0, this.wy), y1 = Math.max(s.y0, this.wy);
    this.g.ui?.areaSelected(s.mode, Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1));
  }

  snapPos(protoId: string, wx: number, wy: number, dir: Dir): [number, number] {
    const pr = ENTITIES[protoId];
    const rot = pr.rotatable && (dir & 1) === 1;
    const w = rot ? pr.h : pr.w, h = rot ? pr.w : pr.h;
    const x = w % 2 === 1 ? Math.floor(wx) + 0.5 : Math.round(wx);
    const y = h % 2 === 1 ? Math.floor(wy) + 0.5 : Math.round(wy);
    return [x, y];
  }

  computePreview(): Preview | null {
    const p = this.g.player;
    const item = p.cursorItem();
    if (!item || !this.hasPointer) return null;
    const it = ITEMS[item];
    if (it.placeTile) {
      const size = this.g.ui?.tileBrush || 1;
      const x = Math.floor(this.wx) + 0.5, y = Math.floor(this.wy) + 0.5;
      return { tileItem: item, x: size % 2 ? x : Math.round(this.wx), y: size % 2 ? y : Math.round(this.wy), dir: 0, valid: true, size };
    }
    if (item === 'blueprint' && p.cursor?.data?.bp) return (this.g.logistics?.blueprintPreview(this.wx, this.wy, this.buildDir) as any) || null;
    if (!it.place) return null;
    const proto = it.place;
    if (proto === 'straight-rail') return this.g.rails?.preview(this.wx, this.wy, this.buildDir) || null;
    if (this.g.rails?.isAccessory?.(proto)) return this.g.rails.previewAccessory(proto, this.wx, this.wy) || null;
    const dir = this.buildDir;
    const [x, y] = this.snapPos(proto, this.wx, this.wy, dir);
    const chk = this.g.world.canPlace(proto, x, y, dir);
    const ghost = !p.cursor || !p.canReach(x, y) || this.keys.has('ShiftLeft');
    const pv: Preview = { protoId: proto, x, y, dir, valid: chk.ok && (ghost || p.canReach(x, y)), reason: chk.reason, ghost: ghost && chk.ok };
    // underground belt: show auto-kind as exit if pairing
    return pv;
  }

  tryBuildAtCursor(first: boolean) {
    const g = this.g, p = g.player;
    const item = p.cursorItem();
    if (!item) return;
    const it = ITEMS[item];
    if (it.placeTile) {
      const size = g.ui?.tileBrush || 1;
      const cx = Math.floor(this.wx), cy = Math.floor(this.wy);
      const h = Math.floor(size / 2);
      let placed = 0;
      for (let y = cy - h; y < cy - h + size; y++) for (let x = cx - h; x < cx - h + size; x++) {
        if (!p.cursor || p.cursor.id !== item) break;
        if (!p.canReach(x + 0.5, y + 0.5)) continue;
        if (g.placeTile(item, x, y)) { p.cursor.n--; placed++; if (p.cursor.n <= 0) { p.cursor = null; this.refillCursor(item); } }
      }
      if (placed) g.sound.play('build-tile', 0.4);
      return;
    }
    const proto = it.place!;
    if (proto === 'straight-rail') { g.rails?.buildAtCursor(this.wx, this.wy, this.buildDir, first); return; }
    if (g.rails?.isAccessory?.(proto)) { if (first) g.rails.buildAccessory(proto, this.wx, this.wy, this.keys.has('ShiftLeft')); return; }
    let [x, y] = this.snapPos(proto, this.wx, this.wy, this.buildDir);
    const pr = ENTITIES[proto];
    // drag constraints
    if (!first && this.dragStart) {
      const [sx, sy] = this.snapPos(proto, this.dragStart[0], this.dragStart[1], this.buildDir);
      if (!this.dragAxis) {
        if (Math.abs(x - sx) >= 1 || Math.abs(y - sy) >= 1) this.dragAxis = Math.abs(x - sx) >= Math.abs(y - sy) ? 'x' : 'y';
        else return;
      }
      if (this.dragAxis === 'x') y = sy; else x = sx;
      // belts follow drag direction
      if (pr.type === 'transport-belt') {
        const ndir: Dir = this.dragAxis === 'x' ? (x > sx ? 1 : 3) : (y > sy ? 2 : 0);
        if (ndir !== this.buildDir) {
          this.buildDir = ndir;
          // rotate previously placed first belt as well
          const first = g.world.occAt(Math.floor(sx), Math.floor(sy));
          if (first instanceof BeltBase && first.name === proto && first.dir !== ndir) g.ui?.rotateEntityTo(first, ndir);
        }
      }
      if (this.lastPlaced) {
        const step = Math.max(pr.w, pr.h);
        const dist = Math.abs(x - this.lastPlaced[0]) + Math.abs(y - this.lastPlaced[1]);
        if (pr.type === 'electric-pole') { if (dist < Math.floor(pr.reach!)) return; }
        else if (dist < (this.dragAxis === 'x' ? (this.buildDir & 1 ? pr.h : pr.w) : (this.buildDir & 1 ? pr.w : pr.h))) return;
        void step;
      }
    }
    const ghost = !p.cursor || !p.canReach(x, y) || this.keys.has('ShiftLeft');
    if (ghost) {
      const res = g.logistics?.placeGhost?.(proto, x, y, this.buildDir);
      if (res && res !== true) { if (first) g.ui?.flyText(x, y, res, '#ff8a6a'); }
      else this.lastPlaced = [x, y];
      return;
    }
    const res = g.buildEntity(proto, x, y, this.buildDir, { fromPlayer: true });
    if (typeof res === 'string') {
      if (first && res !== 'Already built') { g.ui?.flyText(x, y, res, '#ff8a6a'); g.sound.play('cannot-build', 0.5); }
      return;
    }
    this.lastPlaced = [x, y];
    p.cursor!.n--;
    if (p.cursor!.n <= 0) { p.cursor = null; this.refillCursor(item); }
  }
  refillCursor(item: string) {
    const p = this.g.player;
    // auto-refill from inventory like Factorio
    if (p.main.count(item) > 0) p.selectItem(item);
    else p.cursorGhost = (ITEMS[item]?.place || ITEMS[item]?.placeTile) ? item : null;
  }

  refreshHover() {
    if (!this.hasPointer) { this.view.hover = null; this.view.hoverTile = null; return; }
    this.view.hover = this.g.world.entityAt(this.wx, this.wy);
    this.view.hoverTile = [Math.floor(this.wx), Math.floor(this.wy)];
  }

  // called every tick from game.update
  updatePlayer() {
    const g = this.g, p = g.player, ch = p.character;
    if (p.dead) return;
    // smooth zoom
    // movement
    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.joy.active) { mx = this.joy.dx; my = this.joy.dy; if (Math.hypot(mx, my) < 0.18) { mx = my = 0; } }
    if (ch.vehicle) { g.ui?.driveVehicle?.(mx, my); ch.x = ch.vehicle.x; ch.y = ch.vehicle.y; }
    else this.moveCharacter(mx, my);
    // mining
    this.refreshHover();
    let target: Entity | [number, number] | null = null;
    if (this.mining && this.hasPointer) {
      const h = this.view.hover;
      if (h && (h.minable && (h.isBuilding || (h as any).minedItems || h.type === 'item-on-ground' || h.type === 'character-corpse' || h.type === 'ghost'))) target = h;
      else {
        const tx = Math.floor(this.wx), ty = Math.floor(this.wy);
        const [rid, amt] = g.world.res(tx, ty);
        if (rid && amt > 0) target = [tx, ty];
      }
    }
    p.updateMining(this.mining && !!target, target);
    // pick up items
    if (this.pickingUp) g.ui?.pickupNearby?.();
    // shooting
    if (this.shooting || (this.touchMode && g.ui?.shootHeld)) g.combat?.playerShoot(this.hasPointer ? [this.wx, this.wy] : null);
    else ch.shooting = false;
    // preview
    this.view.preview = this.computePreview();
    this.view.alt = this.alt;
    const ci = p.cursorItem();
    this.view.showSupply = !!ci && (ENTITIES[ITEMS[ci]?.place || '']?.type === 'electric-pole' || !!ENTITIES[ITEMS[ci]?.place || '']?.source && ENTITIES[ITEMS[ci]?.place || ''].source === 'electric');
    this.view.selRect = this.sel ? [Math.min(this.sel.x0, this.wx), Math.min(this.sel.y0, this.wy), Math.max(this.sel.x0, this.wx), Math.max(this.sel.y0, this.wy), this.sel.mode] : null;
  }

  moveCharacter(mx: number, my: number) {
    const g = this.g, p = g.player, ch = p.character, w = g.world;
    const len = Math.hypot(mx, my);
    let vx = 0, vy = 0;
    if (len > 0.01) {
      const eq = p.equipmentStats();
      const speed = 0.15 * w.walkSpeed(ch.x, ch.y) * (1 + eq.move) * (ch.slow > 0 ? 0.5 : 1) * (g.cheatFastCraft ? 2.5 : 1);
      const k = Math.min(1, len);
      vx = mx / len * speed * k; vy = my / len * speed * k;
      ch.face = faceTo(mx, my);
      ch.moving = true;
      ch.animT += 0.28 * k * (speed / 0.15);
    } else ch.moving = false;
    if (ch.slow > 0) ch.slow--;
    // belts move the character
    const under = w.occAt(Math.floor(ch.x), Math.floor(ch.y));
    if (under instanceof BeltBase && !p.equipmentStats().belt && under.type === 'transport-belt') {
      const f = DIRS[under.dir];
      const s = under.speed / 256;
      vx += f[0] * s; vy += f[1] * s;
    }
    const r = 0.2;
    const blocked = (x: number, y: number) => {
      for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
        const tx = Math.floor(x + ox), ty = Math.floor(y + oy);
        const c = w.chunkAt(tx, ty);
        if (!c) return true;
        if (isWaterTile(c.tiles[((ty & 31) << 5) | (tx & 31)]) && w.walkSpeed(tx, ty) === 0) return true;
        const o = c.occ[((ty & 31) << 5) | (tx & 31)];
        if (o && o.blocksMovement && o !== ch) {
          // finer collision for trees/poles (smaller boxes)
          const inset = o.type === 'tree' ? 0.3 : o.collisionInset;
          const bx0 = o.x - o.w / 2 + inset, bx1 = o.x + o.w / 2 - inset, by0 = o.y - o.h / 2 + inset, by1 = o.y + o.h / 2 - inset;
          if (x + r > bx0 && x - r < bx1 && y + r > by0 && y - r < by1) return true;
        }
      }
      return false;
    };
    if (vx !== 0) { const nx = ch.x + vx; if (!blocked(nx, ch.y)) ch.x = nx; }
    if (vy !== 0) { const ny = ch.y + vy; if (!blocked(ch.x, ny)) ch.y = ny; }
  }
}
