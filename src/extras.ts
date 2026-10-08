// Wires optional subsystems (sound, autosave, combat, enemies, logistics, trains, circuits) into a running game.
import { Game } from './game';
import { UI } from './ui/ui';
import { Input } from './input/input';
import { Renderer } from './engine/renderer';
import { SoundSystem } from './audio/sound';
import { writeSave } from './save/save';
import { SETTINGS } from './ui/menu';

let SOUND: SoundSystem | null = null;

export function installExtras(game: Game, ui: UI, input: Input, r: Renderer) {
  if (!SOUND) SOUND = new SoundSystem();
  game.sound = SOUND as any;
  ui.autosave = async () => {
    if (!SETTINGS.autosave) return;
    try { await writeSave('Autosave', game); ui.showMessage('Autosaved', 1500); } catch { /* storage unavailable */ }
  };
  // ambient factory hum
  setInterval(() => {
    if ((window as any).__game !== game) return;
    const p = game.player;
    let working = 0;
    for (const e of game.world.entitiesIn(p.x - 20, p.y - 20, p.x + 20, p.y + 20, e => (e as any).working, 4)) working++;
    SOUND?.ambient(working);
  }, 1000);
  for (const hook of EXTRA_HOOKS) hook(game, ui, input, r);
}

export const EXTRA_HOOKS: ((g: Game, ui: UI, input: Input, r: Renderer) => void)[] = [];
