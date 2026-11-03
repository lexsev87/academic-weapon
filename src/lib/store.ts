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
  note: string;
  cycle: number;
  countdownMin: number;
  sessionStart: number | null;
  /** A finished session waiting to be logged (end-of-session sheet). */
  pending: { start: number; dur: number; kind: SessionKind; thenBreak: boolean } | null;
}
export interface UserData {
  settings: Settings;
  semesters: Semester[];
  subjects: Subject[];
  sessions: Session[];
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
};

export const DEFAULT_TIMER: TimerState = {
  mode: 'pomodoro',
  phase: 'focus',
  running: false,
  startedAt: null,
  elapsedMs: 0,
  subjectId: null,
  note: '',
  cycle: 0,
  countdownMin: 45,
  sessionStart: null,
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
    ...p,
  };
}

const freshData = (): UserData => ({
  settings: { ...DEFAULT_SETTINGS },
  semesters: [],
  subjects: [],
  sessions: [],
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
    sessions: (raw.sessions ?? []).map((x) => ({ ...x, focus: x.focus ?? 0 })),
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

function load(): UserData {
  if (cache) return cache;
  try {
    const v = readStore(K_DATA);
    cache = normalize(v ? (JSON.parse(v) as Partial<UserData>) : null);
  } catch {
    cache = freshData();
  }
  return cache;
}

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

export function update(fn: (d: UserData) => UserData) {
  cache = fn(load());
  writeStore(K_DATA, JSON.stringify(cache));
  emit();
}

export const setSettings = (p: Partial<Settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...p } }));
export const setTimer = (p: Partial<TimerState>) => update((d) => ({ ...d, timer: { ...d.timer, ...p } }));
export const addSession = (s: Omit<Session, 'id' | 'focus'> & { focus?: number }) =>
  update((d) => ({ ...d, sessions: [...d.sessions, { focus: 0, ...s, id: uid() }].sort((a, b) => a.start - b.start) }));
export const saveSession = (s: Session) =>
  update((d) => ({ ...d, sessions: d.sessions.map((x) => (x.id === s.id ? s : x)).sort((a, b) => a.start - b.start) }));
export const deleteSession = (id: string) => update((d) => ({ ...d, sessions: d.sessions.filter((x) => x.id !== id) }));

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
