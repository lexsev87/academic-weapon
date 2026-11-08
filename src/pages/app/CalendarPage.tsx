import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { Columns } from '../../components/Charts';
import { IconChevron, IconDownload, IconPlus } from '../../components/Icons';
import { PageHeader, Seg, SubjectSelect, toast } from '../../components/UI';
import { NO_SUBJECT_COLOR, type Session, type Subject, type UserData } from '../../lib/store';
import { rangeInsights } from '../../lib/insights';
import { addDays, dayKey, fmtDur, fmtTime, goalFor, partsByDay, startOfDay, startOfWeek, totalsByDay } from '../../lib/stats';
import { readStore, writeStore } from '../../lib/platform';
import { exportCsv, FocusBars, SessionList, SessionModal } from './Sessions';

type View = 'day' | 'week' | 'month' | 'list';
const HOUR = 52; // px per hour in the time grid
const MIN_DAY = 86400000;

export function CalendarPage({ data }: { data: UserData; name: string }) {
  const [view, setView] = useState<View>(() => (readStore('aw:calview') as View) || 'week');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [filter, setFilter] = useState('__all');
  const [editing, setEditing] = useState<{ session: Session | null; start?: number } | null>(null);
  const ws = data.settings.weekStart;

  useEffect(() => writeStore('aw:calview', view), [view]);

  const sessions = data.sessions.filter((s) => filter === '__all' || (filter === '' ? !s.subjectId : s.subjectId === filter));
  const subjectOf = (s: Session) => data.subjects.find((x) => x.id === s.subjectId);
  const step = (dir: number) => {
    if (view === 'day') setCursor(addDays(cursor, dir));
    else if (view === 'week') setCursor(addDays(cursor, 7 * dir));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
  };
  const openNew = (start?: number) => {
    if (start && start > Date.now()) return toast('Puoi registrare solo sessioni già fatte');
    setEditing({ session: null, start });
  };

  const month = cursor.toLocaleDateString('it-IT', { month: 'long' });
  const days = view === 'day' ? [cursor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor, ws), i));
  const title =
    view === 'day' ? (
      <>
        <b>{cursor.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}</b> {cursor.getFullYear()}
      </>
    ) : (
      <>
        <b>{month}</b> {cursor.getFullYear()}
      </>
    );

  return (
    <div className="calendar">
      <PageHeader title={<span className="cal-title">{title}</span>} subtitle={view === 'day' ? cursor.toLocaleDateString('it-IT', { weekday: 'long' }) : undefined}>
        {view !== 'list' && (
          <div className="cal-nav">
            <button className="btn icon" aria-label="Precedente" onClick={() => step(-1)}>
              <IconChevron style={{ transform: 'rotate(180deg)' }} />
            </button>
            <button className="btn" onClick={() => setCursor(startOfDay(new Date()))}>
              Oggi
            </button>
            <button className="btn icon" aria-label="Successivo" onClick={() => step(1)}>
              <IconChevron />
            </button>
          </div>
        )}
        <Seg<View>
          label="Vista"
          value={view}
          onChange={setView}
          options={[
            { id: 'day', label: 'Giorno' },
            { id: 'week', label: 'Settimana' },
            { id: 'month', label: 'Mese' },
            { id: 'list', label: 'Elenco' },
          ]}
        />
      </PageHeader>
      <div className="cal-bar">
        <div className="cal-filter">
          <SubjectSelect data={data} value={filter} onChange={setFilter} allowAll />
        </div>
        <div className="cal-bar-actions">
          <button className="btn" onClick={() => exportCsv(data)} disabled={!data.sessions.length}>
            <IconDownload size={12} /> Esporta CSV
          </button>
          <button className="btn primary" onClick={() => openNew()}>
            <IconPlus size={12} /> Sessione
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <SessionList data={{ ...data, sessions }} filter="__all" onEdit={(s) => (s === 'new' ? openNew() : setEditing({ session: s }))} />
      ) : view === 'month' ? (
        <MonthGrid
          data={data}
          cursor={cursor}
          sessions={sessions}
          subjectOf={subjectOf}
          onDay={(d) => {
            setCursor(d);
            setView('day');
          }}
        />
      ) : (
        <TimeGrid data={data} days={days} sessions={sessions} subjectOf={subjectOf} onEdit={(s) => setEditing({ session: s })} onNew={openNew} />
      )}

      {view !== 'list' && <RangePanel data={{ ...data, sessions }} view={view} cursor={cursor} />}

      {editing && <SessionModal data={data} session={editing.session} defaultStart={editing.start} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Insights for the day, week or month on screen, plus its days as stacked columns. */
function RangePanel({ data, view, cursor }: { data: UserData; view: Exclude<View, 'list'>; cursor: Date }) {
  const from = view === 'day' ? cursor : view === 'week' ? startOfWeek(cursor, data.settings.weekStart) : new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const to = view === 'day' ? addDays(from, 1) : view === 'week' ? addDays(from, 7) : new Date(from.getFullYear(), from.getMonth() + 1, 1);
  const r = rangeInsights(data, from, to);
  const byDay = totalsByDay(data.sessions);
  const parts = partsByDay(data.sessions, data.subjects);
  const days: Date[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
  const word = view === 'day' ? 'del giorno' : view === 'week' ? 'della settimana' : 'del mese';
  const tiles = [
    { label: 'Studiato', value: fmtDur(r.studied), note: r.goal ? `di ${fmtDur(r.goal)} · ${Math.round((r.studied / r.goal) * 100)}%` : 'nessun obiettivo' },
    { label: 'Sessioni', value: String(r.sessions), note: r.sessions ? `media ${fmtDur(r.studied / r.sessions)}` : '–' },
    ...(view === 'day'
      ? []
      : [
          { label: 'Giorni attivi', value: `${r.activeDays}`, note: `su ${r.days} ${r.days === 1 ? 'giorno' : 'giorni'} trascorsi` },
          { label: 'Obiettivo centrato', value: `${r.goalMet}`, note: r.goalMet === 1 ? 'giorno' : 'giorni' },
          { label: 'Media', value: fmtDur(r.avgActive), note: `per giorno attivo · ${fmtDur(r.avgAll)} su tutti` },
        ]),
    { label: 'Appelli', value: String(r.exams), note: r.exams === 1 ? 'esame in calendario' : 'esami in calendario' },
  ];
  return (
    <section className="section cal-insights" aria-label={`Riepilogo ${word}`}>
      <div className="section-head">
        <h2 className="section-title">Riepilogo {word}</h2>
      </div>
      <div className="insight-tiles" style={{ ["--n" as string]: tiles.length }}>
        {tiles.map((t) => (
          <div className="card insight-tile" key={t.label}>
            <span className="insight-label">{t.label}</span>
            <b className="tnum">{t.value}</b>
            <small>{t.note}</small>
          </div>
        ))}
      </div>
      {view !== 'day' && (
        <div className="card pad">
          <Columns
            labelEvery={view === 'month' ? 3 : 1}
            data={days.map((d) => ({
              label: view === 'month' ? String(d.getDate()) : d.toLocaleDateString('it-IT', { weekday: 'short' }),
              tip: d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }),
              sec: byDay.get(dayKey(d)) ?? 0,
              parts: parts(dayKey(d)),
              goal: goalFor(data.settings, d),
            }))}
          />
        </div>
      )}
    </section>
  );
}

/** Exams with an appello on that day, shown as all-day events. */
const appelliOn = (subjects: Subject[], k: string) => subjects.filter((s) => s.examDate === k && s.status !== 'passed');

/* ---------- day / week ---------- */
function TimeGrid({
  data,
  days,
  sessions,
  subjectOf,
  onEdit,
  onNew,
}: {
  data: UserData;
  days: Date[];
  sessions: Session[];
  subjectOf: (s: Session) => Subject | undefined;
  onEdit: (s: Session) => void;
  onNew: (start: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());
  const todayKey = dayKey(now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Open the grid around the first event of the period (or 8:00).
  const firstKey = dayKey(days[0]);
  useLayoutEffect(() => {
    const from = days[0].getTime();
    const to = from + days.length * MIN_DAY;
    const hours = sessions.filter((s) => s.start >= from && s.start < to).map((s) => new Date(s.start).getHours());
    const h = Math.max(0, Math.min(8, ...hours) - 1);
    scroller.current?.scrollTo({ top: h * HOUR });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, days.length]);

  const clickSlot = (d: Date, e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.ev')) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const min = Math.floor((y / HOUR) * 4) * 15;
    onNew(d.getTime() + min * 60000);
  };

  return (
    <div className="tg card" style={{ ['--days' as string]: days.length }}>
      <div className="tg-head" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        <div />
        {days.map((d) => {
          const k = dayKey(d);
          const total = sessions.filter((s) => dayKey(s.start) === k).reduce((a, s) => a + s.dur, 0);
          return (
            <div key={k} className={`tg-day ${k === todayKey ? 'today' : ''}`}>
              <span className="wd">{d.toLocaleDateString('it-IT', { weekday: 'short' })}</span>
              <span className="num">{d.getDate()}</span>
              <span className="tot">{total ? fmtDur(total, true) : ''}</span>
            </div>
          );
        })}
      </div>
      <div className="tg-allday" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        <span className="tg-lbl">appelli</span>
        {days.map((d) => (
          <div key={dayKey(d)} className="tg-allday-cell">
            {appelliOn(data.subjects, dayKey(d)).map((s) => (
              <span key={s.id} className="ev-allday" style={{ background: s.color }}>
                Esame · {s.name}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="tg-body" ref={scroller}>
        <div className="tg-grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)`, height: HOUR * 24 }}>
          <div className="tg-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * HOUR }}>
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const k = dayKey(d);
            const list = layout(sessions.filter((s) => dayKey(s.start) === k));
            const isToday = k === todayKey;
            const nowMin = (now - d.getTime()) / 60000;
            return (
              <div key={k} className={`tg-col ${isToday ? 'today' : ''}`} onClick={(e) => clickSlot(d, e)}>
                {list.map(({ s, lane, lanes }) => {
                  const sub = subjectOf(s);
                  const color = sub?.color ?? NO_SUBJECT_COLOR;
                  const top = ((s.start - d.getTime()) / 60000 / 60) * HOUR;
                  const h = Math.max(18, (s.dur / 3600) * HOUR - 2);
                  return (
                    <button
                      key={s.id}
                      className={`ev ${h < 40 ? 'short' : ''}`}
                      style={{ top, height: h, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, ['--ev' as string]: color }}
                      onClick={() => onEdit(s)}
                      title={`${sub?.name ?? 'Senza esame'} · ${fmtTime(s.start)}–${fmtTime(s.start + s.dur * 1000)}${s.note ? `\n${s.note}` : ''}`}
                    >
                      <b>{sub?.name ?? 'Senza esame'}</b>
                      <span className="ev-time">
                        {fmtTime(s.start)} – {fmtTime(s.start + s.dur * 1000)}
                      </span>
                      {h > 58 && s.note && <span className="ev-note">{s.note}</span>}
                      {h > 76 && s.focus > 0 && <FocusBars n={s.focus} />}
                    </button>
                  );
                })}
                {isToday && nowMin >= 0 && nowMin < 1440 && <div className="now-line" style={{ top: (nowMin / 60) * HOUR }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Side-by-side lanes for overlapping sessions. */
function layout(list: Session[]) {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: { s: Session; lane: number; lanes: number }[] = [];
  let cluster: typeof out = [];
  let clusterEnd = 0;
  let laneEnds: number[] = [];
  const flush = () => {
    const n = laneEnds.length || 1;
    cluster.forEach((c) => (c.lanes = n));
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const s of sorted) {
    const end = s.start + s.dur * 1000;
    if (cluster.length && s.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= s.start);
    if (lane === -1) lane = laneEnds.push(end) - 1;
    else laneEnds[lane] = end;
    cluster.push({ s, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return out;
}

/* ---------- month ---------- */
function MonthGrid({
  data,
  cursor,
  sessions,
  subjectOf,
  onDay,
}: {
  data: UserData;
  cursor: Date;
  sessions: Session[];
  subjectOf: (s: Session) => Subject | undefined;
  onDay: (d: Date) => void;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first, data.settings.weekStart);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const todayKey = dayKey(new Date());
  const byDay = new Map<string, Session[]>();
  for (const s of sessions) {
    const k = dayKey(s.start);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(s);
  }
  return (
    <div className="mg card">
      <div className="mg-head">
        {cells.slice(0, 7).map((d) => (
          <span key={d.getDay()}>{d.toLocaleDateString('it-IT', { weekday: 'short' })}</span>
        ))}
      </div>
      <div className="mg-grid">
        {cells.map((d) => {
          const k = dayKey(d);
          const list = byDay.get(k) ?? [];
          const appelli = appelliOn(data.subjects, k);
          const total = list.reduce((a, s) => a + s.dur, 0);
          const other = d.getMonth() !== cursor.getMonth();
          const items = [...appelli.map((s) => ({ key: `a${s.id}`, all: true, color: s.color, text: `Esame · ${s.name}` }))].concat(
            list.map((s) => ({ key: s.id, all: false, color: subjectOf(s)?.color ?? NO_SUBJECT_COLOR, text: `${fmtTime(s.start)} ${subjectOf(s)?.name ?? 'Senza esame'}` })),
          );
          return (
            <button key={k} className={`mg-cell ${other ? 'other' : ''} ${k === todayKey ? 'today' : ''}`} onClick={() => onDay(d)}>
              <span className="mg-num">{d.getDate() === 1 ? d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : d.getDate()}</span>
              <div className="mg-items">
                {items.slice(0, 3).map((it) =>
                  it.all ? (
                    <span key={it.key} className="ev-allday" style={{ background: it.color }}>
                      {it.text}
                    </span>
                  ) : (
                    <span key={it.key} className="mg-ev">
                      <i style={{ background: it.color }} />
                      {it.text}
                    </span>
                  ),
                )}
                {items.length > 3 && <span className="mg-more">altre {items.length - 3}</span>}
              </div>
              {total > 0 && <span className="mg-total">{fmtDur(total, true)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
