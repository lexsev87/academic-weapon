import { useEffect } from 'react';
import { periodSummary } from './insights';
import { bridgeSnapshot, hasClaudeBridge, inboxDone, inboxReady, onInbox, type InboxItem } from './native';
import { reviewPrompt } from './review';
import { dayKey, goalFor, startOfWeek, addDays, sumRange } from './stats';
import { STREAK_MIN_MIN, streak } from './streak';
import { getData, importSessions, uid, update, type Review, type Session, type UserData } from './store';
import { toast } from '../components/UI';

/* Mac app only: what Claude (through the local MCP server in desktop/mcp.cjs) can read, and the
   entries it leaves for the app. The snapshot is the user's own data on the user's own disk. */

function summary(data: UserData, now = new Date()) {
  const st = streak(data.sessions, data.settings, now);
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const wk0 = startOfWeek(now, data.settings.weekStart);
  let weekGoal = 0;
  for (let i = 0; i < 7; i++) weekGoal += goalFor(data.settings, addDays(wk0, i));
  const p = periodSummary(data, now);
  return {
    today: dayKey(now),
    todayStudied: sumRange(data.sessions, today0.getTime(), today0.getTime() + 86400000),
    todayGoal: goalFor(data.settings, now),
    weekStudied: sumRange(data.sessions, wk0.getTime(), addDays(wk0, 7).getTime()),
    weekGoal,
    streak: st.current,
    streakToday: st.today,
    streakRestToday: st.restToday,
    streakBest: st.best,
    streakMinMin: STREAK_MIN_MIN,
    recent4Studied: p.recentStudied,
    recent4Goal: p.recentGoal,
  };
}

function apply(items: InboxItem[]) {
  const sessions: Session[] = [];
  let reviews = 0;
  for (const it of items) {
    const p = it.payload as Record<string, unknown>;
    if (it.type === 'add_session' && typeof p.start === 'number' && typeof p.dur === 'number' && p.dur > 0)
      sessions.push({
        id: String(p.id || it.id),
        start: p.start,
        dur: Math.round(p.dur),
        breakSec: Number(p.breakSec) || 0,
        subjectId: typeof p.subjectId === 'string' && getData().subjects.some((s) => s.id === p.subjectId) ? p.subjectId : null,
        activityId: typeof p.activityId === 'string' && getData().activities.some((a) => a.id === p.activityId) ? p.activityId : null,
        note: String(p.note || '').slice(0, 500),
        focus: Math.max(0, Math.min(5, Number(p.focus) || 0)),
        kind: 'manual',
        pauses: 0,
        pausedSec: 0,
      });
    else if (it.type === 'set_next_step' && typeof p.subjectId === 'string')
      update((d) => ({ ...d, subjects: d.subjects.map((s) => (s.id === p.subjectId ? { ...s, nextStep: String(p.nextStep || '').slice(0, 200) } : s)) }));
    else if (it.type === 'save_review' && typeof p.text === 'string') {
      const at = Number(p.at) || Date.now();
      const r: Review = { id: it.id || uid(), at, weekStart: dayKey(addDays(new Date(at), -6)), text: p.text.trim().slice(0, 6000) };
      update((d) => (d.reviews.some((x) => x.id === r.id) ? d : { ...d, reviews: [r, ...d.reviews].slice(0, 12) }));
      reviews++;
    }
  }
  if (sessions.length) importSessions(sessions);
  inboxDone(items.map((i) => i.id));
  const parts = [sessions.length ? `${sessions.length} ${sessions.length === 1 ? 'sessione registrata' : 'sessioni registrate'}` : '', reviews ? 'revisione salvata' : ''].filter(Boolean);
  if (parts.length) toast(`Da Claude: ${parts.join(', ')}`);
}

/** Runs once in the shell: keeps the snapshot current and imports Claude's entries. */
export function useClaudeBridge(data: UserData) {
  useEffect(() => {
    if (!hasClaudeBridge) return;
    const off = onInbox(apply);
    inboxReady();
    return off;
  }, []);
  useEffect(() => {
    if (!hasClaudeBridge || !data.settings.setupDone) return;
    const t = setTimeout(() => {
      const { timer: _timer, ...shared } = data;
      bridgeSnapshot(JSON.stringify({ writtenAt: Date.now(), summary: summary(data), review: reviewPrompt(data), data: shared }));
    }, 1200);
    return () => clearTimeout(t);
  }, [data]);
}
