import { saveFile, isWeb } from '../lib/platform';
import { isMacApp } from '../lib/native';
import { navigate } from '../lib/router';
import { dayKey } from '../lib/stats';
import { brokenSave, clearStorageProblem, getData, setSettings, useStorageProblem, type UserData } from '../lib/store';
import { toast } from './UI';

const DAY = 86400000;

/** Things the user must know about their data: a save that could not be read or written, or a backup that is overdue. */
export function Notices({ data }: { data: UserData }) {
  const problem = useStorageProblem();
  const s = data.settings;

  if (problem) {
    const saveBroken = async () => {
      const raw = brokenSave();
      if (!raw) return toast('Nessuna copia da salvare');
      const r = await saveFile(`academic-weapon-illeggibile-${dayKey(Date.now())}.txt`, raw, 'text/plain');
      if (r === 'saved') toast('Copia salvata');
    };
    const text =
      problem.kind === 'restored'
        ? `Il salvataggio non si leggeva: ho ripristinato la copia più recente${problem.from ? ` (${new Date(problem.from).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })})` : ''}. Quello che hai registrato dopo potrebbe mancare.`
        : problem.kind === 'lost'
          ? 'Il salvataggio non si leggeva e non c’era una copia da ripristinare. Il file illeggibile è stato messo da parte: non è stato cancellato.'
          : 'Non riesco a salvare su questo dispositivo: le modifiche restano solo finché l’app è aperta. Esporta un backup adesso.';
    return (
      <div className="notice" data-tone="bad" role="alert">
        <p>{text}</p>
        <div className="notice-actions">
          {problem.kind !== 'write' && (
            <button className="btn" onClick={saveBroken}>
              Salva il file illeggibile
            </button>
          )}
          <button className="btn" onClick={() => navigate('/impostazioni')}>
            {problem.kind === 'write' ? 'Vai al backup' : 'Importa un backup'}
          </button>
          <button className="btn plain" onClick={clearStorageProblem}>
            Ho capito
          </button>
        </div>
      </div>
    );
  }

  // Outside the Mac app nothing backs the data up automatically: remind every two weeks.
  const last = Math.max(s.lastExportAt, s.exportSnoozeUntil - 7 * DAY);
  const overdue = !isMacApp && data.sessions.length >= 5 && Date.now() - s.lastExportAt > 14 * DAY && Date.now() > s.exportSnoozeUntil;
  if (!overdue) return null;
  const exportNow = async () => {
    const r = await saveFile(`academic-weapon-backup-${dayKey(Date.now())}.json`, JSON.stringify(getData(), null, 2), 'application/json');
    if (r === 'saved') {
      setSettings({ lastExportAt: Date.now() });
      toast('Backup salvato');
    } else if (r === 'unavailable') toast('Il salvataggio di file non è disponibile qui');
  };
  return (
    <div className="notice" role="status">
      <p>
        {last > 0 ? 'È passato un po’ dall’ultimo backup.' : 'Non hai ancora un backup.'} {isWeb ? 'I dati stanno solo in questo browser' : 'I dati stanno solo qui'}: se cancelli i dati di navigazione
        si perdono.
      </p>
      <div className="notice-actions">
        <button className="btn primary" onClick={exportNow}>
          Esporta ora
        </button>
        <button className="btn plain" onClick={() => setSettings({ exportSnoozeUntil: Date.now() + 7 * DAY })}>
          Più tardi
        </button>
      </div>
    </div>
  );
}
