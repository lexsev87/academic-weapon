import { useState } from 'react';
import { Columns, Donut, Empty } from '../../components/Charts';
import { IconChevron, IconEdit, IconPlay } from '../../components/Icons';
import { PageHeader, Section } from '../../components/UI';
import { byActivity, subjectInsights } from '../../lib/insights';
import { navigate } from '../../lib/router';
import { addDays, dayKey, fmtDate, fmtDur, fmtHours, fmtTime, startOfDay } from '../../lib/stats';
import { setTimer, type Session, type Subject, type UserData } from '../../lib/store';
import { FocusBars, SessionModal } from './Sessions';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** One exam up close: goal, pace, insights and its sessions day by day. */
export function ExamDetail({ data, s, onBack, onEdit }: { data: UserData; s: Subject; onBack: () => void; onEdit: () => void }) {
  const [editing, setEditing] = useState<Session | null>(null);
  const now = new Date();
  const ins = subjectInsights(data, s, now);
  const today0 = startOfDay(now);
  const byDay = new Map<string, number>();
  for (const x of ins.sessions) byDay.set(dayKey(x.start), (byDay.get(dayKey(x.start)) ?? 0) + x.dur);
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = addDays(today0, i - 29);
    return { label: String(d.getDate()), tip: d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }), sec: byDay.get(dayKey(d)) ?? 0 };
  });
  const acts = byActivity(ins.sessions, data.activities, 0, Infinity);
  const groups = new Map<string, Session[]>();
  for (const x of [...ins.sessions].sort((a, b) => b.start - a.start)) groups.set(dayKey(x.start), [...(groups.get(dayKey(x.start)) ?? []), x]);
  const sem = data.semesters.find((x) => x.id === s.semesterId);
  const ratio = ins.paceRatio;
  const tone = ins.necessaryPace === 0 || (ratio !== null && ratio >= 1) ? 'good' : ratio !== null && ratio >= 0.8 ? 'warn' : 'bad';

  const startFocus = () => {
    setTimer({ subjectId: s.id });
    navigate('/focus');
  };

  const subtitle = [
    sem?.name,
    s.examDate ? `appello ${fmtDate(new Date(`${s.examDate}T00:00`), { day: 'numeric', month: 'long', year: 'numeric' })}` : 'nessun appello fissato',
    ins.daysLeft !== null && s.status !== 'passed' ? (ins.daysLeft === 0 ? 'oggi' : `tra ${ins.daysLeft} giorni`) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <button className="back-link" onClick={onBack}>
        <IconChevron style={{ transform: 'rotate(180deg)' }} /> Esami
      </button>
      <PageHeader
        title={
          <span className="exam-title">
            <span className="dot lg" style={{ background: s.color }} />
            {s.name}
          </span>
        }
        subtitle={subtitle}
      >
        <button className="btn" onClick={onEdit}>
          <IconEdit size={12} /> Modifica
        </button>
        {s.status !== 'passed' && (
          <button className="btn primary" onClick={startFocus}>
            <IconPlay size={12} /> Studia ora
          </button>
        )}
      </PageHeader>

      <div className="grid cols-2">
        <Section title="Obiettivo" note={ins.goal ? `${s.targetHours} h previste` : 'nessun obiettivo di ore'}>
          <div className="card pad goals-card">
            <div className="goal-row">
              <div className="goal-head">
                <span>Studiato</span>
                <b className="tnum">
                  {fmtHours(ins.studied)} {ins.goal ? <small>di {fmtHours(ins.goal)}</small> : null}
                </b>
              </div>
              {ins.progress !== null && (
                <span className="progress lg">
                  <i style={{ width: `${Math.min(1, ins.progress) * 100}%`, background: s.color }} />
                </span>
              )}
              <span className="goal-foot tnum">
                {ins.progress !== null && <span>{pct(ins.progress)}</span>}
                <span>oggi {fmtDur(ins.today)}</span>
                <span>settimana {fmtDur(ins.week)}</span>
                <span>mese {fmtDur(ins.month)}</span>
              </span>
            </div>
          </div>
        </Section>
        <Section title="Ritmo" note="al giorno">
          <div className="card pad pace-card" data-tone={tone}>
            <div className="pace-numbers">
              <div>
                <span className="pace-label">Attuale</span>
                <b className="tnum">{fmtDur(ins.currentPace)}</b>
                <small>da {ins.start.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</small>
              </div>
              <div>
                <span className="pace-label">Necessario</span>
                <b className="tnum">{ins.necessaryPace === null ? '–' : ins.necessaryPace === 0 ? 'Fatto' : fmtDur(ins.necessaryPace)}</b>
                <small>{ins.necessaryPace === null ? 'servono ore previste e appello' : 'fino all’appello'}</small>
              </div>
            </div>
            {ratio !== null && ins.necessaryPace !== 0 && (
              <p className="pace-text">
                {ratio >= 1 ? `Sei al ${pct(ratio)} del ritmo necessario: in linea per l’appello.` : `Sei al ${pct(ratio)} del ritmo necessario: aumenta lo studio di questo esame.`}
              </p>
            )}
          </div>
        </Section>
      </div>

      <div className="insight-tiles" style={{ ['--n' as string]: 5 }}>
        {[
          { label: 'Sessioni', value: String(ins.sessions.length), note: ins.sessions.length ? `media ${fmtDur(ins.avgSession)}` : '–' },
          { label: 'Giorni attivi', value: String(ins.activeDays), note: `su ${ins.daysSoFar} giorni` },
          { label: 'Media giorno attivo', value: fmtDur(ins.avgActive), note: 'quando lo studi' },
          { label: 'Media giornaliera', value: fmtDur(ins.avgAll), note: 'su tutti i giorni' },
          { label: 'Giorni rimasti', value: ins.daysLeft === null ? '–' : String(ins.daysLeft), note: s.examDate ? 'all’appello' : 'nessuna data' },
        ].map((t) => (
          <div className="card insight-tile" key={t.label}>
            <span className="insight-label">{t.label}</span>
            <b className="tnum">{t.value}</b>
            <small>{t.note}</small>
          </div>
        ))}
      </div>

      <div className="grid cols-main">
        <Section title="Ultimi 30 giorni">
          <div className="card pad">
            <Columns data={last30} labelEvery={5} />
          </div>
        </Section>
        <Section title="Attività">
          <div className="card pad donut-card">
            {acts.length === 0 ? (
              <Empty text="Nessuna sessione" />
            ) : (
              <div className="donut-wrap">
                <Donut rows={acts} size={130} stroke={18} label="in totale" />
                <ul className="legend-list">
                  {acts.map((a) => (
                    <li key={String(a.id)}>
                      <span className="dot" style={{ background: a.color }} />
                      <span className="legend-name">{a.name}</span>
                      <span className="tnum secondary">{pct(a.sec / Math.max(1, ins.studied))}</span>
                      <b className="tnum">{fmtDur(a.sec)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      </div>

      <Section title="Sessioni" note={`${ins.sessions.length} in totale`}>
        {groups.size === 0 ? (
          <div className="card">
            <Empty text="Ancora nessuna sessione per questo esame." />
          </div>
        ) : (
          <div className="day-groups">
            {[...groups.entries()].map(([k, list]) => (
              <div className="card list" key={k}>
                <div className="day-group-head">
                  <span>{fmtDate(new Date(`${k}T00:00`), { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                  <b className="tnum">{fmtDur(list.reduce((a, x) => a + x.dur, 0))}</b>
                </div>
                {list.map((x) => {
                  const act = data.activities.find((a) => a.id === x.activityId);
                  return (
                    <button className="list-row pressable" key={x.id} onClick={() => setEditing(x)}>
                      <span className="tnum secondary nowrap">
                        {fmtTime(x.start)}–{fmtTime(x.start + (x.dur + x.breakSec) * 1000)}
                      </span>
                      <div className="list-text">
                        <span className="list-title">{x.note || 'Senza nota'}</span>
                        {act && <span className="list-sub">{act.name}</span>}
                      </div>
                      {x.focus > 0 && <FocusBars n={x.focus} />}
                      <span className="list-value tnum">{fmtDur(x.dur)}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </Section>
      {editing && <SessionModal data={data} session={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
