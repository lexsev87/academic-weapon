import { addDays, dayKey, goalFor, startOfDay } from './stats';
import type { Session, Settings } from './store';

/* The streak: days in a row with some real study. A day counts with at least STREAK_MIN_SEC of
   study. Rest days (free days, or a weekday whose goal is zero) never break the streak: studying
   on one still adds a day. Today only breaks nothing: until it counts, the streak is "at risk". */

export const STREAK_MIN_MIN = 25;
const STREAK_MIN_SEC = STREAK_MIN_MIN * 60;
export const MILESTONES = [3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 1000];

export interface Streak {
  /** Days in the current run, today included if it already counts. */
  current: number;
  /** Today already counts. */
  today: boolean;
  /** Seconds still needed today for it to count (0 when it does). */
  todayLeft: number;
  /** Today is a rest day: no need to study to keep the streak. */
  restToday: boolean;
  /** Longest run ever. */
  best: number;
  /** Next milestone above the current run. */
  next: number;
  /** Last milestone reached by the current run (0 if none). */
  reached: number;
}

const isRest = (settings: Settings, d: Date) => goalFor(settings, d) === 0;

export function streak(sessions: Session[], settings: Settings, now = new Date()): Streak {
  const byDay = new Map<string, number>();
  for (const s of sessions) byDay.set(dayKey(s.start), (byDay.get(dayKey(s.start)) ?? 0) + s.dur);
  const counts = (d: Date) => (byDay.get(dayKey(d)) ?? 0) >= STREAK_MIN_SEC;

  const today0 = startOfDay(now);
  const todayCounts = counts(today0);
  const restToday = isRest(settings, today0);

  // Walk back from yesterday (or today, if it counts) until a working day without study.
  let current = todayCounts ? 1 : 0;
  for (let d = addDays(today0, -1), guard = 0; guard < 4000; d = addDays(d, -1), guard++) {
    if (counts(d)) current++;
    else if (isRest(settings, d)) {
      if (!hasAnyBefore(byDay, d)) break; // nothing studied before this: the run started after it
      continue;
    } else break;
  }

  // Longest run: same rules over the whole history.
  let best = current;
  const keys = [...byDay.keys()].sort();
  if (keys.length) {
    let run = 0;
    const first = new Date(`${keys[0]}T00:00`);
    for (let d = startOfDay(first); d <= today0; d = addDays(d, 1)) {
      if (counts(d)) run++;
      else if (isRest(settings, d) || d.getTime() === today0.getTime()) continue;
      else run = 0;
      if (run > best) best = run;
    }
  }

  const next = MILESTONES.find((m) => m > current) ?? current + 100;
  const reached = [...MILESTONES].reverse().find((m) => m <= current) ?? 0;
  return { current, today: todayCounts, todayLeft: todayCounts ? 0 : Math.max(0, STREAK_MIN_SEC - (byDay.get(dayKey(today0)) ?? 0)), restToday, best, next, reached };
}

function hasAnyBefore(byDay: Map<string, number>, d: Date) {
  const k = dayKey(d);
  for (const key of byDay.keys()) if (key < k) return true;
  return false;
}
