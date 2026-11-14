import { useEffect, useRef } from 'react';
import { goalFor, dayKey } from '../lib/stats';
import { MILESTONES, streak } from '../lib/streak';
import { setSettings, type UserData } from '../lib/store';
import { IconFlame } from './Icons';
import { Modal, toast } from './UI';

const LINES: Record<number, string> = {
  3: 'Tre giorni: l’abitudine sta prendendo forma.',
  7: 'Una settimana intera. Ora è un ritmo.',
  14: 'Due settimane di fila: costanza vera.',
  30: 'Un mese senza saltare un giorno di studio.',
  50: 'Cinquanta giorni. Pochi arrivano fin qui.',
  100: 'Cento giorni di fila. Academic weapon, appunto.',
};

/** Small rewards: a toast when today counts for the streak or the daily goal is met, a sheet at each milestone. */
export function Celebration({ data }: { data: UserData }) {
  const s = data.settings;
  const st = streak(data.sessions, s, new Date());
  const todayKey = dayKey(Date.now());
  const today = data.sessions.filter((x) => dayKey(x.start) === todayKey).reduce((a, x) => a + x.dur, 0);
  const goal = goalFor(s, new Date());
  const milestone = st.today && MILESTONES.includes(st.current) && st.current > s.milestoneShown ? st.current : 0;
  const first = useRef(true);

  useEffect(() => {
    // On the very first render after an update, mark what is already true as seen: no burst of toasts.
    if (first.current && s.streakToastDay === '' && s.goalToastDay === '' && s.milestoneShown === 0) {
      first.current = false;
      setSettings({ streakToastDay: st.today ? todayKey : '', goalToastDay: goal > 0 && today >= goal ? todayKey : '', milestoneShown: st.reached });
      return;
    }
    first.current = false;
    if (milestone) return; // the sheet says it
    if (goal > 0 && today >= goal && s.goalToastDay !== todayKey) {
      setSettings({ goalToastDay: todayKey, streakToastDay: todayKey });
      toast(st.current > 1 ? `Obiettivo di oggi raggiunto · ${st.current} giorni di fila` : 'Obiettivo di oggi raggiunto');
    } else if (st.today && s.streakToastDay !== todayKey) {
      setSettings({ streakToastDay: todayKey });
      toast(st.current > 1 ? `Serie allungata: ${st.current} giorni di fila` : 'Serie iniziata: torna domani per allungarla');
    }
  });

  if (!milestone) return null;
  const close = () => setSettings({ milestoneShown: milestone, streakToastDay: todayKey });
  return (
    <Modal title="" onClose={close}>
      {(dismiss) => (
        <div className="celebrate">
          <span className="celebrate-flame">
            <IconFlame size={64} filled />
          </span>
          <p className="celebrate-num tnum">{milestone}</p>
          <h2>giorni di fila</h2>
          <p className="celebrate-line">{LINES[milestone] ?? 'Un traguardo raro: continua così.'}</p>
          <p className="celebrate-next">
            Prossimo traguardo: {MILESTONES.find((m) => m > milestone) ?? milestone + 100} giorni · record {Math.max(st.best, milestone)}
          </p>
          <button className="btn primary" onClick={dismiss} autoFocus>
            Continua
          </button>
        </div>
      )}
    </Modal>
  );
}
