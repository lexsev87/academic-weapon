import { useEffect } from 'react';
import { Ring } from '../../components/Charts';
import { IconExpand, IconPause, IconPlay, IconReset, IconSkip, IconStop } from '../../components/Icons';
import { confirmDialog, PageHeader, Section, Seg, Stepper, SubjectSelect, toast } from '../../components/UI';
import { NO_SUBJECT_COLOR, setSettings, setTimer, type Settings, type TimerMode, type UserData } from '../../lib/store';
import { blocksDone, fmtBlocks, fmtClock, fmtDur, fmtGoal, goalFor, startOfDay, sumRange } from '../../lib/stats';
import { requestNotifications } from '../../lib/platform';
import { elapsed, finishAndSave, pause, PHASE_LABEL, resetTimer, setFocusView, setMode, skipPhase, start, targetMs, useNow } from '../../lib/timer';

const PRESETS = [
  { focus: 25, short: 5, long: 15 },
  { focus: 50, short: 10, long: 20 },
  { focus: 90, short: 20, long: 30 },
];

export function TimerPage({ data }: { data: UserData; name: string }) {
  const t = data.timer;
  const s = data.settings;
  const now = useNow(t.running);
  const target = targetMs(t, data);
  const el = elapsed(t, now);
  const shown = target === null ? el : Math.max(0, target - el);
  const pct = target === null ? (el % 3600000) / 3600000 : el / target;
  const today = sumRange(data.sessions, startOfDay(new Date()).getTime(), Date.now() + 1);
  const isBreak = t.mode === 'pomodoro' && t.phase !== 'focus';
  const label = t.mode === 'pomodoro' ? PHASE_LABEL[t.phase] : t.mode === 'stopwatch' ? 'Cronometro' : 'Timer';
  const canSave = !isBreak && el >= 60000;
  const subject = data.subjects.find((x) => x.id === t.subjectId);
  const idle = !t.running && el === 0;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        t.running ? pause() : start();
      }
      if (e.key === 'f') setFocusView(true);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [t.running]);

  const save = () => {
    if (!finishAndSave()) toast('Sessione troppo corta (meno di 1 minuto): non salvata');
  };
  const askNotify = () => {
    if (s.notify) void requestNotifications();
  };

  return (
    <>
      <PageHeader
        title="Focus"
        subtitle={
          <>
            Oggi {fmtDur(today)}
            {s.goalInBlocks ? ` · ${fmtBlocks(blocksDone(s, today))} di ${fmtGoal(s)}` : ` di ${fmtDur(goalFor(s))}`}
          </>
        }
      >
        <Seg<TimerMode>
          label="Modalità"
          value={t.mode}
          onChange={async (m) => {
            if (el > 0 && !(await confirmDialog({ title: 'Cambiare modalità?', message: 'Il timer in corso verrà azzerato.', confirmLabel: 'Cambia' }))) return;
            setMode(m);
          }}
          options={[
            { id: 'pomodoro', label: 'Pomodoro' },
            { id: 'stopwatch', label: 'Cronometro' },
            { id: 'countdown', label: 'Timer' },
          ]}
        />
      </PageHeader>

      <div className="grid cols-main">
        <section className="card timer" data-phase={isBreak ? 'break' : 'focus'}>
          <label className="timer-subject">
            <span className="dot" style={{ background: subject?.color ?? NO_SUBJECT_COLOR }} />
            <SubjectSelect data={data} value={t.subjectId ?? ''} onChange={(v) => setTimer({ subjectId: v || null })} />
          </label>

          <Ring pct={pct} size={288} stroke={10} color={isBreak ? 'var(--green)' : 'var(--accent)'}>
            <span className="timer-phase">{label}</span>
            <span className="timer-clock tnum">{fmtClock(shown)}</span>
            {t.mode === 'pomodoro' && (
              <span className="cycle" title={`Pomodori nel ciclo: ${t.cycle % s.longEvery} di ${s.longEvery}`}>
                {Array.from({ length: s.longEvery }, (_, i) => (
                  <i key={i} data-on={i < t.cycle % s.longEvery || undefined} />
                ))}
              </span>
            )}
          </Ring>

          <div className="transport">
            <button className="btn-circle" onClick={resetTimer} title="Azzera" aria-label="Azzera" disabled={el === 0}>
              <IconReset />
            </button>
            <button
              className="play-button"
              onClick={() => {
                askNotify();
                t.running ? pause() : start();
              }}
              aria-label={t.running ? 'Pausa' : 'Avvia'}
            >
              {t.running ? <IconPause size={26} /> : <IconPlay size={26} />}
            </button>
            {t.mode === 'pomodoro' ? (
              <button className="btn-circle" onClick={() => skipPhase()} title="Salta fase" aria-label="Salta fase">
                <IconSkip />
              </button>
            ) : (
              <button className="btn-circle" onClick={save} title="Termina e annota" aria-label="Termina e annota" disabled={!canSave}>
                <IconStop />
              </button>
            )}
          </div>

          <input className="in timer-note" value={t.note} placeholder="Su cosa stai lavorando? Es. Varian cap. 5, esercizi" onChange={(e) => setTimer({ note: e.target.value })} />

          <div className="timer-foot">
            {t.mode === 'pomodoro' && !isBreak && (
              <button className="btn" onClick={save} disabled={!canSave}>
                <IconStop size={11} /> Termina e annota
              </button>
            )}
            <button className="btn" onClick={() => setFocusView(true)}>
              <IconExpand size={12} /> Schermo intero
            </button>
          </div>
          <p className="hint-line">
            <kbd>Spazio</kbd> avvia o mette in pausa · <kbd>F</kbd> schermo intero
          </p>
        </section>

        <div className="stack">
          {t.mode === 'pomodoro' && <PomodoroSettings s={s} locked={!idle} />}
          {t.mode === 'countdown' && (
            <Section title="Durata">
              <div className="chips">
                {[30, 45, 60, 90, 120].map((m) => (
                  <button key={m} className="chip" aria-pressed={t.countdownMin === m} disabled={!idle} onClick={() => setTimer({ countdownMin: m })}>
                    {fmtDur(m * 60)}
                  </button>
                ))}
              </div>
              <div className="card list">
                <Stepper label="Minuti" value={t.countdownMin} min={1} max={600} step={5} disabled={!idle} onChange={(v) => setTimer({ countdownMin: v })} />
              </div>
            </Section>
          )}
          {t.mode === 'stopwatch' && (
            <Section title="Cronometro">
              <p className="card pad text-2">Avvialo e premi “Termina e annota” quando hai finito: la sessione finisce nel calendario.</p>
            </Section>
          )}
          <TodayList data={data} />
        </div>
      </div>
    </>
  );
}

function PomodoroSettings({ s, locked }: { s: Settings; locked: boolean }) {
  const set = (p: Partial<Settings>) => setSettings(p);
  return (
    <Section title="Pomodoro" note={locked ? 'modificabile a timer fermo' : `${s.focusMin} + ${s.shortMin} min`}>
      <div className="chips">
        {PRESETS.map((p) => (
          <button
            key={p.focus}
            disabled={locked}
            className="chip"
            aria-pressed={s.focusMin === p.focus && s.shortMin === p.short}
            onClick={() => set({ focusMin: p.focus, shortMin: p.short, longMin: p.long })}
          >
            {p.focus} / {p.short}
          </button>
        ))}
      </div>
      <div className="card list">
        <Stepper label="Concentrazione" unit="min" value={s.focusMin} min={5} max={180} step={5} disabled={locked} onChange={(v) => set({ focusMin: v })} />
        <Stepper label="Pausa breve" unit="min" value={s.shortMin} min={1} max={60} step={1} disabled={locked} onChange={(v) => set({ shortMin: v })} />
        <Stepper label="Pausa lunga" unit="min" value={s.longMin} min={1} max={90} step={5} disabled={locked} onChange={(v) => set({ longMin: v })} />
        <Stepper label="Pausa lunga ogni" unit="pomodori" value={s.longEvery} min={2} max={12} step={1} disabled={locked} onChange={(v) => set({ longEvery: v })} />
      </div>
    </Section>
  );
}

function TodayList({ data }: { data: UserData }) {
  const from = startOfDay(new Date()).getTime();
  const list = data.sessions.filter((x) => x.start >= from).reverse();
  return (
    <Section title="Oggi" note={`${list.length} ${list.length === 1 ? 'sessione' : 'sessioni'}`}>
      <div className="card list">
        {list.length === 0 ? (
          <p className="list-empty">Nessuna sessione ancora. Si comincia!</p>
        ) : (
          list.map((x) => {
            const sub = data.subjects.find((v) => v.id === x.subjectId);
            return (
              <div className="list-row" key={x.id}>
                <span className="dot" style={{ background: sub?.color ?? NO_SUBJECT_COLOR }} />
                <div className="list-text">
                  <span className="list-title">{sub ? sub.name : 'Senza esame'}</span>
                  {x.note && <span className="list-sub">{x.note}</span>}
                </div>
                <span className="list-value tnum">{fmtDur(x.dur)}</span>
              </div>
            );
          })
        )}
      </div>
    </Section>
  );
}
