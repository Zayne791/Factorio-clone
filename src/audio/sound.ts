// Procedural sound effects and ambient soundscape with WebAudio (no external audio assets).
import { G } from '../core';

type Synth = (ctx: AudioContext, out: AudioNode, t: number, v: number) => void;

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
let NOISE: AudioBuffer | null = null;

function noise(ctx: AudioContext, out: AudioNode, t: number, dur: number, v: number, type: BiquadFilterType, freq: number, q = 1, attack = 0.002) {
  const src = ctx.createBufferSource(); src.buffer = NOISE!;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  return f;
}
function tone(ctx: AudioContext, out: AudioNode, t: number, dur: number, v: number, freq: number, type: OscillatorType = 'sine', freqEnd?: number, attack = 0.003) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}

const SYNTHS: Record<string, Synth> = {
  'build': (c, o, t, v) => { noise(c, o, t, 0.18, v * 0.9, 'lowpass', 500, 0.7); tone(c, o, t, 0.16, v * 0.6, 140, 'sine', 70); noise(c, o, t + 0.01, 0.06, v * 0.3, 'bandpass', 2500, 2); },
  'build-tile': (c, o, t, v) => { noise(c, o, t, 0.12, v * 0.5, 'lowpass', 900, 0.7); },
  'deconstruct': (c, o, t, v) => { noise(c, o, t, 0.14, v * 0.6, 'bandpass', 1200, 1.5); tone(c, o, t, 0.12, v * 0.4, 300, 'triangle', 150); },
  'mine-ore': (c, o, t, v) => { noise(c, o, t, 0.09, v * 0.8, 'bandpass', 2200 + Math.random() * 800, 3); noise(c, o, t, 0.15, v * 0.35, 'lowpass', 400); },
  'mine-wood': (c, o, t, v) => { noise(c, o, t, 0.1, v * 0.8, 'bandpass', 700 + Math.random() * 200, 4); tone(c, o, t, 0.08, v * 0.3, 220, 'triangle', 160); },
  'mine-building': (c, o, t, v) => { tone(c, o, t, 0.25, v * 0.3, 880 + Math.random() * 60, 'sine'); tone(c, o, t, 0.2, v * 0.2, 1320, 'sine'); noise(c, o, t, 0.05, v * 0.4, 'highpass', 3000); },
  'craft': (c, o, t, v) => { tone(c, o, t, 0.06, v * 0.25, 1500, 'square', 1200); },
  'gui-open': (c, o, t, v) => { noise(c, o, t, 0.05, v * 0.4, 'bandpass', 1800, 4); tone(c, o, t, 0.05, v * 0.15, 900); },
  'gui-close': (c, o, t, v) => { noise(c, o, t, 0.04, v * 0.35, 'bandpass', 1300, 4); },
  'inventory-move': (c, o, t, v) => { noise(c, o, t, 0.035, v * 0.35, 'bandpass', 2500, 3); },
  'inventory-pick': (c, o, t, v) => { noise(c, o, t, 0.03, v * 0.3, 'bandpass', 3200, 3); },
  'insert': (c, o, t, v) => { noise(c, o, t, 0.05, v * 0.4, 'bandpass', 1600, 2); },
  'pickup': (c, o, t, v) => { noise(c, o, t, 0.03, v * 0.3, 'bandpass', 2800, 3); },
  'rotate': (c, o, t, v) => { noise(c, o, t, 0.05, v * 0.4, 'bandpass', 1100, 5); tone(c, o, t, 0.05, v * 0.2, 600, 'triangle', 450); },
  'cannot-build': (c, o, t, v) => { tone(c, o, t, 0.15, v * 0.25, 160, 'sawtooth', 120); },
  'research-complete': (c, o, t, v) => { [523, 659, 784, 1046].forEach((f, i) => tone(c, o, t + i * 0.09, 0.6, v * 0.25, f, 'sine')); },
  'explosion': (c, o, t, v) => { noise(c, o, t, 1.1, v * 1.2, 'lowpass', 700, 0.5, 0.005); tone(c, o, t, 0.6, v * 0.7, 80, 'sine', 30); },
  'gunshot': (c, o, t, v) => { noise(c, o, t, 0.08, v * 0.7, 'highpass', 1200, 0.7, 0.001); noise(c, o, t, 0.12, v * 0.5, 'lowpass', 500); },
  'turret': (c, o, t, v) => { noise(c, o, t, 0.06, v * 0.5, 'highpass', 1500, 0.7, 0.001); },
  'laser': (c, o, t, v) => { tone(c, o, t, 0.18, v * 0.25, 1800, 'sawtooth', 600); },
  'acid': (c, o, t, v) => { noise(c, o, t, 0.25, v * 0.4, 'bandpass', 900, 1); },
  'bite': (c, o, t, v) => { noise(c, o, t, 0.1, v * 0.5, 'bandpass', 600, 2); },
  'biter-death': (c, o, t, v) => { tone(c, o, t, 0.3, v * 0.3, 300, 'sawtooth', 90); noise(c, o, t, 0.25, v * 0.4, 'bandpass', 500, 1); },
  'alert': (c, o, t, v) => { tone(c, o, t, 0.12, v * 0.3, 880, 'square'); tone(c, o, t + 0.15, 0.12, v * 0.3, 660, 'square'); },
  'rocket': (c, o, t, v) => { noise(c, o, t, 6, v * 1.0, 'lowpass', 300, 0.5, 1.5); tone(c, o, t, 6, v * 0.5, 50, 'sawtooth', 35, 1.5); },
  'death': (c, o, t, v) => { tone(c, o, t, 1.2, v * 0.4, 440, 'sine', 110); },
  'car': (c, o, t, v) => { tone(c, o, t, 0.2, v * 0.3, 70, 'sawtooth'); },
};

export class SoundSystem {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfx: GainNode | null = null;
  music: GainNode | null = null;
  amb: { hum: GainNode; wind: GainNode; humOsc: OscillatorNode } | null = null;
  volume = 0.7; musicVol = 0.4;
  last: Record<string, number> = {};
  constructor() {
    const unlock = () => {
      if (!this.ctx) this.init();
      this.ctx?.resume?.();
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    try { const s = JSON.parse(localStorage.getItem('factory-settings') || '{}'); if (s.volume !== undefined) this.volume = s.volume; if (s.music !== undefined) this.musicVol = s.music; } catch { /* */ }
  }
  init() {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      const c = this.ctx!;
      NOISE = noiseBuffer(c);
      this.master = c.createGain(); this.master.gain.value = 1; this.master.connect(c.destination);
      const comp = c.createDynamicsCompressor(); comp.connect(this.master);
      this.sfx = c.createGain(); this.sfx.gain.value = this.volume; this.sfx.connect(comp);
      this.music = c.createGain(); this.music.gain.value = this.musicVol * 0.5; this.music.connect(comp);
      this.startAmbient();
      this.startMusic();
    } catch { this.ctx = null; }
  }
  setVolume(v: number, m: number) {
    this.volume = v; this.musicVol = m;
    if (this.sfx) this.sfx.gain.value = v;
    if (this.music) this.music.gain.value = m * 0.5;
  }
  play(name: string, vol = 1, x?: number, y?: number) {
    if (!this.ctx || !this.sfx) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.03) return;
    this.last[name] = now;
    let v = vol;
    const g = G.game;
    if (x !== undefined && y !== undefined && g?.player) {
      const d = Math.hypot(x - g.player.x, y - g.player.y);
      v *= Math.max(0, 1 - d / 40);
      if (v <= 0.01) return;
    }
    const s = SYNTHS[name];
    if (s) s(this.ctx, this.sfx, now + 0.005, v * 0.6);
  }
  startAmbient() {
    const c = this.ctx!;
    // wind
    const src = c.createBufferSource(); src.buffer = NOISE!; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const wind = c.createGain(); wind.gain.value = 0.035;
    src.connect(f); f.connect(wind); wind.connect(this.sfx!); src.start();
    // factory hum
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 55;
    const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 220;
    const hum = c.createGain(); hum.gain.value = 0;
    osc.connect(hf); hf.connect(hum); hum.connect(this.sfx!); osc.start();
    this.amb = { hum, wind, humOsc: osc };
  }
  // called every second with number of working machines near the player
  ambient(working: number) {
    if (!this.amb || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.amb.hum.gain.setTargetAtTime(Math.min(0.07, working * 0.004), t, 0.5);
  }
  // Slow generative ambient music (pads) reminiscent of calm factory soundtracks
  startMusic() {
    const c = this.ctx!;
    const chords = [[146.8, 220, 293.7, 349.2], [130.8, 196, 261.6, 329.6], [110, 164.8, 220, 277.2], [123.5, 185, 246.9, 311.1]];
    let i = 0;
    const playChord = () => {
      if (!this.ctx || !this.music) return;
      const t = c.currentTime;
      const ch = chords[i++ % chords.length];
      for (const f of ch) {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 1.003;
        const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 4); g.gain.linearRampToValueAtTime(0.0001, t + 11);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.music!);
        o.start(t); o2.start(t); o.stop(t + 11.5); o2.stop(t + 11.5);
      }
      // sparse melody notes
      for (let k = 0; k < 3; k++) {
        if (Math.random() < 0.5) continue;
        const f = ch[Math.floor(Math.random() * ch.length)] * 2;
        const tt = t + 2 + k * 2.5 + Math.random();
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = c.createGain(); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.035, tt + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, tt + 3);
        o.connect(g); g.connect(this.music!); o.start(tt); o.stop(tt + 3.2);
      }
      setTimeout(playChord, 9000);
    };
    setTimeout(playChord, 3000);
  }
}
