import { useSyncExternalStore } from 'react';
import { readStore, writeStore } from './platform';

export type ThemePref = 'light' | 'system' | 'dark';
export type Accent = 'blue' | 'purple' | 'pink' | 'red' | 'orange' | 'green' | 'graphite';

/* macOS accent colors */
export const ACCENTS: { id: Accent; label: string; hex: string }[] = [
  { id: 'blue', label: 'Blu', hex: '#007AFF' },
  { id: 'purple', label: 'Viola', hex: '#A550A7' },
  { id: 'pink', label: 'Rosa', hex: '#F74F9E' },
  { id: 'red', label: 'Rosso', hex: '#FF5257' },
  { id: 'orange', label: 'Arancione', hex: '#F7821B' },
  { id: 'green', label: 'Verde', hex: '#62BA46' },
  { id: 'graphite', label: 'Grafite', hex: '#8C8C8C' },
];

const K_THEME = 'aw:theme';
const K_ACCENT = 'aw:accent';
const listeners = new Set<() => void>();
const mq = window.matchMedia('(prefers-color-scheme: dark)');
const root = document.documentElement;
const emit = () => listeners.forEach((l) => l());

function getThemePref(): ThemePref {
  const v = readStore(K_THEME);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function getAccent(): Accent {
  const v = readStore(K_ACCENT) as Accent | null;
  return v && ACCENTS.some((a) => a.id === v) ? v : 'blue';
}

/**
 * The app writes its own `data-appearance` attribute. "Automatico" follows the
 * host: on claude.ai the viewer's explicit choice (its `data-theme` on <html>),
 * otherwise the system setting.
 */
export function applyTheme() {
  const pref = getThemePref();
  const host = root.getAttribute('data-theme');
  const systemDark = host === 'dark' || host === 'light' ? host === 'dark' : mq.matches;
  const dark = pref === 'dark' || (pref === 'system' && systemDark);
  root.setAttribute('data-appearance', dark ? 'dark' : 'light');
  root.setAttribute('data-accent', getAccent());
}

export function setThemePref(p: ThemePref) {
  writeStore(K_THEME, p);
  applyTheme();
  emit();
}

export function setAccent(a: Accent) {
  writeStore(K_ACCENT, a);
  applyTheme();
  emit();
}

mq.addEventListener('change', () => {
  applyTheme();
  emit();
});
// The claude.ai viewer can switch light/dark while the page is open.
new MutationObserver(() => {
  applyTheme();
  emit();
}).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useThemePref() {
  return useSyncExternalStore(subscribe, getThemePref);
}
export function useAccent() {
  return useSyncExternalStore(subscribe, getAccent);
}
