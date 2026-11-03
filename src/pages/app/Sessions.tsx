import { useMemo, useState } from 'react';
import { FOCUS_LEVELS } from './FocusOverlay';
import { Empty } from '../../components/Charts';
import { IconEdit, IconPlus, IconTrash } from '../../components/Icons';
import { confirmDialog, Modal, SubjectSelect, toast } from '../../components/UI';
import { addSession, deleteSession, NO_SUBJECT_COLOR, saveSession, type Session, type UserData } from '../../lib/store';
import { dayKey, fmtDate, fmtDur, fmtTime, parseDayKey } from '../../lib/stats';
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

export function SessionModal({ data, session, defaultStart, onClose }: { data: UserData; session: Session | null; defaultStart?: number; onClose: () => void }) {
  const base = session ?? { id: '', subjectId: data.timer.subjectId, start: defaultStart ?? Date.now() - 3600000, dur: data.settings.focusMin * 60, note: '', kind: 'manual' as const, focus: 0 };
  const d0 = new Date(base.start);
  const [date, setDate] = useState(dayKey(d0));
  const [time, setTime] = useState(`${String(d0.getHours()).padStart(2, '0')}:${String(d0.getMinutes()).padStart(2, '0')}`);
  const [h, setH] = useState(Math.floor(base.dur / 3600));
  const [m, setM] = useState(Math.round((base.dur % 3600) / 60));
  const [subjectId, setSubjectId] = useState(base.subjectId ?? '');
  const [note, setNote] = useState(base.note);
  const [focus, setFocus] = useState(base.focus);

  const submit = (close: () => void) => {
    const dur = (h * 60 + m) * 60;
    if (dur < 60) return toast('La durata deve essere di almeno 1 minuto');
    const [y, mo, da] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const start = new Date(y, mo - 1, da, hh, mm).getTime();
    if (start > Date.now()) return toast('La sessione non può essere nel futuro');
    const s = { ...base, start, dur, subjectId: subjectId || null, note: note.trim(), focus };
    if (session) saveSession(s as Session);
    else addSession({ start, dur, subjectId: s.subjectId, note: s.note, kind: 'manual', focus });
    toast(session ? 'Sessione aggiornata' : 'Sessione aggiunta');
    close();
  };

  return (
    <Modal title={session ? 'Modifica sessione' : 'Nuova sessione'} onClose={onClose}>
      {(close) => (
        <>
          <div className="form-grid">
            <label className="field full">
              <span className="field-label">Esame</span>
              <SubjectSelect data={data} value={subjectId} onChange={setSubjectId} />
            </label>
            <label className="field">
              <span className="field-label">Giorno</span>
              <input className="in" type="date" value={date} max={dayKey(Date.now())} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Ora di inizio</span>
              <input className="in" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Ore</span>
              <input className="in" type="number" min={0} max={23} value={h} onChange={(e) => setH(Math.max(0, Math.min(23, Number(e.target.value) || 0)))} />
            </label>
            <label className="field">
              <span className="field-label">Minuti</span>
              <input className="in" type="number" min={0} max={59} value={m} onChange={(e) => setM(Math.max(0, Math.min(59, Number(e.target.value) || 0)))} />
            </label>
            <label className="field full">
              <span className="field-label">Nota</span>
              <textarea className="in" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cosa hai studiato?" />
            </label>
            <div className="field full">
              <span className="field-label">Concentrazione</span>
              <FocusRating value={focus} onChange={setFocus} />
            </div>
          </div>
          <footer className="modal-foot">
            <span />
            <div className="modal-buttons">
              <button className="btn" onClick={close}>
                Annulla
              </button>
              <button className="btn primary" onClick={() => submit(close)}>
                Salva
              </button>
            </div>
          </footer>
        </>
      )}
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

export async function exportCsv(data: UserData) {
  const rows = [['data', 'inizio', 'durata_minuti', 'esame', 'tipo', 'concentrazione', 'nota']];
  for (const s of data.sessions) {
    const sub = data.subjects.find((x) => x.id === s.subjectId);
    rows.push([dayKey(s.start), fmtTime(s.start), String(Math.round(s.dur / 60)), sub?.name ?? '', s.kind, s.focus ? String(s.focus) : '', s.note]);
  }
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  const r = await saveFile(`sessioni-studio-${dayKey(Date.now())}.csv`, csv, 'text/csv');
  if (r === 'unavailable') toast('Il salvataggio di file non è disponibile qui');
}
