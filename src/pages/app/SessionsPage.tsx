import { useMemo, useState } from 'react';
import { Empty } from '../../components/Charts';
import { IconDownload, IconEdit, IconTrash } from '../../components/Icons';
import { StatLine } from '../../components/StatLine';
import { ActivitySelect, confirmDialog, PageHeader, Section, Seg, SubjectSelect, toast } from '../../components/UI';
import { trackingPeriod } from '../../lib/insights';
import { readStore, writeStore } from '../../lib/platform';
import { addDays, fmtDate, fmtDur, fmtTime, startOfDay, startOfWeek } from '../../lib/stats';
import { deleteSessions, NO_SUBJECT_COLOR, type Session, type UserData } from '../../lib/store';
import { exportCsv, FocusBars, SessionForm, SessionModal } from './Sessions';

type Range = 'week' | 'month' | 'period' | 'all';
type Layout = 'table' | 'cards';

const RANGES: { id: Range; label: string }[] = [
  { id: 'week', label: 'Settimana' },
  { id: 'month', label: 'Mese' },
  { id: 'period', label: 'Periodo' },
  { id: 'all', label: 'Tutto' },
];

export function SessionsPage({ data }: { data: UserData; name: string }) {
  const [range, setRange] = useState<Range>(() => (readStore('aw:sess-range') as Range) || 'month');
  const [layout, setLayout] = useState<Layout>(() => (readStore('aw:sess-layout') as Layout) || 'table');
  const [subject, setSubject] = useState('__all');
  const [activity, setActivity] = useState('__all');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Session | null>(null);

  const setR = (r: Range) => {
    setRange(r);
    writeStore('aw:sess-range', r);
  };
  const setL = (l: Layout) => {
    setLayout(l);
    writeStore('aw:sess-layout', l);
  };

  const rows = useMemo(() => {
    const now = new Date();
    const from =
      range === 'week'
        ? startOfWeek(now, data.settings.weekStart).getTime()
        : range === 'month'
          ? new Date(now.getFullYear(), now.getMonth(), 1).getTime()
          : range === 'period'
            ? trackingPeriod(data.settings, now).start.getTime()
            : 0;
    const to = range === 'period' ? trackingPeriod(data.settings, now).end.getTime() : addDays(startOfDay(now), 1).getTime();
    const needle = q.trim().toLowerCase();
    return data.sessions
      .filter((s) => s.start >= from && s.start < to)
      .filter((s) => subject === '__all' || (subject === '' ? !s.subjectId : s.subjectId === subject))
      .filter((s) => activity === '__all' || (activity === '' ? !s.activityId : s.activityId === activity))
      .filter((s) => {
        if (!needle) return true;
        const sub = data.subjects.find((x) => x.id === s.subjectId)?.name ?? '';
        const act = data.activities.find((x) => x.id === s.activityId)?.name ?? '';
        return `${s.note} ${sub} ${act}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => b.start - a.start);
  }, [data, range, subject, activity, q]);

  const total = rows.reduce((a, s) => a + s.dur, 0);
  const visiblePicked = rows.filter((s) => picked.has(s.id));
  const allPicked = rows.length > 0 && visiblePicked.length === rows.length;
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((s) => s.id)));

  const removePicked = async () => {
    const n = visiblePicked.length;
    const ok = await confirmDialog({
      title: n === 1 ? 'Eliminare la sessione?' : `Eliminare ${n} sessioni?`,
      message: 'Non si può annullare.',
      confirmLabel: 'Elimina',
      destructive: true,
    });
    if (!ok) return;
    deleteSessions(visiblePicked.map((s) => s.id));
    setPicked(new Set());
    toast(n === 1 ? 'Sessione eliminata' : `${n} sessioni eliminate`);
  };

  const subjectOf = (s: Session) => data.subjects.find((x) => x.id === s.subjectId);
  const activityOf = (s: Session) => data.activities.find((x) => x.id === s.activityId);

  return (
    <>
      <PageHeader title="Sessioni" subtitle={<StatLine data={data} />} />
      <div className="sessions-layout">
        <Section title="Registra una sessione" className="sessions-new">
          <div className="card form-card">
            <SessionForm data={data} session={null} submitLabel="Aggiungi sessione" />
          </div>
        </Section>

        <Section
          title="Storico"
          note={`${rows.length} ${rows.length === 1 ? 'sessione' : 'sessioni'} · ${fmtDur(total)}`}
          className="sessions-history"
          accessory={<Seg<Layout> size="sm" label="Vista" value={layout} onChange={setL} options={[{ id: 'table', label: 'Tabella' }, { id: 'cards', label: 'Schede' }]} />}
        >
          <div className="filter-bar">
            <Seg<Range> size="sm" label="Periodo" value={range} onChange={setR} options={RANGES} />
            <SubjectSelect data={data} value={subject} onChange={setSubject} allowAll />
            <ActivitySelect data={data} value={activity} onChange={setActivity} allowAll />
            <input className="in search" type="search" placeholder="Cerca nelle note" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca" />
          </div>

          {visiblePicked.length > 0 && (
            <div className="bulk-bar">
              <span className="tnum">
                {visiblePicked.length} {visiblePicked.length === 1 ? 'selezionata' : 'selezionate'}
              </span>
              <button className="btn" onClick={() => exportCsv(data, visiblePicked)}>
                <IconDownload /> Esporta
              </button>
              <button className="btn destructive" onClick={removePicked}>
                <IconTrash /> Elimina
              </button>
            </div>
          )}

          {!rows.length ? (
            <div className="card">
              <Empty text={data.sessions.length ? 'Nessuna sessione con questi filtri.' : 'Ancora nessuna sessione: registrane una qui accanto o avvia il timer.'} />
            </div>
          ) : layout === 'table' ? (
            <div className="card table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-check">
                      <input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Seleziona tutte" />
                    </th>
                    <th>Giorno</th>
                    <th>Orario</th>
                    <th className="num">Durata</th>
                    <th>Esame</th>
                    <th>Attività</th>
                    <th className="col-note">Nota</th>
                    <th aria-label="Azioni" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const sub = subjectOf(s);
                    const act = activityOf(s);
                    return (
                      <tr key={s.id} data-picked={picked.has(s.id) || undefined}>
                        <td className="col-check">
                          <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label="Seleziona" />
                        </td>
                        <td className="nowrap">{fmtDate(s.start, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                        <td className="nowrap tnum secondary">
                          {fmtTime(s.start)}–{fmtTime(s.start + (s.dur + s.breakSec) * 1000)}
                        </td>
                        <td className="num tnum">{fmtDur(s.dur)}</td>
                        <td>
                          <span className="tag">
                            <span className="dot" style={{ background: sub?.color ?? NO_SUBJECT_COLOR }} />
                            {sub?.name ?? 'Senza esame'}
                          </span>
                        </td>
                        <td>{act ? <span className="pill" style={{ ['--c' as string]: act.color }}>{act.name}</span> : <span className="secondary">–</span>}</td>
                        <td className="col-note secondary">{s.note}</td>
                        <td className="col-actions">
                          <button className="btn icon plain" aria-label="Modifica" onClick={() => setEditing(s)}>
                            <IconEdit />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="session-cards">
              {rows.map((s) => {
                const sub = subjectOf(s);
                const act = activityOf(s);
                return (
                  <article key={s.id} className="card session-card" data-picked={picked.has(s.id) || undefined} style={{ ['--c' as string]: sub?.color ?? NO_SUBJECT_COLOR }}>
                    <header>
                      <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label="Seleziona" />
                      <span className="session-card-date">{fmtDate(s.start, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                      <button className="btn icon plain" aria-label="Modifica" onClick={() => setEditing(s)}>
                        <IconEdit />
                      </button>
                    </header>
                    <strong className="session-card-dur tnum">{fmtDur(s.dur)}</strong>
                    <span className="secondary tnum">
                      {fmtTime(s.start)}–{fmtTime(s.start + (s.dur + s.breakSec) * 1000)}
                    </span>
                    <span className="tag">
                      <span className="dot" style={{ background: sub?.color ?? NO_SUBJECT_COLOR }} />
                      {sub?.name ?? 'Senza esame'}
                    </span>
                    {act && <span className="pill" style={{ ['--c' as string]: act.color }}>{act.name}</span>}
                    {s.note && <p className="session-card-note">{s.note}</p>}
                    {s.focus > 0 && <FocusBars n={s.focus} />}
                  </article>
                );
              })}
            </div>
          )}
        </Section>
      </div>
      {editing && <SessionModal data={data} session={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
