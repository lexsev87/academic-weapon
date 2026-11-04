import { useState } from 'react';
import { GoalFields, ProgramFields, SoundFields } from '../../components/Prefs';
import { Seg, Stepper } from '../../components/UI';
import { navigate } from '../../lib/router';
import { setSettings, type Settings, type UserData } from '../../lib/store';
import logoUrl from '../../assets/logo.png';

const PRESETS = [
  { focus: 25, short: 5, long: 15 },
  { focus: 50, short: 10, long: 20 },
  { focus: 90, short: 20, long: 30 },
];

/** First-run setup, step by step. Also reachable later from Settings. */
export function Setup({ data }: { data: UserData }) {
  const [s, setS] = useState<Settings>(data.settings);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'next' | 'back'>('next');
  const go = (n: number) => {
    setDir(n > step ? 'next' : 'back');
    setStep(n);
  };
  const set = (p: Partial<Settings>) => setS((x) => ({ ...x, ...p }));

  const steps = [
    {
      title: 'Benvenuto in Academic Weapon',
      sub: 'Qualche domanda per cucire l’app su di te. Puoi cambiare tutto in seguito dalle Impostazioni.',
      body: (
        <div className="field">
          <span className="field-label">Come ti chiami?</span>
          <input
            className="in large"
            autoFocus
            value={s.name}
            placeholder="Nome"
            onChange={(e) => set({ name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && go(1)}
          />
        </div>
      ),
    },
    {
      title: 'Il tuo percorso',
      sub: 'Università italiana, estera o un anno su misura: scegli crediti, voti e periodi come funzionano per te.',
      body: <ProgramFields s={s} set={set} />,
    },
    {
      title: 'I tuoi obiettivi',
      sub: 'Quante ore vuoi studiare? Ogni giorno la Home ti dirà quanto ti manca.',
      body: (
        <>
          <GoalFields s={s} set={set} />
          <div className="field">
            <span className="field-label">La settimana inizia di</span>
            <Seg<'1' | '0'>
              value={String(s.weekStart) as '1' | '0'}
              onChange={(v) => set({ weekStart: Number(v) as 0 | 1 })}
              options={[
                { id: '1', label: 'Lunedì' },
                { id: '0', label: 'Domenica' },
              ]}
            />
          </div>
        </>
      ),
    },
    {
      title: 'Timer e suoni',
      sub: 'Durata dei pomodori e un suono diverso per la fine dello studio e della pausa.',
      body: (
        <>
          <div className="chips center">
            {PRESETS.map((p) => (
              <button
                key={p.focus}
                type="button"
                className="chip"
                aria-pressed={s.focusMin === p.focus && s.shortMin === p.short}
                onClick={() => set({ focusMin: p.focus, shortMin: p.short, longMin: p.long })}
              >
                {p.focus} / {p.short}
              </button>
            ))}
          </div>
          <div className="card list nested">
            <Stepper label="Concentrazione" unit="min" value={s.focusMin} min={5} max={180} step={5} onChange={(v) => set({ focusMin: v })} />
            <Stepper label="Pausa breve" unit="min" value={s.shortMin} min={1} max={60} step={1} onChange={(v) => set({ shortMin: v })} />
          </div>
          <div className="card list nested">
            <SoundFields s={s} set={set} />
          </div>
        </>
      ),
    },
  ];
  const last = step === steps.length - 1;
  const finish = () => {
    setSettings({ ...s, name: s.name.trim() || 'Studente', setupDone: true });
    navigate(data.semesters.length ? '/' : '/esami');
  };
  const cur = steps[step];

  return (
    <div className="setup">
      <div className="setup-card" role="dialog" aria-modal aria-label={cur.title}>
        <div className="setup-step" key={step} data-dir={dir}>
          <div className="setup-head">
            <img src={logoUrl} alt="" width={step === 0 ? 112 : 64} height={step === 0 ? 112 : 64} />
            <h1>{cur.title}</h1>
            <p>{cur.sub}</p>
          </div>
          <div className="setup-body">{cur.body}</div>
        </div>
        <footer className="setup-foot">
          <div className="dots" aria-label={`Passo ${step + 1} di ${steps.length}`}>
            {steps.map((_, i) => (
              <i key={i} data-state={i === step ? 'on' : i < step ? 'done' : undefined} />
            ))}
          </div>
          <div className="modal-buttons">
            {step > 0 && (
              <button className="btn" onClick={() => go(step - 1)}>
                Indietro
              </button>
            )}
            <button className="btn primary" onClick={() => (last ? finish() : go(step + 1))}>
              {last ? 'Inizia a studiare' : 'Continua'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
