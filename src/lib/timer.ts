import { useEffect, useState, useSyncExternalStore } from 'react';
import { addSession, getData, setTimer, type Phase, type TimerMode, type TimerState, type UserData } from './store';
import { fmtClock } from './stats';
import { attention, playSound, setFullScreen } from './native';

export const PHASE_LABEL: Record<Phase, string> = { focus: 'Concentrazione', short: 'Pausa breve', long: 'Pausa lunga' };

export function targetMs(t: TimerState, d: UserData): number | null {
  const s = d.settings;
  if (t.mode === 'stopwatch') return null;
  if (t.mode === 'countdown') return t.countdownMin * 60000;
  return (t.phase === 'focus' ? s.focusMin : t.phase === 'short' ? s.shortMin : s.longMin) * 60000;
}

export function elapsed(t: TimerState, now = Date.now()) {
  return Math.max(0, t.elapsedMs + (t.running && t.startedAt ? now - t.startedAt : 0));
}

/* ---------- sound & notifications ---------- */
function notify(title: string, body: string, sound: 'focus' | 'break') {
  const d = getData();
  if (d.settings.sound) playSound(sound === 'focus' ? d.settings.soundFocusEnd : d.settings.soundBreakEnd, d.settings.volume);
  if (d.settings.notify && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, silent: true });
    } catch {
      /* ignore */
    }
  }
}

/* ---------- focus view (full screen) ---------- */
// Opening: the backdrop fades in, then the window goes full screen behind it, then the
// clock rises in (CSS). Closing runs the other way round. Timings match app.css.
export type FocusViewState = 'off' | 'open' | 'closing';
let focusView: FocusViewState = 'off';
let viewTimers: ReturnType<typeof setTimeout>[] = [];
const fv = new Set<() => void>();
const later = (ms: number, fn: () => void) => viewTimers.push(setTimeout(fn, ms));

function setView(v: FocusViewState) {
  focusView = v;
  document.documentElement.classList.toggle('focus-open', v !== 'off');
  fv.forEach((l) => l());
}

export function setFocusView(on: boolean) {
  if (on ? focusView === 'open' : focusView !== 'open') return;
  viewTimers.forEach(clearTimeout);
  viewTimers = [];
  if (on) {
    setView('open');
    later(240, () => setFullScreen(true));
  } else {
    setView('closing');
    later(200, () => setFullScreen(false));
    later(480, () => setView('off'));
  }
}
export function useFocusView() {
  return useSyncExternalStore(
    (cb) => {
      fv.add(cb);
      return () => fv.delete(cb);
    },
    () => focusView,
  );
}

/* ---------- actions ---------- */
export function start() {
  const d = getData();
  const t = d.timer;
  if (t.running || t.pending) return;
  setTimer({ running: true, startedAt: Date.now(), sessionStart: t.sessionStart ?? Date.now() });
  if (d.settings.fullscreenOnStart) setFocusView(true);
}
export function pause() {
  const d = getData();
  if (!d.timer.running) return;
  setTimer({ running: false, elapsedMs: elapsed(d.timer), startedAt: null });
}
export function resetTimer() {
  setTimer({ running: false, startedAt: null, elapsedMs: 0, sessionStart: null });
}
export function setMode(mode: TimerMode) {
  setTimer({ mode, phase: 'focus', running: false, startedAt: null, elapsedMs: 0, sessionStart: null });
}

const STOPPED = { running: false, startedAt: null, elapsedMs: 0, sessionStart: null } as const;

/** A focus block ended: open the end-of-session sheet, or save straight away if that is turned off. */
function finishFocus(t: TimerState, ms: number, thenBreak: boolean) {
  if (ms < 60000) return false;
  const pending = { start: t.sessionStart ?? Date.now() - ms, dur: Math.round(ms / 1000), kind: t.mode, thenBreak };
  if (getData().settings.logAfterSession) {
    setTimer({ ...STOPPED, pending });
    setFocusView(true);
  } else {
    addSession({ subjectId: t.subjectId, start: pending.start, dur: pending.dur, note: t.note.trim(), kind: t.mode });
    setTimer({ ...STOPPED, note: '' });
    if (thenBreak) startBreak();
  }
  return true;
}

/** Stop now and log what has been studied so far (focus phases only). */
export function finishAndSave() {
  const t = getData().timer;
  const isFocus = t.mode !== 'pomodoro' || t.phase === 'focus';
  if (isFocus && finishFocus(t, elapsed(t), t.mode === 'pomodoro')) return true;
  setTimer(STOPPED);
  return false;
}

/** Saves the session from the end-of-session sheet, then (optionally) starts the break. */
export function saveLog(p: { subjectId: string | null; dur: number; note: string; focus: number }, withBreak: boolean) {
  const t = getData().timer;
  if (!t.pending) return;
  addSession({ subjectId: p.subjectId, start: t.pending.start, dur: p.dur, note: p.note.trim(), kind: t.pending.kind, focus: p.focus });
  setTimer({ pending: null, note: '', subjectId: p.subjectId });
  if (withBreak && t.mode === 'pomodoro') startBreak();
  else setFocusView(false);
}
export function discardLog() {
  setTimer({ pending: null });
  setFocusView(false);
}

/** Pomodoro: start the short or long break after a completed focus block. */
export function startBreak() {
  const { timer: t, settings: s } = getData();
  const cycle = t.cycle + 1;
  setTimer({ mode: 'pomodoro', phase: cycle % s.longEvery === 0 ? 'long' : 'short', cycle, running: true, startedAt: Date.now(), elapsedMs: 0, sessionStart: Date.now() });
}

/** Pomodoro: move to the next phase by hand (skip). */
export function skipPhase() {
  const t = getData().timer;
  if (t.phase === 'focus') setTimer({ ...STOPPED, phase: 'short' });
  else setTimer({ ...STOPPED, phase: 'focus' });
}

function complete(d: UserData) {
  const t = d.timer;
  const target = targetMs(t, d)!;
  attention();
  if (t.mode === 'countdown') {
    notify('Tempo scaduto', `Hai studiato ${Math.round(target / 60000)} minuti.`, 'focus');
    finishFocus(t, target, false);
    return;
  }
  if (t.phase === 'focus') {
    notify('Pomodoro completato', 'Annota com’è andata, poi parte la pausa.', 'focus');
    finishFocus(t, target, true);
  } else {
    notify('Pausa finita', 'Si riparte: torna a concentrarti.', 'break');
    const auto = d.settings.autoFocus;
    setTimer({ phase: 'focus', running: auto, startedAt: auto ? Date.now() : null, elapsedMs: 0, sessionStart: auto ? Date.now() : null });
  }
}

/** Runs once in the app shell: ticks the clock, completes phases, updates the tab title. */
export function useTimerEngine(data: UserData | null) {
  const [, setTick] = useState(0);
  const running = !!data?.timer.running;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const d = getData();
      if (!d || !d.timer.running) return;
      const target = targetMs(d.timer, d);
      const el = elapsed(d.timer);
      if (target !== null && el >= target) complete(d);
      const shown = target === null ? el : target - el;
      const label = d.timer.mode === 'pomodoro' ? PHASE_LABEL[d.timer.phase] : d.timer.mode === 'stopwatch' ? 'Cronometro' : 'Timer';
      document.title = `▶ ${fmtClock(shown)} · ${label}`;
      setTick((x) => x + 1);
    }, 250);
    return () => clearInterval(id);
  }, [running]);
}

/** Re-render every 250ms while the timer is running (for live clocks). */
export function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  // While ticking, never hand out a stale timestamp from before the timer started.
  return active ? Math.max(now, Date.now()) : now;
}
