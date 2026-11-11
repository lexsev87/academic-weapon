import { useState } from 'react';
import { Donut, Empty, TrendChart } from '../../components/Charts';
import { Section, Seg } from '../../components/UI';
import { byActivity, periodSummary, RECENT_DAYS, trendSeries } from '../../lib/insights';
import { readStore, writeStore } from '../../lib/platform';
import { addDays, fmtDur, fmtHours, startOfDay, startOfWeek } from '../../lib/stats';
import type { UserData } from '../../lib/store';
import { FocusInsights } from './FocusInsights';

type Range = 'today' | 'week' | 'month' | 'period';
const RANGE_LABEL: Record<Range, string> = { today: 'Oggi', week: 'Settimana', month: 'Mese', period: 'Periodo' };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmtDay = (d: Date) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

/** Goals, pace, trend and where the time went: the "how am I doing" part of Statistiche. */
export function PeriodPanel({ data }: { data: UserData }) {
  const { sessions, subjects } = data;
  const [range, setRangeState] = useState<Range>(() => (readStore('aw:home-range') as Range) || 'week');
  const setRange = (r: Range) => {
    setRangeState(r);
    writeStore('aw:home-range', r);
  };
  const now = new Date();
  const today0 = startOfDay(now);
  const tomorrow = addDays(today0, 1);
  const p = periodSummary(data, now);
  const weeks = Math.max(1, Math.round(p.recentDays / 7));
  const recentWord = p.recentDays >= RECENT_DAYS ? 'ultime 4 settimane' : p.recentDays <= 1 ? 'oggi' : `ultimi ${p.recentDays} giorni`;

  // Trend over the last 12 weeks at most: studied minus goal, cumulated.
  const trendStart = new Date(Math.max(p.start.getTime(), addDays(tomorrow, -84).getTime()));
  const trendEnd = tomorrow < p.end ? tomorrow : p.end;
  const trend = trendSeries(data, trendStart, trendEnd);

  const rFrom = range === 'today' ? today0 : range === 'week' ? startOfWeek(now, data.settings.weekStart) : range === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : p.start;
  const rTo = range === 'period' ? p.end : tomorrow;
  const acts = byActivity(sessions, data.activities, rFrom.getTime(), rTo.getTime());
  const actsTotal = Math.max(1, acts.reduce((a, x) => a + x.sec, 0));
  const examRows = subjects
    .map((s) => {
      const list = sessions.filter((x) => x.subjectId === s.id);
      const inRange = list.filter((x) => x.start >= rFrom.getTime() && x.start < rTo.getTime()).reduce((a, x) => a + x.dur, 0);
      const total = list.reduce((a, x) => a + x.dur, 0);
      return { s, inRange, total, goal: s.targetHours * 3600 };
    })
    .filter((r) => r.s.status !== 'passed' || r.inRange > 0)
    .sort((a, b) => b.inRange - a.inRange || b.total - a.total);
  const noExam = sessions.filter((x) => !x.subjectId && x.start >= rFrom.getTime() && x.start < rTo.getTime()).reduce((a, x) => a + x.dur, 0);
  const rangeTotal = examRows.reduce((a, r) => a + r.inRange, 0) + noExam;

  const ratio = Number.isFinite(p.paceRatio) ? p.paceRatio : 1.2;
  const tone = p.plannedPace === 0 || ratio >= 1 ? 'good' : ratio >= 0.8 ? 'warn' : 'bad';
  const mark = Math.max(0, Math.min(1, (ratio - 0.4) / 0.8));
  const ahead = p.recentDelta;

  return (
    <>
      <div className="grid cols-2">
        <Section title="Obiettivi" note={recentWord}>
          <div className="card pad goals-card">
            <div className="goal-row">
              <div className="goal-head">
                <span>Studiato</span>
                <b className="tnum">
                  {fmtHours(p.recentStudied)} <small>di {fmtHours(p.recentGoal)}</small>
                </b>
              </div>
              <span className="progress lg">
                <i style={{ width: `${Math.min(1, p.recentProgress) * 100}%`, background: ahead >= 0 ? 'var(--green)' : 'var(--orange)' }} />
              </span>
              <span className="goal-foot tnum" data-tone={ahead >= 0 ? 'good' : 'bad'}>
                {p.recentGoal ? `${pct(p.recentProgress)} · ` : ''}
                {ahead >= 0 ? `${fmtDur(ahead)} sopra l’obiettivo` : `${fmtDur(-ahead)} sotto l’obiettivo, circa ${fmtDur(-ahead / weeks)} a settimana`}
              </span>
            </div>
            <div className="goal-row">
              <div className="goal-head">
                <span>Tutto il periodo</span>
                <b className="tnum">
                  {fmtHours(p.studied)} <small>di {fmtHours(p.goalTotal)}</small>
                </b>
              </div>
              <span className="progress-pair">
                <span className="progress lg" title="Studio fatto">
                  <i style={{ width: `${Math.min(1, p.totalProgress) * 100}%`, background: 'var(--accent)' }} />
                </span>
                <span className="progress lg" title="Tempo trascorso">
                  <i style={{ width: `${Math.min(1, p.timeProgress) * 100}%`, background: 'var(--label-3)' }} />
                </span>
              </span>
              <span className="goal-foot tnum">
                <span className="key" style={{ ['--c' as string]: 'var(--accent)' }}>
                  studio {pct(p.totalProgress)}
                </span>
                <span className="key" style={{ ['--c' as string]: 'var(--label-3)' }}>
                  tempo {pct(p.timeProgress)}
                </span>
                <span>
                  {fmtDay(p.start)} – {fmtDay(addDays(p.end, -1))}
                </span>
              </span>
            </div>
          </div>
        </Section>
        <Section title="Ritmo" note="ore al giorno">
          <div className="card pad pace-card" data-tone={tone}>
            <div className="pace-numbers">
              <div>
                <span className="pace-label">Il tuo ritmo</span>
                <b className="tnum">{fmtDur(p.currentPace)}</b>
                <small>media, {recentWord}</small>
              </div>
              <div>
                <span className="pace-label">Ritmo previsto</span>
                <b className="tnum">{p.plannedPace ? fmtDur(p.plannedPace) : '–'}</b>
                <small>{p.plannedPace ? 'dai tuoi obiettivi giornalieri' : 'nessun obiettivo impostato'}</small>
              </div>
            </div>
            <div className="pace-gauge" aria-label={`Ritmo al ${pct(ratio)} del previsto`}>
              <span className="pace-scale">
                <i style={{ left: `${mark * 100}%` }} />
              </span>
              <span className="pace-ticks tnum">
                <span style={{ left: '0%' }}>40%</span>
                <span style={{ left: '50%' }}>80%</span>
                <span style={{ left: '75%' }}>100%</span>
                <span style={{ left: '100%' }}>120%</span>
              </span>
            </div>
            <p className="pace-text">
              {p.plannedPace === 0
                ? 'Imposta gli obiettivi giornalieri per confrontare il ritmo.'
                : ratio >= 1
                  ? `Sei al ${pct(ratio)} del ritmo previsto: continua così.`
                  : `Sei al ${pct(ratio)} del ritmo previsto: mancano ${fmtDur(p.plannedPace - p.currentPace)} al giorno.`}
            </p>
          </div>
        </Section>
      </div>

      <Section title="Andamento" note="ore studiate meno obiettivo, cumulato sulle ultime 12 settimane">
        <div className="card pad">
          <TrendChart series={trend} />
        </div>
      </Section>

      <FocusInsights data={data} />

      <Section
        title="Distribuzione"
        accessory={<Seg<Range> size="sm" label="Intervallo" value={range} onChange={setRange} options={(['today', 'week', 'month', 'period'] as Range[]).map((id) => ({ id, label: RANGE_LABEL[id] }))} />}
      >
        <div className="grid cols-main">
          <div className="card table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Esame</th>
                  <th className="num">{RANGE_LABEL[range]}</th>
                  <th className="num">Totale</th>
                  <th className="num">Obiettivo</th>
                  <th className="col-progress">Avanzamento</th>
                </tr>
              </thead>
              <tbody>
                {examRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="secondary">
                      Nessun esame in corso.
                    </td>
                  </tr>
                ) : (
                  examRows.map(({ s, inRange, total, goal }) => (
                    <tr key={s.id}>
                      <td>
                        <span className="tag">
                          <span className="dot" style={{ background: s.color }} />
                          {s.name}
                        </span>
                      </td>
                      <td className="num tnum">{inRange ? fmtDur(inRange) : '–'}</td>
                      <td className="num tnum">{fmtHours(total)}</td>
                      <td className="num tnum secondary">{goal ? fmtHours(goal) : '–'}</td>
                      <td className="col-progress">
                        {goal ? (
                          <span className="progress-cell tnum">
                            <span className="progress">
                              <i style={{ width: `${Math.min(1, total / goal) * 100}%`, background: s.color }} />
                            </span>
                            {pct(total / goal)}
                          </span>
                        ) : (
                          <span className="secondary">–</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>Totale</td>
                  <td className="num tnum">{fmtDur(rangeTotal)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="card pad donut-card">
            <h3 className="card-title">Attività</h3>
            {acts.length === 0 ? (
              <Empty text="Nessuna sessione in questo intervallo" />
            ) : (
              <div className="donut-wrap">
                <Donut rows={acts} label={RANGE_LABEL[range].toLowerCase()} />
                <ul className="legend-list">
                  {acts.map((a) => (
                    <li key={String(a.id)}>
                      <span className="dot" style={{ background: a.color }} />
                      <span className="legend-name">{a.name}</span>
                      <span className="tnum secondary">{pct(a.sec / actsTotal)}</span>
                      <b className="tnum">{fmtDur(a.sec)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
