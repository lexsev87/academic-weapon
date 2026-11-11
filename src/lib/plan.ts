import { addDays, DAY, dayKey, goalFor, parseDayKey, startOfDay } from './stats';
import type { Subject, UserData } from './store';

export interface PlanRow {
  subject: Subject;
  blocks: number; // blocks planned for today
  done: number; // blocks already studied today (may be fractional)
  left: number; // whole blocks still to do today
  daysLeft: number | null; // days to the exam
  needPerDay: number | null; // seconds per study day needed to reach the exam's target hours
}

/**
 * Splits today's goal between the open exams. An exam with target hours and a date weighs
 * what it still needs per study day; one with only a date weighs more as the date approaches;
 * one with neither gets a small share so it is not forgotten.
 */
export function dayPlan(data: UserData, now = new Date()) {
  const { settings, sessions } = data;
  const today0 = startOfDay(now);
  const block = settings.focusMin * 60;
  const budget = goalFor(settings, now);
  const blocks = Math.round(budget / block);
  const open = data.subjects.filter((s) => s.status !== 'passed');

  // What the goals allow on an average study day of the coming week (days without a goal don't count,
  // because what each exam needs is also measured per study day).
  let week = 0;
  let studyDays = 0;
  for (let i = 0; i < 7; i++) {
    const g = goalFor(settings, addDays(today0, i));
    week += g;
    if (g > 0) studyDays++;
  }
  const capacity = studyDays ? week / studyDays : 0;

  const studyDaysUntil = (end: Date) => {
    let n = 0;
    for (let d = today0; d < end && n < 400; d = addDays(d, 1)) if (goalFor(settings, d) > 0) n++;
    return Math.max(1, n);
  };

  const info = open.map((s) => {
    const studied = sessions.filter((x) => x.subjectId === s.id).reduce((a, x) => a + x.dur, 0);
    const exam = s.examDate ? parseDayKey(s.examDate) : null;
    const daysLeft = exam ? Math.round((exam.getTime() - today0.getTime()) / DAY) : null;
    const future = daysLeft !== null && daysLeft >= 0;
    const needPerDay = s.targetHours > 0 && exam && future ? Math.max(0, s.targetHours * 3600 - studied) / studyDaysUntil(exam) : null;
    return { s, daysLeft: future ? daysLeft : null, needPerDay };
  });
  const base = open.length ? capacity / open.length : 0;
  const weights = info.map((x) => {
    if (x.needPerDay !== null) return x.needPerDay;
    if (x.daysLeft !== null) return base * Math.max(0.5, Math.min(3, 30 / Math.max(1, x.daysLeft)));
    return base * 0.4;
  });

  // Largest-remainder split of the day's blocks.
  const total = weights.reduce((a, w) => a + w, 0);
  const exact = weights.map((w) => (total > 0 ? (w / total) * blocks : 0));
  const alloc = exact.map(Math.floor);
  let rest = blocks - alloc.reduce((a, n) => a + n, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  for (const o of order) {
    if (rest <= 0) break;
    if (weights[o.i] > 0) {
      alloc[o.i]++;
      rest--;
    }
  }

  const todayKey = dayKey(now);
  const rows: PlanRow[] = info
    .map((x, i) => {
      const done = sessions.filter((y) => y.subjectId === x.s.id && dayKey(y.start) === todayKey).reduce((a, y) => a + y.dur, 0) / block;
      return { subject: x.s, blocks: alloc[i], done, left: Math.max(0, alloc[i] - Math.floor(done + 0.05)), daysLeft: x.daysLeft, needPerDay: x.needPerDay };
    })
    .filter((r) => r.blocks > 0 || r.done > 0)
    .sort((a, b) => b.left - a.left || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

  const demand = info.reduce((a, x) => a + (x.needPerDay ?? 0), 0);
  return {
    rows,
    blocks,
    /** Seconds per study day the exams with target hours ask for, all together. */
    demand,
    /** Seconds per study day the daily goals provide on average this week. */
    capacity,
    /** The exams ask for clearly more than the goals provide. */
    overload: capacity > 0 && demand > capacity * 1.1,
    next: rows.find((r) => r.left > 0) ?? null,
  };
}
