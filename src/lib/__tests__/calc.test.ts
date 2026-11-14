import { describe, expect, it } from 'vitest';
import { focusInsights, goalBetween, periodSummary, pivot, rangeInsights, trackingPeriod, trendSeries } from '../insights';
import { dayPlan } from '../plan';
import { streak } from '../streak';
import { addDays, dayKey, goalFor, isDayOff, startOfDay } from '../stats';
import { DEFAULT_SETTINGS, DEFAULT_TIMER, newSubject, type Session, type Settings, type UserData } from '../store';

const H = 3600;
/** Wednesday 11 November 2026, 10:00 local time. */
const NOW = new Date(2026, 10, 11, 10, 0);

const settings = (p: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, setupDone: true, goalInBlocks: false, dayGoals: [0, 120, 120, 120, 120, 120, 0], ...p });
let n = 0;
const session = (day: Date, hour: number, p: Partial<Session> = {}): Session => ({
  id: `s${n++}`,
  subjectId: null,
  start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour).getTime(),
  dur: H,
  note: '',
  kind: 'pomodoro',
  focus: 0,
  activityId: null,
  breakSec: 0,
  pauses: 0,
  pausedSec: 0,
  ...p,
});
const data = (p: Partial<UserData> = {}): UserData => ({
  settings: settings(),
  semesters: [],
  subjects: [],
  activities: [
    { id: 'a1', name: 'Esercizi', color: '#0f0' },
    { id: 'a2', name: 'Lettura', color: '#00f' },
  ],
  sessions: [],
  reviews: [],
  timer: { ...DEFAULT_TIMER },
  ...p,
});
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('daily goals', () => {
  it('uses the weekday goal, in seconds', () => {
    expect(goalFor(settings(), d(2026, 11, 11))).toBe(2 * H); // Wednesday
    expect(goalFor(settings(), d(2026, 11, 15))).toBe(0); // Sunday
  });
  it('counting in blocks, a 50+10 block fills a whole hour of the goal', () => {
    const s = settings({ goalInBlocks: true, focusMin: 50, shortMin: 10 });
    expect(goalFor(s, d(2026, 11, 11))).toBe(2 * 50 * 60);
  });
  it('a free day has no goal, on both ends of the range', () => {
    const s = settings({ daysOff: [{ id: 'x', from: '2026-11-10', to: '2026-11-11', label: '' }] });
    expect(isDayOff(s, d(2026, 11, 9))).toBe(false);
    expect(isDayOff(s, d(2026, 11, 10))).toBe(true);
    expect(isDayOff(s, d(2026, 11, 11))).toBe(true);
    expect(isDayOff(s, d(2026, 11, 12))).toBe(false);
    expect(goalFor(s, d(2026, 11, 11))).toBe(0);
    // Mon–Fri of that week: 5 days × 2 h, minus the two free days.
    expect(goalBetween(s, d(2026, 11, 9), d(2026, 11, 14))).toBe(6 * H);
  });
});

describe('tracking period', () => {
  it('starts at the first session of the academic year, not on 1 September', () => {
    const p = trackingPeriod(data({ sessions: [session(d(2026, 11, 2), 9), session(d(2026, 11, 5), 9)] }), NOW);
    expect(dayKey(p.start)).toBe('2026-11-02');
    expect(dayKey(addDays(p.end, -1))).toBe('2027-08-31');
    expect(p.auto).toBe(true);
  });
  it('ignores sessions of earlier academic years', () => {
    const p = trackingPeriod(data({ sessions: [session(d(2026, 3, 1), 9), session(d(2026, 10, 20), 9)] }), NOW);
    expect(dayKey(p.start)).toBe('2026-10-20');
  });
  it('with no sessions, starts today: nothing is overdue', () => {
    const p = periodSummary(data(), NOW);
    expect(dayKey(p.start)).toBe('2026-11-11');
    expect(p.recentDelta).toBe(-2 * H); // only today's goal is open
  });
  it('respects dates set by hand', () => {
    const p = trackingPeriod(data({ settings: settings({ trackStart: '2026-10-01', trackEnd: '2026-12-31' }) }), NOW);
    expect(dayKey(p.start)).toBe('2026-10-01');
    expect(dayKey(p.end)).toBe('2027-01-01');
    expect(p.auto).toBe(false);
  });
});

describe('period summary', () => {
  it('judges delay on the last four weeks only', () => {
    // Started on 1 September, studied nothing until two sessions this week.
    const sessions = [session(d(2026, 9, 1), 9, { dur: 60 }), session(d(2026, 11, 9), 9), session(d(2026, 11, 10), 9)];
    const p = periodSummary(data({ sessions }), NOW);
    expect(p.recentDays).toBe(28);
    expect(dayKey(p.recentStart)).toBe('2026-10-15');
    expect(p.recentGoal).toBe(20 * 2 * H); // 20 weekdays in the window
    expect(p.recentStudied).toBe(2 * H);
    expect(p.recentDelta).toBe(2 * H - 40 * H);
    expect(p.currentPace).toBeCloseTo((2 * H) / 28);
  });
  it('planned pace is the average goal of the coming weeks', () => {
    const p = periodSummary(data({ sessions: [session(d(2026, 11, 9), 9)] }), NOW);
    expect(p.plannedPace).toBeCloseTo((20 * 2 * H) / 28); // 20 weekdays in 28 days
  });
});

describe('range insights and trend', () => {
  const sessions = [session(d(2026, 11, 9), 9, { dur: 2 * H }), session(d(2026, 11, 10), 9), session(d(2026, 11, 10), 15)];
  it('counts active days and days that met the goal', () => {
    const r = rangeInsights(data({ sessions }), d(2026, 11, 9), d(2026, 11, 16), NOW);
    expect(r.studied).toBe(4 * H);
    expect(r.activeDays).toBe(2);
    expect(r.goalMet).toBe(2);
    expect(r.days).toBe(3); // Mon, Tue and today
  });
  it('cumulates studied minus goal', () => {
    const t = trendSeries(data({ sessions }), d(2026, 11, 9), d(2026, 11, 12));
    expect(t.map((x) => x.delta)).toEqual([0, 0, -2 * H]);
  });
});

describe('pivot tables', () => {
  it('sums rows, columns and the grand total', () => {
    const subjects = [newSubject({ id: 'm', name: 'Micro' }), newSubject({ id: 'e', name: 'Econometria' })];
    const sessions = [
      session(d(2026, 10, 5), 9, { subjectId: 'm', activityId: 'a1' }),
      session(d(2026, 11, 5), 9, { subjectId: 'm', activityId: 'a2' }),
      session(d(2026, 11, 6), 9, { subjectId: 'e', activityId: 'a1', dur: 2 * H }),
    ];
    const t = pivot(data({ subjects, sessions }), 'subject', 'month', d(2026, 10, 1), d(2026, 12, 1));
    expect(t.cols).toHaveLength(2);
    expect(t.rows.find((r) => r.id === 'm')!.cells.map((c) => c.sec)).toEqual([H, H]);
    expect(t.colTotals.map((c) => c.sec)).toEqual([H, 3 * H]);
    expect(t.grand).toEqual({ sec: 4 * H, n: 3 });
    const byAct = pivot(data({ subjects, sessions }), 'subject', 'activity', d(2026, 10, 1), d(2026, 12, 1));
    expect(byAct.rows.find((r) => r.id === 'e')!.total.sec).toBe(2 * H);
  });
});

describe('plan of the day', () => {
  const s4 = settings({ focusMin: 60, dayGoals: [0, 240, 240, 240, 240, 240, 0] });
  it('gives more blocks to the exam that needs more per day', () => {
    const subjects = [
      newSubject({ id: 'near', name: 'Vicino', examDate: '2026-11-25', targetHours: 30 }), // 30 h in 10 study days = 3 h/day
      newSubject({ id: 'far', name: 'Lontano', examDate: '2027-01-20', targetHours: 50 }), // 50 h in 50 study days = 1 h/day
    ];
    const p = dayPlan(data({ settings: s4, subjects }), NOW);
    expect(p.blocks).toBe(4);
    expect(p.rows.find((r) => r.subject.id === 'near')!.blocks).toBe(3);
    expect(p.rows.find((r) => r.subject.id === 'far')!.blocks).toBe(1);
    expect(p.overload).toBe(false);
    expect(p.next!.subject.id).toBe('near');
  });
  it('counts what was already studied today', () => {
    const subjects = [newSubject({ id: 'near', name: 'Vicino', examDate: '2026-11-25', targetHours: 30 })];
    const sessions = [session(startOfDay(NOW), 8, { subjectId: 'near' })];
    const p = dayPlan(data({ settings: s4, subjects, sessions }), NOW);
    const row = p.rows[0];
    expect(row.blocks).toBe(4);
    expect(row.left).toBe(3);
  });
  it('warns when the exams ask for more than the daily goals provide', () => {
    const subjects = [newSubject({ id: 'a', name: 'A', examDate: '2026-11-18', targetHours: 60 })]; // 60 h in 5 study days
    const p = dayPlan(data({ settings: s4, subjects }), NOW);
    expect(p.overload).toBe(true);
    expect(p.demand).toBeGreaterThan(p.capacity);
  });
  it('skips passed exams and plans nothing on a free day', () => {
    const subjects = [newSubject({ id: 'a', name: 'A', status: 'passed' }), newSubject({ id: 'b', name: 'B' })];
    expect(dayPlan(data({ settings: s4, subjects }), NOW).rows.map((r) => r.subject.id)).toEqual(['b']);
    const off = settings({ ...s4, daysOff: [{ id: 'x', from: '2026-11-11', to: '2026-11-11', label: '' }] });
    expect(dayPlan(data({ settings: off, subjects }), NOW).blocks).toBe(0);
  });
});

describe('concentration insights', () => {
  it('finds the better time of day and the cost of pauses', () => {
    const sessions: Session[] = [];
    for (let i = 0; i < 4; i++) {
      sessions.push(session(d(2026, 11, 2 + i), 9, { focus: 5, pauses: 0 }));
      sessions.push(session(d(2026, 11, 2 + i), 21, { focus: 2, pauses: 3 }));
    }
    const to = addDays(startOfDay(NOW), 1).getTime();
    const r = focusInsights(data({ sessions }), to - 90 * 86400000, to);
    expect(r.rated).toBe(8);
    expect(r.byTime.find((g) => g.key === 'morning')!.avg).toBe(5);
    expect(r.byTime.find((g) => g.key === 'evening')!.avg).toBe(2);
    expect(r.findings.some((t) => t.includes('mattina'))).toBe(true);
    expect(r.findings.some((t) => t.includes('senza interruzioni'))).toBe(true);
    expect(r.pausesPerBlock).toBe(1.5);
  });
  it('says nothing with too few rated sessions', () => {
    const to = addDays(startOfDay(NOW), 1).getTime();
    const r = focusInsights(data({ sessions: [session(d(2026, 11, 2), 9, { focus: 5 }), session(d(2026, 11, 2), 21, { focus: 1 })] }), to - 90 * 86400000, to);
    expect(r.findings).toEqual([]);
  });
});

describe('streak', () => {
  // NOW is Wednesday 11 November 2026; weekday goals Mon–Fri, weekends free.
  const s = settings();
  const study = (y: number, m: number, day: number, min = 50) => session(d(y, m, day), 9, { dur: min * 60 });

  it('counts consecutive days up to today', () => {
    const r = streak([study(2026, 11, 9), study(2026, 11, 10), study(2026, 11, 11)], s, NOW);
    expect(r.current).toBe(3);
    expect(r.today).toBe(true);
    expect(r.next).toBe(7);
    expect(r.reached).toBe(3);
  });
  it('keeps the run while today is still open, and says how much is missing', () => {
    const r = streak([study(2026, 11, 9), study(2026, 11, 10), study(2026, 11, 11, 10)], s, NOW);
    expect(r.current).toBe(2);
    expect(r.today).toBe(false);
    expect(r.todayLeft).toBe(15 * 60);
  });
  it('a short day does not count, and a missed working day breaks the run', () => {
    const r = streak([study(2026, 11, 6), study(2026, 11, 9, 20), study(2026, 11, 10)], s, NOW);
    expect(r.current).toBe(1); // Monday had only 20 minutes
    expect(r.best).toBe(1);
  });
  it('a weekend without study does not break it; studying on it adds a day', () => {
    // Fri 6, (Sat 7 nothing), Sun 8 studied, Mon 9, Tue 10
    const r = streak([study(2026, 11, 6), study(2026, 11, 8), study(2026, 11, 9), study(2026, 11, 10)], s, NOW);
    expect(r.current).toBe(4);
  });
  it('free days do not break it', () => {
    const off = settings({ daysOff: [{ id: 'x', from: '2026-11-09', to: '2026-11-10', label: '' }] });
    const r = streak([study(2026, 11, 5), study(2026, 11, 6), study(2026, 11, 11)], off, NOW);
    expect(r.current).toBe(3);
    expect(r.restToday).toBe(false);
  });
  it('remembers the longest run', () => {
    const old = [5, 6, 7, 8, 9, 12, 13, 14, 15, 16].map((day) => study(2026, 10, day)); // two weeks in October
    const r = streak([...old, study(2026, 11, 10), study(2026, 11, 11)], s, NOW);
    expect(r.best).toBe(10);
    expect(r.current).toBe(2);
  });
  it('is zero with no study', () => {
    expect(streak([], s, NOW)).toMatchObject({ current: 0, best: 0, today: false, next: 3 });
  });
});
