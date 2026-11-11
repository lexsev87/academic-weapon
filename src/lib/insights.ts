import { NO_SUBJECT_COLOR, type Activity, type Session, type Settings, type Subject, type UserData } from './store';
import { addDays, DAY, dayKey, goalFor, parseDayKey, startOfDay, startOfWeek } from './stats';

/* ---------- tracking period ---------- */

/**
 * The period the goals refer to. Its end is the settings' date or 31 Aug of the academic year.
 * Its start is the settings' date; left empty, it is the day of the first session in the
 * academic year, so the months before the app was in use never count as study missed.
 */
export function trackingPeriod(data: UserData, now = new Date()) {
  const { settings } = data;
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const lastDay = settings.trackEnd ? parseDayKey(settings.trackEnd) : new Date(y + 1, 7, 31);
  const end = addDays(startOfDay(lastDay), 1); // exclusive
  let start: Date;
  if (settings.trackStart) start = startOfDay(parseDayKey(settings.trackStart));
  else {
    const yearStart = new Date(y, 8, 1);
    const first = data.sessions.find((s) => s.start >= yearStart.getTime()); // sessions are kept in start order
    start = first ? startOfDay(first.start) : startOfDay(now);
  }
  return { start, end, auto: !settings.trackStart };
}

/** Sum of the daily goals (seconds) for the days in [from, to). Free days count as zero. */
export function goalBetween(settings: Settings, from: Date, to: Date) {
  let t = 0;
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) t += goalFor(settings, d);
  return t;
}

const inRange = (sessions: Session[], from: number, to: number) => sessions.filter((s) => s.start >= from && s.start < to);
const sum = (sessions: Session[]) => sessions.reduce((a, s) => a + s.dur, 0);

/** How many recent days the "how am I doing" numbers look at: a debt older than this is forgotten. */
export const RECENT_DAYS = 28;

/** Headline numbers: the whole period, and the last four weeks (which is what pace and delay are judged on). */
export function periodSummary(data: UserData, now = new Date()) {
  const { start, end, auto } = trackingPeriod(data, now);
  const today0 = startOfDay(now);
  const tomorrow = addDays(today0, 1);
  const elapsedEnd = tomorrow < end ? (tomorrow > start ? tomorrow : start) : end;
  const sessions = inRange(data.sessions, start.getTime(), end.getTime());
  const studied = sum(sessions);
  const goalTotal = goalBetween(data.settings, start, end);
  const goalToDate = goalBetween(data.settings, start, elapsedEnd);
  const daysTotal = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY));
  const daysElapsed = Math.max(0, Math.round((elapsedEnd.getTime() - start.getTime()) / DAY));
  const activeDays = new Set(sessions.map((s) => dayKey(s.start))).size;

  // Last four weeks (or less, if the period is younger): today included.
  const recentStart = new Date(Math.max(start.getTime(), addDays(tomorrow, -RECENT_DAYS).getTime()));
  const recentDays = Math.max(1, Math.round((elapsedEnd.getTime() - recentStart.getTime()) / DAY));
  const recentStudied = sum(inRange(data.sessions, recentStart.getTime(), elapsedEnd.getTime()));
  const recentGoal = goalBetween(data.settings, recentStart, elapsedEnd);

  // The plan from tomorrow on: what the daily goals ask for on average, free days included.
  const daysLeft = Math.max(0, Math.round((end.getTime() - elapsedEnd.getTime()) / DAY));
  const aheadDays = Math.min(daysLeft, RECENT_DAYS);
  const plannedPace = aheadDays ? goalBetween(data.settings, elapsedEnd, addDays(elapsedEnd, aheadDays)) / aheadDays : 0;
  const currentPace = recentStudied / recentDays;
  return {
    start,
    end,
    auto,
    studied,
    sessions: sessions.length,
    goalTotal,
    goalToDate,
    totalProgress: goalTotal ? studied / goalTotal : 0,
    daysTotal,
    daysElapsed,
    daysLeft,
    timeProgress: daysElapsed / daysTotal,
    activeDays,
    avgSession: sessions.length ? studied / sessions.length : 0,
    avgStudyDay: activeDays ? studied / activeDays : 0,
    recentStart,
    recentDays,
    recentStudied,
    recentGoal,
    recentProgress: recentGoal ? recentStudied / recentGoal : 0,
    recentDelta: recentStudied - recentGoal,
    currentPace, // seconds per day over the recent window
    plannedPace, // seconds per day the goals ask for in the coming weeks
    paceRatio: plannedPace ? currentPace / plannedPace : currentPace ? Infinity : 0,
  };
}

/* ---------- any range (day, week, month, period) ---------- */

export function rangeInsights(data: UserData, from: Date, to: Date, now = new Date()) {
  const upTo = new Date(Math.min(to.getTime(), addDays(startOfDay(now), 1).getTime()));
  const sessions = inRange(data.sessions, from.getTime(), to.getTime());
  const byDay = new Map<string, number>();
  for (const s of sessions) byDay.set(dayKey(s.start), (byDay.get(dayKey(s.start)) ?? 0) + s.dur);
  const days = Math.max(0, Math.round((upTo.getTime() - from.getTime()) / DAY));
  let goalMet = 0;
  for (let d = startOfDay(from); d < upTo; d = addDays(d, 1)) {
    const g = goalFor(data.settings, d);
    if (g > 0 && (byDay.get(dayKey(d)) ?? 0) >= g) goalMet++;
  }
  const studied = sum(sessions);
  const activeDays = byDay.size;
  const exams = data.subjects.filter((s) => s.examDate && parseDayKey(s.examDate) >= from && parseDayKey(s.examDate) < to).length;
  return {
    studied,
    goal: goalBetween(data.settings, from, to),
    sessions: sessions.length,
    days,
    activeDays,
    goalMet,
    avgActive: activeDays ? studied / activeDays : 0,
    avgAll: days ? studied / days : 0,
    exams,
  };
}

/* ---------- cumulative trend: studied minus goal, day by day ---------- */

export function trendSeries(data: UserData, from: Date, to: Date) {
  const byDay = new Map<string, number>();
  for (const s of data.sessions) if (s.start >= from.getTime() && s.start < to.getTime()) byDay.set(dayKey(s.start), (byDay.get(dayKey(s.start)) ?? 0) + s.dur);
  const out: { date: Date; studied: number; goal: number; delta: number }[] = [];
  let studied = 0;
  let goal = 0;
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
    studied += byDay.get(dayKey(d)) ?? 0;
    goal += goalFor(data.settings, d);
    out.push({ date: d, studied, goal, delta: studied - goal });
  }
  return out;
}

/* ---------- totals by activity ---------- */

export function byActivity(sessions: Session[], activities: Activity[], from: number, to: number) {
  const m = new Map<string | null, { sec: number; n: number }>();
  for (const s of sessions)
    if (s.start >= from && s.start < to) {
      const v = m.get(s.activityId) ?? { sec: 0, n: 0 };
      m.set(s.activityId, { sec: v.sec + s.dur, n: v.n + 1 });
    }
  return [...m.entries()]
    .map(([id, v]) => {
      const a = activities.find((x) => x.id === id);
      return { id, sec: v.sec, n: v.n, name: a?.name ?? 'Senza attività', color: a?.color ?? NO_SUBJECT_COLOR };
    })
    .sort((a, b) => b.sec - a.sec);
}

/* ---------- pivot tables (Data Room) ---------- */

export type PivotRows = 'subject' | 'activity';
export type PivotCols = 'month' | 'week' | 'activity';
export type PivotMetric = 'hours' | 'sessions';

/** ISO week number (weeks start on Monday). */
export function isoWeek(d: Date) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - y0.getTime()) / DAY + 1) / 7);
}

export function pivot(data: UserData, rows: PivotRows, cols: PivotCols, from: Date, to: Date) {
  const sessions = inRange(data.sessions, from.getTime(), to.getTime());
  const rowDefs: { id: string | null; name: string; color: string }[] =
    rows === 'subject'
      ? [...data.subjects.map((s) => ({ id: s.id as string | null, name: s.name, color: s.color })), { id: null, name: 'Senza esame', color: NO_SUBJECT_COLOR }]
      : [...data.activities.map((a) => ({ id: a.id as string | null, name: a.name, color: a.color })), { id: null, name: 'Senza attività', color: NO_SUBJECT_COLOR }];

  let colDefs: { key: string; label: string }[] = [];
  let colOf: (s: Session) => string;
  if (cols === 'activity') {
    colDefs = [...data.activities.map((a) => ({ key: a.id, label: a.name })), { key: '-', label: 'Senza attività' }];
    colOf = (s) => s.activityId ?? '-';
  } else if (cols === 'month') {
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1))
      colDefs.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }) });
    colOf = (s) => `${new Date(s.start).getFullYear()}-${new Date(s.start).getMonth()}`;
  } else {
    for (let d = startOfWeek(from, 1); d < to; d = addDays(d, 7)) colDefs.push({ key: dayKey(d), label: `S${isoWeek(d)}` });
    colOf = (s) => dayKey(startOfWeek(s.start, 1));
  }
  const rowOf = (s: Session) => (rows === 'subject' ? s.subjectId : s.activityId);

  const cell = new Map<string, { sec: number; n: number }>();
  for (const s of sessions) {
    const k = `${rowOf(s) ?? ''}|${colOf(s)}`;
    const v = cell.get(k) ?? { sec: 0, n: 0 };
    cell.set(k, { sec: v.sec + s.dur, n: v.n + 1 });
  }
  const get = (r: string | null, c: string) => cell.get(`${r ?? ''}|${c}`) ?? { sec: 0, n: 0 };
  const rowsOut = rowDefs
    .map((r) => {
      const cells = colDefs.map((c) => get(r.id, c.key));
      return { ...r, cells, total: cells.reduce((a, v) => ({ sec: a.sec + v.sec, n: a.n + v.n }), { sec: 0, n: 0 }) };
    })
    .filter((r) => r.total.n > 0 || r.id !== null);
  const colTotals = colDefs.map((_, i) => rowsOut.reduce((a, r) => ({ sec: a.sec + r.cells[i].sec, n: a.n + r.cells[i].n }), { sec: 0, n: 0 }));
  const grand = colTotals.reduce((a, v) => ({ sec: a.sec + v.sec, n: a.n + v.n }), { sec: 0, n: 0 });
  return { cols: colDefs, rows: rowsOut, colTotals, grand };
}

/* ---------- one exam ---------- */

export function subjectInsights(data: UserData, s: Subject, now = new Date()) {
  const sessions = data.sessions.filter((x) => x.subjectId === s.id);
  const today0 = startOfDay(now);
  const week0 = startOfWeek(now, data.settings.weekStart);
  const month0 = new Date(now.getFullYear(), now.getMonth(), 1);
  const sumFrom = (t: Date) => sum(sessions.filter((x) => x.start >= t.getTime()));
  const studied = sum(sessions);
  const sem = data.semesters.find((x) => x.id === s.semesterId);
  const first = sessions[0] ? startOfDay(sessions[0].start) : today0;
  const start = sem?.start ? parseDayKey(sem.start) : first;
  const end = s.examDate ? parseDayKey(s.examDate) : sem?.end ? parseDayKey(sem.end) : null;
  const daysSoFar = Math.max(1, Math.round((addDays(today0, 1).getTime() - Math.min(start.getTime(), today0.getTime())) / DAY));
  const daysLeft = end ? Math.max(0, Math.round((end.getTime() - today0.getTime()) / DAY)) : null;
  const goal = s.targetHours * 3600;
  const activeDays = new Set(sessions.map((x) => dayKey(x.start))).size;
  const currentPace = studied / daysSoFar;
  const necessaryPace = goal && daysLeft ? Math.max(0, goal - studied) / daysLeft : null;
  return {
    sessions,
    studied,
    goal,
    progress: goal ? studied / goal : null,
    today: sumFrom(today0),
    week: sumFrom(week0),
    month: sumFrom(month0),
    start,
    end,
    daysSoFar,
    daysLeft,
    activeDays,
    avgActive: activeDays ? studied / activeDays : 0,
    avgAll: studied / daysSoFar,
    avgSession: sessions.length ? studied / sessions.length : 0,
    currentPace,
    necessaryPace,
    paceRatio: necessaryPace ? currentPace / necessaryPace : null,
  };
}

/* ---------- concentration: when and how it is best ---------- */

export interface FocusGroup {
  key: string;
  label: string;
  color?: string;
  n: number; // rated sessions
  avg: number; // mean rating 1..5
}

const BANDS = [
  { key: 'morning', label: 'Mattina', from: 6, to: 12 },
  { key: 'afternoon', label: 'Pomeriggio', from: 12, to: 18 },
  { key: 'evening', label: 'Sera', from: 18, to: 23 },
  { key: 'night', label: 'Notte', from: 23, to: 30 },
];

/** Needs this many rated sessions in a group before it is compared with the others. */
export const FOCUS_MIN_N = 3;

export function focusInsights(data: UserData, from: number, to: number) {
  const all = inRange(data.sessions, from, to);
  const rated = all.filter((s) => s.focus > 0);
  // Position of each block in its day (1st, 2nd, 3rd, 4th or later), counting every session of that day.
  const ordinal = new Map<string, number>();
  const perDay = new Map<string, number>();
  for (const s of all) {
    const n = (perDay.get(dayKey(s.start)) ?? 0) + 1;
    perDay.set(dayKey(s.start), n);
    ordinal.set(s.id, n);
  }

  const group = (items: { key: string; label: string; color?: string }[], keyOf: (s: Session) => string | null): FocusGroup[] => {
    const acc = new Map<string, { n: number; sum: number }>();
    for (const s of rated) {
      const k = keyOf(s);
      if (k === null) continue;
      const v = acc.get(k) ?? { n: 0, sum: 0 };
      acc.set(k, { n: v.n + 1, sum: v.sum + s.focus });
    }
    return items.flatMap((it) => {
      const v = acc.get(it.key);
      return v ? [{ ...it, n: v.n, avg: v.sum / v.n }] : [];
    });
  };

  const byTime = group(BANDS, (s) => {
    const h = new Date(s.start).getHours();
    const hh = h < 6 ? h + 24 : h;
    return BANDS.find((b) => hh >= b.from && hh < b.to)?.key ?? null;
  });
  const byActivity = group(
    [...data.activities.map((a) => ({ key: a.id, label: a.name, color: a.color })), { key: '-', label: 'Senza attività', color: NO_SUBJECT_COLOR }],
    (s) => s.activityId ?? '-',
  );
  const byOrder = group(
    [
      { key: '1', label: '1° blocco' },
      { key: '2', label: '2° blocco' },
      { key: '3', label: '3° blocco' },
      { key: '4', label: 'Dal 4° in poi' },
    ],
    (s) => String(Math.min(4, ordinal.get(s.id) ?? 1)),
  );

  // Pauses inside a block (timer sessions only) against the rating.
  const timed = rated.filter((s) => s.kind !== 'manual');
  const mean = (list: Session[]) => (list.length ? list.reduce((a, s) => a + s.focus, 0) / list.length : 0);
  const calm = timed.filter((s) => s.pauses === 0);
  const broken = timed.filter((s) => s.pauses >= 2);
  const timedAll = all.filter((s) => s.kind !== 'manual');

  const findings: string[] = [];
  const compare = (groups: FocusGroup[], say: (best: FocusGroup, worst: FocusGroup) => string) => {
    const ok = groups.filter((g) => g.n >= FOCUS_MIN_N).sort((a, b) => b.avg - a.avg);
    if (ok.length >= 2 && ok[0].avg - ok[ok.length - 1].avg >= 0.5) findings.push(say(ok[0], ok[ok.length - 1]));
  };
  const f = (v: number) => v.toFixed(1).replace('.', ',');
  compare(byTime, (b, w) => `Ti concentri meglio di ${b.label.toLowerCase()} (${f(b.avg)} su 5) che di ${w.label.toLowerCase()} (${f(w.avg)}).`);
  compare(byActivity, (b, w) => `“${b.label}” è l’attività in cui sei più concentrato (${f(b.avg)}); “${w.label}” quella in cui lo sei meno (${f(w.avg)}).`);
  const first = byOrder.find((g) => g.key === '1');
  const late = byOrder.filter((g) => g.key !== '1' && g.n >= FOCUS_MIN_N).sort((a, b) => a.avg - b.avg)[0];
  if (first && first.n >= FOCUS_MIN_N && late && first.avg - late.avg >= 0.5) findings.push(`La concentrazione cala nel corso della giornata: ${f(first.avg)} al primo blocco, ${f(late.avg)} ${late.key === '4' ? 'dal quarto in poi' : `al ${late.key}° blocco`}.`);
  if (calm.length >= FOCUS_MIN_N && broken.length >= FOCUS_MIN_N && mean(calm) - mean(broken) >= 0.5)
    findings.push(`I blocchi senza interruzioni valgono ${f(mean(calm))} su 5; quelli con due o più pause ${f(mean(broken))}.`);

  return {
    rated: rated.length,
    total: all.length,
    avg: mean(rated),
    byTime,
    byActivity,
    byOrder,
    pausesPerBlock: timedAll.length ? timedAll.reduce((a, s) => a + s.pauses, 0) / timedAll.length : 0,
    pausedShare: timedAll.length ? timedAll.filter((s) => s.pauses > 0).length / timedAll.length : 0,
    findings,
  };
}
