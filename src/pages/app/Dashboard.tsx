import { Columns, Empty, HBars, MiniRing, Ring } from '../../components/Charts';
import { IconCalendar, IconCap, IconChevron, IconPlay, IconTimer } from '../../components/Icons';
import { Metric, PageHeader, Section } from '../../components/UI';
import { Link } from '../../lib/router';
import { NO_SUBJECT_COLOR, type UserData } from '../../lib/store';
import {
  addDays,
  bySubject,
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

export function Dashboard({ data, name }: { data: UserData; name: string }) {
  const { sessions, settings, subjects } = data;
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
  const subj = bySubject(sessions, subjects, wk0.getTime(), Date.now() + 1);
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
      <PageHeader eyebrow={fmtDate(now)} title={`${hello}, ${name}`} />

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

      <div className="grid cols-2">
        <Section title="Esami" note="questa settimana">
          <div className="card pad">
            <HBars rows={subj} />
          </div>
        </Section>
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
