import { useState } from 'react';
import { Columns, Donut, Empty, MiniRing, Ring, TrendChart } from '../../components/Charts';
import { IconCalendar, IconCap, IconChevron, IconPlay, IconTimer } from '../../components/Icons';
import { StatLine } from '../../components/StatLine';
import { Metric, PageHeader, Section, Seg } from '../../components/UI';
import { byActivity, periodSummary, trackingPeriod, trendSeries } from '../../lib/insights';
import { readStore, writeStore } from '../../lib/platform';
import { Link } from '../../lib/router';
import { NO_SUBJECT_COLOR, type UserData } from '../../lib/store';
import {
  addDays,
  career,
  dayKey,
  daysUntil,
  fmtAvg,
  fmtDate,
  fmtDur,
  fmtHours,
  fmtNum,
  fmtTime,
  blocksDone,
  blocksFor,
  fmtBlocks,
  goalFor,
  plannedFor,
  pacePerDay,
  parseDayKey,
  partsByDay,
  startOfDay,
  startOfWeek,
  sumRange,
  totalsByDay,
  totalsBySubject,
} from '../../lib/stats';

type Range = 'today' | 'week' | 'month' | 'period';
const RANGE_LABEL: Record<Range, string> = { today: 'Oggi', week: 'Settimana', month: 'Mese', period: 'Periodo' };
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function Dashboard({ data, name }: { data: UserData; name: string }) {
  const { sessions, settings, subjects } = data;
  const [range, setRangeState] = useState<Range>(() => (readStore('aw:home-range') as Range) || 'week');
  const setRange = (r: Range) => {
    setRangeState(r);
    writeStore('aw:home-range', r);
  };
  const now = new Date();
  const today0 = startOfDay(now);
  const byDay = totalsByDay(sessions);
  const parts = partsByDay(sessions, subjects);
  const today = byDay.get(dayKey(now)) ?? 0;
  const goal = goalFor(settings, now);
  const left = Math.max(0, goal - today);
  const done = goal > 0 && today >= goal;
  const pomosLeft = Math.ceil(left / (settings.focusMin * 60));
  const blocks = settings.goalInBlocks;
  const bTot = blocksFor(settings, now);
  const bDone = blocksDone(settings, today);
  const blockWord = (n: number) => (Math.round(n) === 1 ? 'blocco' : 'blocchi');
  const wk0 = startOfWeek(now, settings.weekStart);
  const week = sumRange(sessions, wk0.getTime(), Date.now() + 1);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(wk0, i));
  const weekGoal = weekDays.reduce((a, d) => a + goalFor(settings, d), 0);
  const c = career(subjects, settings);
  const hour = now.getHours();
  const hello = hour < 5 ? 'Ancora sveglio' : hour < 13 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const pomosToday = sessions.filter((s) => s.start >= today0.getTime() && s.kind === 'pomodoro').length;
  const month0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const month = sumRange(sessions, month0, Date.now() + 1);

  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today0, i - 13);
    const k = dayKey(d);
    return {
      label: d.toLocaleDateString('it-IT', { weekday: 'narrow' }),
      tip: d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }),
      sec: byDay.get(k) ?? 0,
      parts: parts(k),
      goal: goalFor(settings, d),
    };
  });
  const period = periodSummary(data, now);
  const tp = trackingPeriod(settings, now);
  const trendEnd = addDays(today0, 1) < tp.end ? addDays(today0, 1) : tp.end;
  const trend = trendSeries(data, tp.start, trendEnd);
  const ahead = period.studied - period.goalToDate;
  const rFrom = range === 'today' ? today0 : range === 'week' ? wk0 : range === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : tp.start;
  const rTo = range === 'period' ? tp.end : addDays(today0, 1);
  const acts = byActivity(sessions, data.activities, rFrom.getTime(), rTo.getTime());
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
  const paceRatio = Number.isFinite(period.paceRatio) ? period.paceRatio : 1.2;
  const paceTone = period.necessaryPace === 0 ? 'good' : paceRatio >= 1 ? 'good' : paceRatio >= 0.8 ? 'warn' : 'bad';
  const paceMark = Math.max(0, Math.min(1, (paceRatio - 0.4) / 0.8));
  const fmtDay = (d: Date) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  const hours = totalsBySubject(sessions);
  const exams = subjects
    .filter((s) => s.status !== 'passed' && s.examDate && (daysUntil(s.examDate) ?? -1) >= 0)
    .sort((a, b) => a.examDate.localeCompare(b.examDate));
  const next = exams[0];
  const recent = [...sessions].reverse().slice(0, 6);

  let headline: string;
  let detail: string;
  const blockInfo = `${fmtBlocks(bTot)} × ${settings.focusMin} min di studio + ${settings.shortMin} di pausa`;
  if (goal === 0) {
    headline = 'Oggi è giorno libero';
    detail = today ? `Hai comunque studiato ${fmtDur(today)}: bonus!` : 'Nessun obiettivo per oggi. Ricarica le batterie.';
  } else if (done) {
    headline = 'Obiettivo di oggi raggiunto';
    detail = blocks
      ? `${fmtBlocks(bDone)} ${blockWord(bDone)} su ${fmtBlocks(bTot)} · ${fmtDur(today)} di studio. Ogni blocco in più è un vantaggio.`
      : `${fmtDur(today)} su ${fmtDur(goal)}. Ogni minuto in più è un vantaggio.`;
  } else if (today === 0) {
    headline = blocks ? `Oggi ti aspettano ${fmtBlocks(bTot)} ${blockWord(bTot)}` : `Oggi devi studiare ${fmtDur(goal)}`;
    detail = blocks ? `${blockInfo} = ${fmtDur(plannedFor(settings, now))}.` : `Circa ${pomosLeft} ${pomosLeft === 1 ? 'pomodoro' : 'pomodori'} da ${settings.focusMin} minuti.`;
  } else if (blocks) {
    const leftB = bTot - bDone;
    headline = leftB < 1 ? `Ancora ${fmtDur(left)} di studio` : `Ancora ${fmtBlocks(leftB)} ${blockWord(leftB)}`;
    detail = `Fatti ${fmtBlocks(bDone)} su ${fmtBlocks(bTot)} · ${fmtDur(today)} di studio, ne mancano ${fmtDur(left)}.`;
  } else {
    headline = `Ancora ${fmtDur(left)} di studio`;
    detail = `Fatte ${fmtDur(today)} su ${fmtDur(goal)} · circa ${pomosLeft} ${pomosLeft === 1 ? 'pomodoro' : 'pomodori'} da ${settings.focusMin} minuti.`;
  }

  const weekBlocksDone = blocksDone(settings, week);
  const weekBlocksGoal = weekDays.reduce((a, d) => a + blocksFor(settings, d), 0);
  const ringPct = goal ? today / goal : today ? 1 : 0;

  return (
    <>
      <PageHeader eyebrow={fmtDate(now)} title={`${hello}, ${name}`} subtitle={<StatLine data={data} />} />

      <section className={`card today-card ${done ? 'is-done' : ''}`} aria-label="Obiettivo di oggi">
        <div className="today-main">
          <Ring pct={ringPct} size={132} stroke={14} color={done ? 'var(--green)' : 'var(--accent)'}>
            <span className="today-ring-value tnum">{blocks && goal ? fmtBlocks(bDone) : goal ? `${Math.round(ringPct * 100)}%` : fmtDur(today, true)}</span>
            <span className="today-ring-unit">{blocks && goal ? `di ${fmtBlocks(bTot)} blocchi` : goal ? `di ${fmtDur(goal, true)}` : 'oggi'}</span>
          </Ring>
          <div className="today-text">
            <p className="today-kicker">Obiettivo di oggi</p>
            <h2 className="today-headline">{headline}</h2>
            <p className="today-detail">{detail}</p>
            <div className="today-actions">
              <Link href="/focus" className="btn primary">
                <IconPlay size={12} /> {data.timer.running ? 'Torna al timer' : 'Avvia un pomodoro'}
              </Link>
              {next && (
                <Link href="/esami" className="chip">
                  <span className="dot" style={{ background: next.color }} />
                  {next.name} · {daysUntil(next.examDate) === 0 ? 'oggi' : `tra ${daysUntil(next.examDate)} giorni`}
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="week" aria-label="Questa settimana">
          {weekDays.map((d) => {
            const k = dayKey(d);
            const sec = byDay.get(k) ?? 0;
            const g = goalFor(settings, d);
            const isToday = k === dayKey(now);
            const ok = g > 0 && sec >= g;
            return (
              <div key={k} className="week-day" data-today={isToday || undefined} data-future={d > now || undefined}>
                <span className="week-name">{d.toLocaleDateString('it-IT', { weekday: 'short' })}</span>
                <span className="week-ring">
                  <MiniRing pct={g ? sec / g : sec ? 1 : 0} color={ok ? 'var(--green)' : 'var(--accent)'} size={36} stroke={5} />
                </span>
                <span className="week-value tnum">{g ? (blocks ? `${fmtBlocks(blocksDone(settings, sec))}/${fmtBlocks(blocksFor(settings, d))}` : fmtDur(sec, true)) : 'libero'}</span>
              </div>
            );
          })}
          <div className="week-total">
            <span className="week-total-value tnum">{blocks ? `${fmtBlocks(weekBlocksDone)}/${fmtBlocks(weekBlocksGoal)}` : fmtDur(week, true)}</span>
            <span className="week-total-label">{blocks ? 'blocchi in settimana' : `di ${fmtDur(weekGoal, true)} in settimana`}</span>
          </div>
        </div>
      </section>

      <div className="grid cols-2">
        <Section title="Obiettivi" note={`${fmtDay(period.start)} – ${fmtDay(addDays(period.end, -1))}`}>
          <div className="card pad goals-card">
            <div className="goal-row">
              <div className="goal-head">
                <span>Obiettivo a oggi</span>
                <b className="tnum">
                  {fmtHours(period.studied)} <small>di {fmtHours(period.goalToDate)}</small>
                </b>
              </div>
              <span className="progress lg">
                <i style={{ width: `${Math.min(1, period.studyProgress) * 100}%`, background: ahead >= 0 ? 'var(--green)' : 'var(--orange)' }} />
              </span>
              <span className="goal-foot tnum" data-tone={ahead >= 0 ? 'good' : 'bad'}>
                {pct(period.studyProgress)} · {ahead >= 0 ? `in vantaggio di ${fmtDur(ahead)}` : `in ritardo di ${fmtDur(-ahead)}`}
              </span>
            </div>
            <div className="goal-row">
              <div className="goal-head">
                <span>Obiettivo totale</span>
                <b className="tnum">
                  {fmtHours(period.studied)} <small>di {fmtHours(period.goalTotal)}</small>
                </b>
              </div>
              <span className="progress-pair">
                <span className="progress lg" title="Studio fatto">
                  <i style={{ width: `${Math.min(1, period.totalProgress) * 100}%`, background: 'var(--accent)' }} />
                </span>
                <span className="progress lg" title="Tempo trascorso">
                  <i style={{ width: `${Math.min(1, period.timeProgress) * 100}%`, background: 'var(--label-3)' }} />
                </span>
              </span>
              <span className="goal-foot tnum">
                <span className="key" style={{ ['--c' as string]: 'var(--accent)' }}>studio {pct(period.totalProgress)}</span>
                <span className="key" style={{ ['--c' as string]: 'var(--label-3)' }}>tempo {pct(period.timeProgress)}</span>
                <span>{period.daysLeft} giorni rimasti</span>
              </span>
            </div>
          </div>
        </Section>
        <Section title="Ritmo" note="ore al giorno">
          <div className="card pad pace-card" data-tone={paceTone}>
            <div className="pace-numbers">
              <div>
                <span className="pace-label">Ritmo attuale</span>
                <b className="tnum">{fmtDur(period.currentPace)}</b>
                <small>media dal {period.start.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</small>
              </div>
              <div>
                <span className="pace-label">Ritmo necessario</span>
                <b className="tnum">{period.necessaryPace ? fmtDur(period.necessaryPace) : '–'}</b>
                <small>{period.necessaryPace ? 'per chiudere l’obiettivo' : 'obiettivo raggiunto'}</small>
              </div>
            </div>
            <div className="pace-gauge" aria-label={`Ritmo al ${pct(paceRatio)} del necessario`}>
              <span className="pace-scale">
                <i style={{ left: `${paceMark * 100}%` }} />
              </span>
              <span className="pace-ticks tnum">
                <span style={{ left: '0%' }}>40%</span>
                <span style={{ left: '50%' }}>80%</span>
                <span style={{ left: '75%' }}>100%</span>
                <span style={{ left: '100%' }}>120%</span>
              </span>
            </div>
            <p className="pace-text">
              {period.necessaryPace === 0
                ? 'Hai già raggiunto l’obiettivo del periodo.'
                : paceRatio >= 1
                  ? `Stai andando al ${pct(paceRatio)} del ritmo necessario: continua così.`
                  : `Sei al ${pct(paceRatio)} del ritmo necessario: servono ${fmtDur(period.necessaryPace - period.currentPace)} in più al giorno.`}
            </p>
          </div>
        </Section>
      </div>

      <Section title="Andamento" note="ore studiate meno obiettivo, cumulato sul periodo">
        <div className="card pad">
          <TrendChart series={trend} />
        </div>
      </Section>

      <div className="grid cols-4">
        <Metric color="var(--red)" icon={<IconTimer size={13} />} label="Pomodori oggi" value={String(pomosToday)} note={`da ${settings.focusMin} + ${settings.shortMin} min`} />
        <Metric color="var(--orange)" icon={<IconCalendar size={12} />} label="Questo mese" value={fmtHours(month)} note={now.toLocaleDateString('it-IT', { month: 'long' })} />
        <Metric
          href="/esami"
          color="var(--green)"
          icon={<IconCap size={13} />}
          label={settings.gradeScale === 'none' ? 'Esami superati' : settings.creditLabel ? 'Media ponderata' : 'Media'}
          value={settings.gradeScale === 'none' ? String(c.passed) : fmtAvg(settings.creditLabel ? c.weighted : c.avg)}
          note={settings.creditLabel ? `${c.cfuDone}${settings.degreeCfu ? ` di ${settings.degreeCfu}` : ''} ${settings.creditLabel}` : `${c.passed} di ${subjects.length} esami`}
        />
        <Metric
          href="/esami"
          color="var(--purple)"
          icon={<IconCalendar size={12} />}
          label="Prossimo appello"
          value={next ? (daysUntil(next.examDate) === 0 ? 'Oggi' : `${daysUntil(next.examDate)} giorni`) : '–'}
          note={next ? next.name : 'Nessuna data fissata'}
        />
      </div>

      <div className="grid cols-main">
        <Section title="Ultimi 14 giorni" note="colori = esami · trattino = obiettivo">
          <div className="card pad">
            <Columns data={last14} />
          </div>
        </Section>
        <Section title="Appelli in arrivo">
          <div className="card list">
            {exams.length === 0 ? (
              <p className="list-empty">
                Nessun appello in calendario. Aggiungi le date in{' '}
                <Link href="/esami" className="link">
                  Esami
                </Link>
                .
              </p>
            ) : (
              exams.slice(0, 5).map((s) => {
                const d = daysUntil(s.examDate)!;
                const sec = hours.get(s.id) ?? 0;
                const pace = pacePerDay(s, sec);
                return (
                  <div className="list-row" key={s.id}>
                    <span className="date-tile" style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 14%, transparent)` }}>
                      <small>{parseDayKey(s.examDate).toLocaleDateString('it-IT', { month: 'short' })}</small>
                      {parseDayKey(s.examDate).getDate()}
                    </span>
                    <div className="list-text">
                      <span className="list-title">{s.name}</span>
                      <span className="list-sub">
                        {fmtHours(sec)} studiate{s.targetHours ? ` su ${s.targetHours} h` : ''}
                        {pace ? ` · ≈ ${fmtNum(pace / 3600, 1)} h al giorno` : ''}
                      </span>
                    </div>
                    <span className="badge" data-tone={d <= 7 ? 'warn' : undefined}>
                      {d === 0 ? 'Oggi' : d === 1 ? 'Domani' : `${d} gg`}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </Section>
      </div>

      <Section title="Distribuzione" accessory={<Seg<Range> size="sm" label="Intervallo" value={range} onChange={setRange} options={(['today', 'week', 'month', 'period'] as Range[]).map((id) => ({ id, label: RANGE_LABEL[id] }))} />}>
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
                      <span className="tnum secondary">{pct(a.sec / Math.max(1, acts.reduce((x, y) => x + y.sec, 0)))}</span>
                      <b className="tnum">{fmtDur(a.sec)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </Section>

      <div className="grid">
        <Section
          title="Sessioni recenti"
          accessory={
            <Link href="/calendario" className="link">
              Calendario <IconChevron size={10} />
            </Link>
          }
        >
          <div className="card list">
            {recent.length === 0 ? (
              <Empty text="Ancora nessuna sessione. Avvia un pomodoro per iniziare." />
            ) : (
              recent.map((s) => {
                const sub = subjects.find((x) => x.id === s.subjectId);
                return (
                  <div className="list-row" key={s.id}>
                    <span className="dot" style={{ background: sub?.color ?? NO_SUBJECT_COLOR }} />
                    <div className="list-text">
                      <span className="list-title">{sub?.name ?? 'Senza esame'}</span>
                      <span className="list-sub">
                        {fmtDate(s.start, { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtTime(s.start)}
                        {s.note ? ` · ${s.note}` : ''}
                      </span>
                    </div>
                    <span className="list-value tnum">{fmtDur(s.dur)}</span>
                  </div>
                );
              })
            )}
          </div>
        </Section>
      </div>
    </>
  );
}
