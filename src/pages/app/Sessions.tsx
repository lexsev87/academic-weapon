import { useMemo, useState } from 'react';
import { FOCUS_LEVELS } from './FocusOverlay';
import { Empty } from '../../components/Charts';
import { IconChevron, IconEdit, IconPlus, IconTrash } from '../../components/Icons';
import { ActivitySelect, confirmDialog, Modal, SubjectSelect, toast } from '../../components/UI';
import { addSession, deleteSession, NO_SUBJECT_COLOR, saveSession, type Session, type UserData } from '../../lib/store';
import { addDays, dayKey, fmtDate, fmtDur, fmtTime, parseDayKey } from '../../lib/stats';
import { saveFile } from '../../lib/platform';

const KIND: Record<Session['kind'], string> = { pomodoro: 'Pomodoro', stopwatch: 'Cronometro', countdown: 'Timer', manual: 'Manuale' };

/** The calendar's list view: sessions grouped by day, newest first. */
export function SessionList({ data, filter, onEdit }: { data: UserData; filter: string; onEdit: (s: Session | 'new') => void }) {
  const [limit, setLimit] = useState(30);

  const groups = useMemo(() => {
    const list = data.sessions.filter((s) => filter === '__all' || (filter === '' ? !s.subjectId : s.subjectId === filter));
    const m = new Map<string, Session[]>();
    for (const s of [...list].reverse()) {
      const k = dayKey(s.start);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return [...m.entries()];
  }, [data.sessions, filter]);

  if (groups.length === 0) {
    return (
      <div className="card">
        <Empty text="Nessuna sessione registrata.">
          <button className="btn primary" onClick={() => onEdit('new')}>
            <IconPlus size={12} /> Aggiungi la prima
          </button>
        </Empty>
      </div>
    );
  }

  return (
    <div className="stack">
      {groups.slice(0, limit).map(([k, list]) => (
        <section className="section" key={k}>
          <div className="section-head">
            <h2 className="section-title capitalize">{fmtDate(parseDayKey(k))}</h2>
            <span className="section-accessory list-value tnum">{fmtDur(list.reduce((a, s) => a + s.dur, 0))}</span>
          </div>
          <div className="card list">
            {list.map((s) => {
              const sub = data.subjects.find((x) => x.id === s.subjectId);
              return (
                <div className="list-row has-actions" key={s.id}>
                  <span className="dot" style={{ background: sub?.color ?? NO_SUBJECT_COLOR }} />
                  <div className="list-text">
                    <span className="list-title">{sub?.name ?? 'Senza esame'}</span>
                    <span className="list-sub">
                      {fmtTime(s.start)} – {fmtTime(s.start + s.dur * 1000)} · {KIND[s.kind]}
                      {s.note ? ` · ${s.note}` : ''}
                    </span>
                  </div>
                  {s.focus > 0 && <FocusBars n={s.focus} />}
                  <span className="list-value tnum">{fmtDur(s.dur)}</span>
                  <div className="row-actions">
                    <button className="btn icon plain" aria-label="Modifica" title="Modifica" onClick={() => onEdit(s)}>
                      <IconEdit />
                    </button>
                    <button
                      className="btn icon plain destructive"
                      aria-label="Elimina"
                      title="Elimina"
                      onClick={async () => {
                        if (await confirmDialog({ title: 'Eliminare questa sessione?', confirmLabel: 'Elimina', destructive: true })) {
                          deleteSession(s.id);
                          toast('Sessione eliminata');
                        }
                      }}
                    >
                      <IconTrash />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {groups.length > limit && (
        <div className="center-row">
          <button className="btn" onClick={() => setLimit((l) => l + 30)}>
            Mostra altri giorni
          </button>
        </div>
      )}
    </div>
  );
}

/** Five-step concentration scale, used by the session sheet and the end-of-session card. */
export function FocusRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="rating" role="radiogroup" aria-label="Concentrazione">
      {FOCUS_LEVELS.map((l, i) => (
        <button key={l} type="button" role="radio" aria-checked={value === i + 1} onClick={() => onChange(value === i + 1 ? 0 : i + 1)}>
          <FocusBars n={i + 1} />
          {l}
        </button>
      ))}
    </div>
  );
}

const two = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number) => `${two(new Date(ms).getHours())}:${two(new Date(ms).getMinutes())}`;
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Log or edit a session from its start, end and pause: the duration follows from them
 * (an end before the start means the session ran past midnight).
 */
export function SessionForm({
  data,
  session,
  defaultStart,
  onDone,
  onCancel,
  submitLabel,
}: {
  data: UserData;
  session: Session | null;
  defaultStart?: number;
  onDone?: () => void;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const startMs = session?.start ?? defaultStart ?? Date.now() - (data.settings.focusMin + 1) * 60000;
  const endMs = session ? session.start + (session.dur + session.breakSec) * 1000 : startMs + data.settings.focusMin * 60000;
  const [date, setDate] = useState(dayKey(startMs));
  const [from, setFrom] = useState(hhmm(startMs));
  const [to, setTo] = useState(hhmm(endMs));
  const [breakMin, setBreakMin] = useState(Math.round((session?.breakSec ?? 0) / 60));
  const [subjectId, setSubjectId] = useState(session ? (session.subjectId ?? '') : (data.timer.subjectId ?? ''));
  const [activityId, setActivityId] = useState(session ? (session.activityId ?? '') : (data.timer.activityId ?? ''));
  const [note, setNote] = useState(session?.note ?? '');
  const [focus, setFocus] = useState(session?.focus ?? 0);

  let span = toMin(to) - toMin(from);
  if (span <= 0) span += 24 * 60;
  const durMin = span - breakMin;
  const shiftDay = (n: number) => setDate(dayKey(addDays(parseDayKey(date), n)));

  const reset = () => {
    const now = Date.now();
    setFrom(hhmm(now - data.settings.focusMin * 60000));
    setTo(hhmm(now));
    setBreakMin(0);
    setNote('');
    setFocus(0);
  };

  const submit = () => {
    if (durMin < 1) return toast('La durata deve essere di almeno 1 minuto');
    const start = parseDayKey(date).getTime() + toMin(from) * 60000;
    if (start > Date.now()) return toast('La sessione non può essere nel futuro');
    const fields = { start, dur: durMin * 60, breakSec: breakMin * 60, subjectId: subjectId || null, activityId: activityId || null, note: note.trim(), focus };
    if (session) saveSession({ ...session, ...fields });
    else addSession({ ...fields, kind: 'manual' });
    toast(session ? 'Sessione aggiornata' : 'Sessione aggiunta');
    if (!session && !onCancel) reset();
    onDone?.();
  };

  return (
    <>
      <div className="form-grid">
        <div className="field full">
          <span className="field-label">Giorno</span>
          <div className="date-stepper">
            <button type="button" className="btn icon" aria-label="Giorno precedente" onClick={() => shiftDay(-1)}>
              <IconChevron style={{ transform: 'rotate(180deg)' }} />
            </button>
            <input className="in" type="date" value={date} max={dayKey(Date.now())} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Giorno" />
            <button type="button" className="btn icon" aria-label="Giorno successivo" disabled={date >= dayKey(Date.now())} onClick={() => shiftDay(1)}>
              <IconChevron />
            </button>
          </div>
        </div>
        <div className="field-row full">
          <label className="field">
            <span className="field-label">Inizio</span>
            <input className="in" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Fine</span>
            <input className="in" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Pausa (min)</span>
            <input className="in" type="number" min={0} max={600} value={breakMin} onChange={(e) => setBreakMin(Math.max(0, Math.min(600, Number(e.target.value) || 0)))} />
          </label>
        </div>
        <p className="field-note full tnum">
          Durata: <b>{durMin >= 1 ? fmtDur(durMin * 60) : '–'}</b>
          {breakMin > 0 && durMin >= 1 ? ` · ${fmtDur(span * 60)} con la pausa` : ''}
        </p>
        <label className="field">
          <span className="field-label">Esame</span>
          <SubjectSelect data={data} value={subjectId} onChange={setSubjectId} />
        </label>
        <label className="field">
          <span className="field-label">Attività</span>
          <ActivitySelect data={data} value={activityId} onChange={setActivityId} />
        </label>
        <label className="field full">
          <span className="field-label">Nota</span>
          <textarea className="in" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. ripasso lezione 1, slide 1–20" />
        </label>
        <div className="field full">
          <span className="field-label">Concentrazione</span>
          <FocusRating value={focus} onChange={setFocus} />
        </div>
      </div>
      <footer className="modal-foot">
        <span />
        <div className="modal-buttons">
          {onCancel && (
            <button className="btn" onClick={onCancel}>
              Annulla
            </button>
          )}
          <button className="btn primary" onClick={submit} disabled={durMin < 1}>
            {submitLabel}
          </button>
        </div>
      </footer>
    </>
  );
}

export function SessionModal({ data, session, defaultStart, onClose }: { data: UserData; session: Session | null; defaultStart?: number; onClose: () => void }) {
  return (
    <Modal title={session ? 'Modifica sessione' : 'Nuova sessione'} onClose={onClose}>
      {(close) => <SessionForm data={data} session={session} defaultStart={defaultStart} onDone={close} onCancel={close} submitLabel="Salva" />}
    </Modal>
  );
}

export function FocusBars({ n }: { n: number }) {
  return (
    <span className="bars" title={`Concentrazione: ${FOCUS_LEVELS[n - 1] ?? '–'}`}>
      {Array.from({ length: 5 }, (_, k) => (
        <i key={k} data-on={k < n || undefined} />
      ))}
    </span>
  );
}

export async function exportCsv(data: UserData, sessions?: Session[]) {
  const rows = [['data', 'inizio', 'durata_minuti', 'pausa_minuti', 'esame', 'attivita', 'tipo', 'concentrazione', 'nota']];
  for (const s of sessions ?? data.sessions) {
    const sub = data.subjects.find((x) => x.id === s.subjectId);
    const act = data.activities.find((x) => x.id === s.activityId);
    rows.push([dayKey(s.start), fmtTime(s.start), String(Math.round(s.dur / 60)), String(Math.round(s.breakSec / 60)), sub?.name ?? '', act?.name ?? '', s.kind, s.focus ? String(s.focus) : '', s.note]);
  }
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  const r = await saveFile(`sessioni-studio-${dayKey(Date.now())}.csv`, csv, 'text/csv');
  if (r === 'unavailable') toast('Il salvataggio di file non è disponibile qui');
}
