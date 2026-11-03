/* Native Mac features through the bridge in desktop/preload.cjs: system sounds, the
   menu-bar timer, full screen, Dock attention and backups. In a browser they fall back
   to synthesized chimes or do nothing. */

export type BackupResult = { ok: true; dir: string; file: string } | { ok: false; error: string };
interface NativeBridge {
  playSound: (name: string, volume: number) => void;
  setTray: (text: string) => void;
  setFullScreen: (on: boolean) => void;
  attention: () => void;
  backup: (json: string, dir: string) => Promise<BackupResult>;
  chooseFolder: () => Promise<string | null>;
  reveal: (path: string) => void;
}
const native = (window as unknown as { aw?: NativeBridge }).aw;
export const isMacApp = !!native;

/** macOS system sounds (/System/Library/Sounds), softest first. */
export const SOUNDS: { id: string; label: string }[] = [
  { id: 'Glass', label: 'Cristallo' },
  { id: 'Hero', label: 'Eroe' },
  { id: 'Purr', label: 'Fusa' },
  { id: 'Tink', label: 'Tintinnio' },
  { id: 'Ping', label: 'Ping' },
  { id: 'Pop', label: 'Pop' },
  { id: 'Bottle', label: 'Bottiglia' },
  { id: 'Blow', label: 'Soffio' },
  { id: 'Submarine', label: 'Sottomarino' },
  { id: 'Morse', label: 'Morse' },
  { id: 'Funk', label: 'Funk' },
];

let ctx: AudioContext | null = null;
/** Soft bell-like tones (sine partials with a slow decay), one recipe per sound name. */
function synth(name: string, volume: number) {
  const recipes: Record<string, number[]> = {
    Glass: [1318.5, 1975.5],
    Hero: [523.3, 659.3, 784, 1046.5],
    Purr: [392, 329.6],
    Tink: [2093],
    Ping: [1568],
    Pop: [880],
    Bottle: [659.3, 987.8],
    Blow: [440, 554.4],
    Submarine: [261.6, 392],
    Morse: [1046.5, 1046.5],
    Funk: [587.3, 440, 587.3],
  };
  const notes = recipes[name] ?? recipes.Glass;
  try {
    ctx = ctx ?? new AudioContext();
    const c = ctx;
    notes.forEach((f, i) => {
      const t0 = c.currentTime + i * 0.14;
      [1, 2.01, 3.02].forEach((h, k) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'sine';
        o.frequency.value = f * h;
        const peak = (0.22 * volume) / (k * 2 + 1);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1 - k * 0.25);
        o.connect(g).connect(c.destination);
        o.start(t0);
        o.stop(t0 + 1.2);
      });
    });
  } catch {
    /* audio unavailable */
  }
}

export function playSound(name: string, volume: number) {
  if (!name || name === 'none') return;
  if (native) native.playSound(name, volume);
  else synth(name, volume);
}

let lastTray = '';
/** Shows text next to the clock in the Mac menu bar ('' hides it). */
export function setTray(text: string) {
  if (!native || text === lastTray) return;
  lastTray = text;
  native.setTray(text);
}

export const setFullScreen = (on: boolean) => native?.setFullScreen(on);
/** Bounces the Dock icon when the app is in the background. */
export const attention = () => native?.attention();
export const chooseFolder = () => native?.chooseFolder() ?? Promise.resolve(null);
export const reveal = (path: string) => native?.reveal(path);
export function writeBackup(json: string, dir: string): Promise<BackupResult> {
  return native ? native.backup(json, dir) : Promise.resolve({ ok: false, error: 'Disponibile solo nell’app per Mac' });
}
