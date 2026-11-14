import { useSyncExternalStore } from 'react';
import { readStore, writeStore } from './platform';

/* ---------- types ---------- */
export type SessionKind = 'pomodoro' | 'stopwatch' | 'countdown' | 'manual';
export interface Session {
  id: string;
  subjectId: string | null;
  start: number; // ms epoch
  dur: number; // seconds
  note: string;
  kind: SessionKind;
  focus: number; // self-rated concentration 1..5, 0 = not rated
  activityId: string | null; // what kind of work: lettura, esercizi…
  breakSec: number; // pause inside the session, not counted in `dur`
  pauses: number; // times the timer was paused during the block (0 for manual sessions)
  pausedSec: number; // time spent paused during the block
}
/** Days without a goal: holidays, trips, exam days. Inclusive range of day keys. */
export interface DayOff {
  id: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  label: string;
}
/** A weekly review written by Claude (or pasted back by the user). */
export interface Review {
  id: string;
  at: number; // ms epoch
  weekStart: string; // YYYY-MM-DD
  text: string;
}
/** A kind of study work (Lettura, Esercizi, Ripasso…), the second axis next to the exam. */
export interface Activity {
  id: string;
  name: string;
  color: string;
}
/** A teaching period: semestre, trimestre, term, modulo… named freely. */
export interface Semester {
  id: string;
  name: string; // es. "1° semestre", "Term 2", "Modulo di econometria"
  academicYear: string; // free text, es. "2026/27" or ''
  start: string; // YYYY-MM-DD or ''
  end: string; // YYYY-MM-DD or ''
}

export const semesterLabel = (s: Semester) => s.name || 'Periodo senza nome';

/** Academic year that contains the given date (it starts in September). */
export function academicYearOf(d = new Date()) {
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${String(y + 1).slice(-2)}`;
}

/** How exams are graded. '30' is the Italian scale with lode; 'none' = only pass/fail. */
export type GradeScale = '30' | '110' | '100' | '10' | '4' | 'none';
export const GRADE_SCALES: { id: GradeScale; label: string; min: number; max: number; step: number }[] = [
  { id: '30', label: 'Trentesimi (18–30 e lode)', min: 18, max: 30, step: 1 },
  { id: '100', label: 'Centesimi (0–100)', min: 0, max: 100, step: 1 },
  { id: '110', label: 'Centodecimi (0–110)', min: 0, max: 110, step: 1 },
  { id: '10', label: 'Decimi (0–10)', min: 0, max: 10, step: 0.1 },
  { id: '4', label: 'GPA (0–4)', min: 0, max: 4, step: 0.1 },
  { id: 'none', label: 'Nessun voto (solo superato)', min: 0, max: 0, step: 1 },
];
export const scaleOf = (id: GradeScale) => GRADE_SCALES.find((g) => g.id === id) ?? GRADE_SCALES[0];

export type CourseStatus = 'planned' | 'studying' | 'passed';
/** An exam / course of the degree. Sessions point to it through subjectId. */
export interface Subject {
  id: string;
  name: string;
  color: string;
  semesterId: string | null;
  cfu: number;
  professor: string;
  graded: boolean; // false = idoneità (no grade)
  status: CourseStatus;
  grade: number | null; // on the settings' grade scale
  laude: boolean;
  passedDate: string; // YYYY-MM-DD or ''
  examDate: string; // next appello, YYYY-MM-DD or ''
  targetHours: number; // 0 = none
  weeklyGoalMin: number; // 0 = none
  notes: string;
  nextStep: string; // where to pick up next time, shown when the timer starts on this exam
}
export interface Settings {
  setupDone: boolean;
  name: string;
  programType: string; // es. "Laurea triennale", "Anno quantitativo"
  degree: string; // program name
  creditLabel: string; // "CFU", "ECTS", "crediti"… '' = no credits
  degreeCfu: number; // total credits of the program, 0 = no target
  gradeScale: GradeScale;
  periodLabel: string; // "Semestre", "Term", "Modulo"…
  dayGoals: number[]; // minutes, indexed by Date.getDay() (0 = domenica)
  goalInBlocks: boolean; // a pomodoro block (focus + break) fills its whole length of the goal
  focusMin: number;
  shortMin: number;
  longMin: number;
  longEvery: number;
  autoBreak: boolean;
  autoFocus: boolean;
  sound: boolean;
  soundFocusEnd: string;
  soundBreakEnd: string;
  volume: number; // 0..1
  notify: boolean;
  weekStart: 0 | 1;
  fullscreenOnStart: boolean;
  logAfterSession: boolean;
  autoBackup: boolean;
  backupDir: string; // '' = Documents/Academic Weapon Backup
  lastBackupAt: number;
  /** Tracking period (the "anno" the goals refer to). '' = the current academic year. */
  trackStart: string;
  trackEnd: string;
  daysOff: DayOff[];
  /** After a break ends without restarting, remind again (minutes; 0 = off). */
  breakNudgeMin: number;
  /** Last manual export of the data (web reminder). */
  lastExportAt: number;
  /** Until when the "export your data" reminder is snoozed. */
  exportSnoozeUntil: number;
  /** Rewards already shown, so each one appears once: the day of the streak/goal toast, the last milestone sheet. */
  streakToastDay: string;
  goalToastDay: string;
  milestoneShown: number;
}
export type TimerMode = 'pomodoro' | 'stopwatch' | 'countdown';
export type Phase = 'focus' | 'short' | 'long';
export interface TimerState {
  mode: TimerMode;
  phase: Phase;
  running: boolean;
  startedAt: number | null;
  elapsedMs: number;
  subjectId: string | null;
  activityId: string | null;
  note: string;
  cycle: number;
  countdownMin: number;
  sessionStart: number | null;
  /** Pauses taken during the current focus block, and when the current one began. */
  pauses: number;
  pausedMs: number;
  pausedAt: number | null;
  /** When the last break ran out without the next block starting (for the reminder). */
  breakEndedAt: number | null;
  /** A finished session waiting to be logged (end-of-session sheet). */
  pending: { start: number; dur: number; kind: SessionKind; thenBreak: boolean; pauses?: number; pausedSec?: number } | null;
}
export interface UserData {
  settings: Settings;
  semesters: Semester[];
  subjects: Subject[];
  activities: Activity[];
  sessions: Session[];
  reviews: Review[];
  timer: TimerState;
}

/* ---------- palette (Apple system colors) ---------- */
export const SUBJECT_COLORS = ['#007AFF', '#FF9500', '#34C759', '#AF52DE', '#FF2D55', '#5AC8FA', '#FFCC00', '#5856D6', '#FF3B30', '#A2845E'];
export const NO_SUBJECT_COLOR = '#8E8E93';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const DEFAULT_SETTINGS: Settings = {
  setupDone: false,
  name: '',
  programType: 'Laurea triennale',
  degree: '',
  creditLabel: 'CFU',
  degreeCfu: 180,
  gradeScale: '30',
  periodLabel: 'Semestre',
  dayGoals: [120, 180, 180, 180, 180, 180, 120],
  goalInBlocks: true,
  focusMin: 50,
  shortMin: 10,
  longMin: 20,
  longEvery: 4,
  autoBreak: true,
  autoFocus: false,
  sound: true,
  soundFocusEnd: 'Glass',
  soundBreakEnd: 'Hero',
  volume: 0.6,
  notify: true,
  weekStart: 1,
  fullscreenOnStart: true,
  logAfterSession: true,
  autoBackup: true,
  backupDir: '',
  lastBackupAt: 0,
  trackStart: '',
  trackEnd: '',
  daysOff: [],
  breakNudgeMin: 3,
  lastExportAt: 0,
  exportSnoozeUntil: 0,
  streakToastDay: '',
  goalToastDay: '',
  milestoneShown: 0,
};

export const DEFAULT_TIMER: TimerState = {
  mode: 'pomodoro',
  phase: 'focus',
  running: false,
  startedAt: null,
  elapsedMs: 0,
  subjectId: null,
  activityId: null,
  note: '',
  cycle: 0,
  countdownMin: 45,
  sessionStart: null,
  pauses: 0,
  pausedMs: 0,
  pausedAt: null,
  breakEndedAt: null,
  pending: null,
};

export function newSubject(p: Partial<Subject> = {}): Subject {
  return {
    id: uid(),
    name: '',
    color: SUBJECT_COLORS[0],
    semesterId: null,
    cfu: 6,
    professor: '',
    graded: true,
    status: 'studying',
    grade: null,
    laude: false,
    passedDate: '',
    examDate: '',
    targetHours: 0,
    weeklyGoalMin: 0,
    notes: '',
    nextStep: '',
    ...p,
  };
}

export const ACTIVITY_COLORS = ['#5856D6', '#34C759', '#FF9500', '#5AC8FA', '#FF2D55', '#A2845E', '#AF52DE', '#FFCC00'];
const defaultActivities = (): Activity[] =>
  ['Lettura', 'Esercizi', 'Ripasso', 'Lezione', 'Appunti', 'Simulazione d’esame'].map((name, i) => ({ id: uid(), name, color: ACTIVITY_COLORS[i] }));

const freshData = (): UserData => ({
  settings: { ...DEFAULT_SETTINGS },
  semesters: [],
  subjects: [],
  activities: defaultActivities(),
  sessions: [],
  reviews: [],
  timer: { ...DEFAULT_TIMER },
});

type OldSettings = Partial<Settings> & { dailyGoalMin?: number };
type OldSemester = Partial<Semester> & { year?: number; term?: string };

/** Fill in fields that older saves (or imports) may lack. */
function normalize(raw: Partial<UserData> | null): UserData {
  if (!raw) return freshData();
  const old = (raw.settings ?? {}) as OldSettings;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...old };
  // Earlier versions had one daily goal for every day.
  if (!Array.isArray(old.dayGoals) || old.dayGoals.length !== 7) settings.dayGoals = Array(7).fill(old.dailyGoalMin ?? 180);
  delete (settings as OldSettings).dailyGoalMin;
  if (!Array.isArray(settings.daysOff)) settings.daysOff = [];
  return {
    settings,
    semesters: ((raw.semesters ?? []) as OldSemester[]).map((x) => ({
      id: x.id ?? uid(),
      name: x.name ?? (x.year ? `${x.year}° anno · ${x.term === 'A' ? 'annuale' : `${x.term}° semestre`}` : ''),
      academicYear: x.academicYear ?? '',
      start: x.start ?? '',
      end: x.end ?? '',
    })),
    subjects: (raw.subjects ?? []).map((s) => newSubject(s)),
    activities: Array.isArray(raw.activities) ? raw.activities : defaultActivities(),
    sessions: (raw.sessions ?? []).map((x) => ({ ...x, focus: x.focus ?? 0, activityId: x.activityId ?? null, breakSec: x.breakSec ?? 0, pauses: x.pauses ?? 0, pausedSec: x.pausedSec ?? 0 })),
    reviews: Array.isArray(raw.reviews) ? raw.reviews : [],
    timer: { ...DEFAULT_TIMER, ...raw.timer },
  };
}

/* ---------- storage: one local profile per device (Mac app) or browser (web beta) ---------- */
const K_DATA = 'aw:data';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

let cache: UserData | null = null;

/* Safety net. A save that cannot be read must never be overwritten by an empty profile:
   the unreadable text is set aside, and the last good daily snapshot is restored if there is one. */
const K_PREV = 'aw:data:prev'; // last good save, refreshed once a day
const K_PREV_DAY = 'aw:data:prev-day';
const K_BROKEN = 'aw:data:broken'; // the text that could not be read

export type StorageProblem = null | { kind: 'restored'; from: string } | { kind: 'lost' } | { kind: 'write' };
let problem: StorageProblem = null;
const getStorageProblem = () => problem;
export function clearStorageProblem() {
  problem = null;
  emit();
}
/** The unreadable save, if one was set aside (so it can be exported and inspected). */
export const brokenSave = () => readStore(K_BROKEN);

const parse = (v: string) => {
  const raw = JSON.parse(v) as Partial<UserData>;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not a profile');
  return normalize(raw);
};
const today = () => new Date().toISOString().slice(0, 10);

function load(): UserData {
  if (cache) return cache;
  const v = readStore(K_DATA);
  if (!v) return (cache = freshData());
  try {
    cache = parse(v);
    // Once a day, keep this good save as the fallback.
    if (readStore(K_PREV_DAY) !== today() && writeStore(K_PREV, v)) writeStore(K_PREV_DAY, today());
    return cache;
  } catch {
    writeStore(K_BROKEN, v);
    const prev = readStore(K_PREV);
    try {
      if (!prev) throw new Error('no snapshot');
      cache = parse(prev);
      writeStore(K_DATA, prev);
      problem = { kind: 'restored', from: readStore(K_PREV_DAY) ?? '' };
    } catch {
      cache = freshData();
      problem = { kind: 'lost' };
    }
    return cache;
  }
}

// Another window of the app saved: read it again. (No window when the calculations run under test.)
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === K_DATA) {
      cache = null;
      emit();
    }
  });

export function useData(): UserData {
  return useSyncExternalStore(subscribe, load);
}
export function getData(): UserData {
  return load();
}
export function useStorageProblem(): StorageProblem {
  return useSyncExternalStore(subscribe, getStorageProblem);
}

export function update(fn: (d: UserData) => UserData) {
  cache = fn(load());
  if (!writeStore(K_DATA, JSON.stringify(cache)) && !problem) problem = { kind: 'write' };
  emit();
}

export const setSettings = (p: Partial<Settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...p } }));
export const setTimer = (p: Partial<TimerState>) => update((d) => ({ ...d, timer: { ...d.timer, ...p } }));
export const addSession = (s: Omit<Session, 'id' | 'focus' | 'activityId' | 'breakSec' | 'pauses' | 'pausedSec'> & Partial<Pick<Session, 'focus' | 'activityId' | 'breakSec' | 'pauses' | 'pausedSec'>>) =>
  update((d) => ({ ...d, sessions: [...d.sessions, { focus: 0, activityId: null, breakSec: 0, pauses: 0, pausedSec: 0, ...s, id: uid() }].sort((a, b) => a.start - b.start) }));
/** Adds sessions that already have an id (logged by Claude); ones already present are skipped. */
export const importSessions = (list: Session[]) =>
  update((d) => {
    const have = new Set(d.sessions.map((x) => x.id));
    const add = list.filter((x) => !have.has(x.id));
    return add.length ? { ...d, sessions: [...d.sessions, ...add].sort((a, b) => a.start - b.start) } : d;
  });
export const saveSession = (s: Session) =>
  update((d) => ({ ...d, sessions: d.sessions.map((x) => (x.id === s.id ? s : x)).sort((a, b) => a.start - b.start) }));
export const deleteSession = (id: string) => update((d) => ({ ...d, sessions: d.sessions.filter((x) => x.id !== id) }));
export const deleteSessions = (ids: string[]) => {
  const drop = new Set(ids);
  update((d) => ({ ...d, sessions: d.sessions.filter((x) => !drop.has(x.id)) }));
};

export const saveActivity = (a: Activity) =>
  update((d) => ({
    ...d,
    activities: d.activities.some((x) => x.id === a.id) ? d.activities.map((x) => (x.id === a.id ? a : x)) : [...d.activities, a],
  }));
/** Removes the activity; its sessions stay, without an activity. */
export const deleteActivity = (id: string) =>
  update((d) => ({
    ...d,
    activities: d.activities.filter((x) => x.id !== id),
    sessions: d.sessions.map((s) => (s.activityId === id ? { ...s, activityId: null } : s)),
    timer: d.timer.activityId === id ? { ...d.timer, activityId: null } : d.timer,
  }));

export const saveSubject = (s: Subject) =>
  update((d) => ({
    ...d,
    subjects: d.subjects.some((x) => x.id === s.id) ? d.subjects.map((x) => (x.id === s.id ? s : x)) : [...d.subjects, s],
  }));
export const deleteSubject = (id: string) =>
  update((d) => ({
    ...d,
    subjects: d.subjects.filter((x) => x.id !== id),
    sessions: d.sessions.map((s) => (s.subjectId === id ? { ...s, subjectId: null } : s)),
    timer: d.timer.subjectId === id ? { ...d.timer, subjectId: null } : d.timer,
  }));

export const saveSemester = (s: Semester) =>
  update((d) => ({
    ...d,
    semesters: d.semesters.some((x) => x.id === s.id) ? d.semesters.map((x) => (x.id === s.id ? s : x)) : [...d.semesters, s],
  }));
/** Removes the semester; its exams stay, without a semester. */
export const deleteSemester = (id: string) =>
  update((d) => ({
    ...d,
    semesters: d.semesters.filter((x) => x.id !== id),
    subjects: d.subjects.map((s) => (s.semesterId === id ? { ...s, semesterId: null } : s)),
  }));

export function replaceData(d: Partial<UserData>) {
  update(() => ({ ...normalize(d), timer: { ...DEFAULT_TIMER } }));
}

export function resetAll() {
  update(() => freshData());
}
