import { useEffect, useState } from 'react';
import { Ring } from '../../components/Charts';
import { IconCheck, IconPause, IconPlay, IconReset, IconSkip, IconStop, IconX } from '../../components/Icons';
import { confirmDialog, Stepper, SubjectSelect } from '../../components/UI';
import { NO_SUBJECT_COLOR, type UserData } from '../../lib/store';
import { FocusRating } from './Sessions';
import { blocksDone, fmtBlocks, fmtClock, fmtDur, fmtGoal, fmtTime, goalFor, startOfDay, sumRange } from '../../lib/stats';
import { discardLog, elapsed, finishAndSave, pause, PHASE_LABEL, resetTimer, saveLog, setFocusView, skipPhase, start, targetMs, useNow } from '../../lib/timer';

export const FOCUS_LEVELS = ['Distratto', 'A tratti', 'Discreto', 'Concentrato', 'Flow totale'];

/** Full-screen focus clock, and the end-of-session sheet when a block finishes. */
export function FocusOverlay({ data, closing }: { data: UserData; closing: boolean }) {
  const t = data.timer;
  const now = useNow(t.running);
  const isBreak = t.mode === 'pomodoro' && t.phase !== 'focus';

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || t.pending) return;
      if (e.code === 'Space') {
        e.preventDefault();
        t.running ? pause() : start();
      }
      if (e.key === 'Escape' || e.key === 'f') setFocusView(false);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [t.running, t.pending]);

  const target = targetMs(t, data);
  const el = elapsed(t, now);
  const shown = target === null ? el : Math.max(0, target - el);
  const pct = target === null ? (el % 3600000) / 3600000 : el / target;
  const subject = data.subjects.find((x) => x.id === t.subjectId);
  const label = t.mode === 'pomodoro' ? PHASE_LABEL[t.phase] : t.mode === 'stopwatch' ? 'Cronometro' : 'Timer';
  const today = sumRange(data.sessions, startOfDay(new Date()).getTime(), Date.now() + 1);
  const goal = goalFor(data.settings);
  const s = data.settings;
  const endsAt = target !== null && t.running ? Date.now() + (target - el) : null;

  return (
    <div className={`focus-full ${isBreak && !t.pending ? 'break' : ''} ${t.pending ? 'log' : ''} ${closing ? 'closing' : ''}`}>
      <div className="focus-bg" aria-hidden />
      {t.pending ? (
        <SessionLog data={data} />
      ) : (
        <div className="focus-inner">
          <button className="focus-close" onClick={() => setFocusView(false)} aria-label="Esci dallo schermo intero" title="Esci (Esc)">
            <IconX />
          </button>
          <div className="focus-top">
            {isBreak ? (
              <span className="focus-chip">{t.phase === 'long' ? 'Pausa lunga: alzati, bevi, muoviti' : 'Pausa: stacca gli occhi dallo schermo'}</span>
            ) : (
              <span className="focus-chip">
                <span className="dot" style={{ background: subject?.color ?? NO_SUBJECT_COLOR }} />
                {subject?.name ?? 'Senza esame'}
              </span>
            )}
          </div>
          <Ring pct={pct} size={380} stroke={12} color="#fff" track="rgba(255,255,255,0.2)">
            <span className="focus-phase">{label}</span>
            <span className="focus-clock tnum">{fmtClock(shown)}</span>
            {endsAt && <span className="focus-ends tnum">termina alle {fmtTime(endsAt)}</span>}
            {t.mode === 'pomodoro' && (
              <span className="cycle light">
                {Array.from({ length: s.longEvery }, (_, i) => (
                  <i key={i} data-on={i < t.cycle % s.longEvery || undefined} />
                ))}
              </span>
            )}
          </Ring>
          {!isBreak && t.note && <div className="focus-note">{t.note}</div>}
          <div className="transport">
            <button className="btn-circle glass" onClick={resetTimer} aria-label="Azzera" title="Azzera" disabled={el === 0}>
              <IconReset />
            </button>
            <button className="play-button glass" onClick={() => (t.running ? pause() : start())} aria-label={t.running ? 'Pausa' : 'Avvia'}>
              {t.running ? <IconPause size={30} /> : <IconPlay size={30} />}
            </button>
            {isBreak ? (
              <button className="btn-circle glass" onClick={() => skipPhase()} aria-label="Salta la pausa" title="Salta la pausa">
                <IconSkip />
              </button>
            ) : (
              <button className="btn-circle glass" onClick={() => finishAndSave()} aria-label="Termina e annota" title="Termina e annota" disabled={el < 60000}>
                <IconStop />
              </button>
            )}
          </div>
          <div className="focus-foot">
            Oggi {fmtDur(today)}
            {goal ? (s.goalInBlocks ? ` · ${fmtBlocks(blocksDone(s, today))} di ${fmtGoal(s)}` : ` di ${fmtDur(goal)}`) : ''} · Spazio avvia/pausa · Esc esci
          </div>
        </div>
      )}
    </div>
  );
}

function SessionLog({ data }: { data: UserData }) {
  const t = data.timer;
  const p = t.pending!;
  const [subjectId, setSubjectId] = useState(t.subjectId ?? '');
  const [min, setMin] = useState(Math.max(1, Math.round(p.dur / 60)));
  const [note, setNote] = useState(t.note);
  const [focus, setFocus] = useState(0);
  const subject = data.subjects.find((x) => x.id === subjectId);
  const brk = t.mode === 'pomodoro' && p.thenBreak;
  const nextBreak = (t.cycle + 1) % data.settings.longEvery === 0 ? data.settings.longMin : data.settings.shortMin;
  const save = (withBreak: boolean) => saveLog({ subjectId: subjectId || null, dur: min * 60, note, focus }, withBreak);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'Enter') save(brk);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  return (
    <div className="log-card" role="dialog" aria-modal aria-labelledby="log-title">
      <header className="log-head">
        <span className="log-check" style={{ background: subject?.color ?? 'var(--green)' }}>
          <IconCheck size={24} />
        </span>
        <h2 id="log-title">Sessione completata</h2>
        <p className="tnum">
          {fmtTime(p.start)} – {fmtTime(p.start + p.dur * 1000)} · {fmtDur(p.dur)} di studio
        </p>
      </header>
      <div className="form-grid">
        <label className="field full">
          <span className="field-label">Esame</span>
          <SubjectSelect data={data} value={subjectId} onChange={setSubjectId} />
        </label>
        <label className="field full">
          <span className="field-label">Cosa hai fatto?</span>
          <textarea
            className="in"
            autoFocus
            value={note}
            placeholder="Es. Varian cap. 5, esercizi 1–8; ripasso utilità marginale"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="field full">
          <span className="field-label">Quanto eri concentrato?</span>
          <FocusRating value={focus} onChange={setFocus} />
        </div>
        <div className="field full">
          <div className="card list nested">
            <Stepper label="Durata effettiva" unit="min" value={min} min={1} max={600} step={1} onChange={setMin} />
          </div>
        </div>
      </div>
      <footer className="modal-foot">
        <button
          className="btn plain destructive"
          onClick={async () => {
            if (await confirmDialog({ title: 'Scartare questa sessione?', message: 'Non verrà salvata nel calendario.', confirmLabel: 'Scarta', destructive: true })) discardLog();
          }}
        >
          Scarta
        </button>
        <div className="modal-buttons">
          {brk && (
            <button className="btn" onClick={() => save(false)}>
              Salva senza pausa
            </button>
          )}
          <button className="btn primary" onClick={() => save(brk)}>
            {brk ? `Salva e inizia la pausa (${nextBreak} min)` : 'Salva sessione'}
          </button>
        </div>
      </footer>
      <p className="hint-line">
        <kbd>⌘</kbd>
        <kbd>↩</kbd> per salvare
      </p>
    </div>
  );
}
