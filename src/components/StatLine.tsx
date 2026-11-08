import { periodSummary } from '../lib/insights';
import { fmtDur } from '../lib/stats';
import type { UserData } from '../lib/store';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** One quiet line under a page title: where the tracking period stands. */
export function StatLine({ data }: { data: UserData }) {
  const p = periodSummary(data);
  const ahead = p.studied - p.goalToDate;
  return (
    <span className="stat-line tnum">
      <span>
        <b>{fmtDur(p.studied)}</b> studiate
      </span>
      {p.goalToDate > 0 && (
        <span data-tone={ahead >= 0 ? 'good' : 'bad'}>
          <b>{pct(p.studyProgress)}</b> dell’obiettivo a oggi
        </span>
      )}
      <span>
        <b>{pct(p.timeProgress)}</b> del periodo trascorso
      </span>
      <span>
        <b>{p.sessions}</b> {p.sessions === 1 ? 'sessione' : 'sessioni'}
      </span>
    </span>
  );
}
