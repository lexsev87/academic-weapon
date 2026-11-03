import { NO_SUBJECT_COLOR, type GradeScale, type Session, type Settings, type Subject } from './store';

export const DAY = 86400000;

export function dayKey(d: Date | number) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function startOfDay(d: Date | number) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function startOfWeek(d: Date | number, weekStart: 0 | 1) {
  const x = startOfDay(d);
  const diff = (x.getDay() - weekStart + 7) % 7;
  return addDays(x, -diff);
}
export function parseDayKey(k: string) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDur(sec: number, short = false) {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}${short ? 'm' : ' min'}`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}m`;
}
export function fmtHours(sec: number) {
  const h = sec / 3600;
  return h >= 10 ? `${Math.round(h)} h` : `${h.toFixed(1).replace('.', ',')} h`;
}
export function fmtClock(ms: number) {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
export const fmtDate = (d: Date | number, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Date(d).toLocaleDateString('it-IT', opts);

export function totalsByDay(sessions: Session[]) {
  const m = new Map<string, number>();
  for (const s of sessions) {
    const k = dayKey(s.start);
    m.set(k, (m.get(k) ?? 0) + s.dur);
  }
  return m;
}

export function sumRange(sessions: Session[], from: number, to: number) {
  let t = 0;
  for (const s of sessions) if (s.start >= from && s.start < to) t += s.dur;
  return t;
}

export function bySubject(sessions: Session[], subjects: Subject[], from: number, to: number) {
  const m = new Map<string | null, number>();
  for (const s of sessions) if (s.start >= from && s.start < to) m.set(s.subjectId, (m.get(s.subjectId) ?? 0) + s.dur);
  const rows = [...m.entries()].map(([id, sec]) => {
    const sub = subjects.find((x) => x.id === id);
    return { id, sec, name: sub?.name ?? 'Senza esame', color: sub?.color ?? NO_SUBJECT_COLOR };
  });
  return rows.sort((a, b) => b.sec - a.sec);
}

/** Per-day study time split by exam colour, for stacked columns. */
export function partsByDay(sessions: Session[], subjects: Subject[]) {
  const color = new Map(subjects.map((s) => [s.id, s.color]));
  const m = new Map<string, Map<string, number>>();
  for (const s of sessions) {
    const k = dayKey(s.start);
    const c = (s.subjectId && color.get(s.subjectId)) || NO_SUBJECT_COLOR;
    if (!m.has(k)) m.set(k, new Map());
    m.get(k)!.set(c, (m.get(k)!.get(c) ?? 0) + s.dur);
  }
  return (k: string) => [...(m.get(k) ?? [])].map(([c, sec]) => ({ color: c, sec }));
}

/* ---------- daily goals ---------- */
/** Goal in seconds for the given day (weekday-specific). */
/** Planned time for the day in seconds, as set (breaks included when counting in blocks). */
export const plannedFor = (settings: Settings, d: Date | number = new Date()) => (settings.dayGoals[new Date(d).getDay()] ?? 0) * 60;
/** Length of one pomodoro block (focus + short break), in seconds. */
export const blockSec = (s: Settings) => (s.focusMin + s.shortMin) * 60;
/**
 * Study seconds needed to meet the day's goal. Counting in blocks, each 50-minute focus
 * block fills a whole hour of a 50+10 goal, so 4 h = 4 blocks = 3 h 20 m of actual study.
 */
export const goalFor = (settings: Settings, d: Date | number = new Date()) => {
  const planned = plannedFor(settings, d);
  return settings.goalInBlocks ? (planned * settings.focusMin * 60) / blockSec(settings) : planned;
};
/** Blocks in the day's goal, and blocks already done given the seconds studied. */
export const blocksFor = (settings: Settings, d: Date | number = new Date()) => plannedFor(settings, d) / blockSec(settings);
export const blocksDone = (settings: Settings, sec: number) => sec / (settings.focusMin * 60);
export const fmtBlocks = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1).replace('.', ','));
/** "4 blocchi" when counting in blocks, otherwise the hours. */
export const fmtGoal = (settings: Settings, d: Date | number = new Date()) =>
  settings.goalInBlocks ? `${fmtBlocks(blocksFor(settings, d))} ${Math.round(blocksFor(settings, d)) === 1 ? 'blocco' : 'blocchi'}` : fmtDur(plannedFor(settings, d));

/* ---------- career (libretto) ---------- */
export function career(subjects: Subject[], settings: Settings) {
  const credits = !!settings.creditLabel;
  const w = (s: Subject) => (credits ? s.cfu : 1);
  const passed = subjects.filter((s) => s.status === 'passed');
  const graded = settings.gradeScale === 'none' ? [] : passed.filter((s) => s.graded && s.grade !== null);
  const cfuDone = passed.reduce((a, s) => a + s.cfu, 0);
  const wGraded = graded.reduce((a, s) => a + w(s), 0);
  const avg = graded.length ? graded.reduce((a, s) => a + s.grade!, 0) / graded.length : null;
  const weighted = wGraded ? graded.reduce((a, s) => a + s.grade! * w(s), 0) / wGraded : null;
  return {
    passed: passed.length,
    cfuDone,
    cfuPct: credits && settings.degreeCfu ? Math.min(1, cfuDone / settings.degreeCfu) : 0,
    avg,
    weighted,
    // Italian graduation base: weighted average on 30, scaled to 110.
    base110: settings.gradeScale === '30' && weighted !== null ? (weighted * 110) / 30 : null,
    laudes: settings.gradeScale === '30' ? graded.filter((s) => s.laude).length : 0,
  };
}

export const fmtNum = (v: number, digits = 2) => v.toFixed(digits).replace('.', ',');
export const fmtAvg = (v: number | null, digits = 2) => (v === null ? '–' : fmtNum(v, digits));
export function fmtGrade(s: Subject, scale: GradeScale) {
  if (!s.graded || scale === 'none') return 'Superato';
  if (s.grade === null) return '–';
  if (scale === '30') return `${s.grade}${s.laude ? ' e lode' : ''}`;
  return Number.isInteger(s.grade) ? String(s.grade) : fmtNum(s.grade, 1);
}

/** Hours per day still needed to reach an exam's target hours before its date. */
export function pacePerDay(s: Subject, studiedSec: number) {
  const days = daysUntil(s.examDate);
  if (!s.targetHours || days === null || days < 1 || s.status === 'passed') return null;
  const left = s.targetHours * 3600 - studiedSec;
  return left <= 0 ? 0 : left / days;
}

/** Seconds studied for each subject id, over all time. */
export function totalsBySubject(sessions: Session[]) {
  const m = new Map<string, number>();
  for (const s of sessions) if (s.subjectId) m.set(s.subjectId, (m.get(s.subjectId) ?? 0) + s.dur);
  return m;
}

export function daysUntil(dateKey: string) {
  if (!dateKey) return null;
  return Math.round((parseDayKey(dateKey).getTime() - startOfDay(new Date()).getTime()) / DAY);
}
