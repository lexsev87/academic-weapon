import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconDownload, IconUpload } from '../../components/Icons';
import { confirmDialog, PageHeader, Seg, Stepper, toast } from '../../components/UI';
import { GoalFields, ProgramFields, Row, SoundFields, Toggle } from '../../components/Prefs';
import { chooseFolder, claudeKeyClear, claudeKeySet, claudeKeyStatus, isMacApp, reveal } from '../../lib/native';
import { reviewChannel } from '../../lib/review';
import { runBackup } from '../../lib/backup';
import { useFeedback } from '../../lib/feedback';
import { inClaudeViewer, isWeb, requestNotifications, saveFile } from '../../lib/platform';
import { navigate } from '../../lib/router';
import { ACCENTS, setAccent, setThemePref, useAccent, useThemePref, type ThemePref } from '../../lib/theme';
import { ACTIVITY_COLORS, deleteActivity, getData, replaceData, resetAll, saveActivity, setSettings, uid, update, type Activity, type DayOff, type UserData } from '../../lib/store';
import { IconPlus, IconTrash } from '../../components/Icons';
import { trackingPeriod } from '../../lib/insights';
import { dayKey } from '../../lib/stats';

export function SettingsPage({ data }: { data: UserData; name: string }) {
  const s = data.settings;
  const theme = useThemePref();
  const accent = useAccent();
  const file = useRef<HTMLInputElement>(null);
  const feedback = useFeedback();

  const exportJson = async () => {
    const r = await saveFile(`academic-weapon-backup-${dayKey(Date.now())}.json`, JSON.stringify(getData(), null, 2), 'application/json');
    if (r === 'saved') {
      setSettings({ lastExportAt: Date.now() });
      toast(isWeb ? 'Backup salvato' : 'Backup salvato in Download');
    }
    else if (r === 'unavailable') toast('Il salvataggio di file non è disponibile qui');
  };
  const importJson = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as UserData;
      if (!Array.isArray(d.sessions) || !d.settings) throw new Error();
      const ok = await confirmDialog({
        title: `Importare ${d.sessions.length} sessioni e ${d.subjects?.length ?? 0} esami?`,
        message: 'I dati attuali verranno sostituiti.',
        confirmLabel: 'Importa',
        destructive: true,
      });
      if (!ok) return;
      replaceData(d);
      toast('Dati importati');
    } catch {
      toast('File non valido');
    }
  };

  return (
    <>
      <PageHeader title="Impostazioni" subtitle={isWeb ? 'I tuoi dati restano in questo browser.' : 'Tutto resta su questo Mac.'} />
      <div className="settings">
        <Group title="Profilo">
          <Row label="Nome">
            <input className="in inline-field" value={s.name} placeholder="Il tuo nome" onChange={(e) => setSettings({ name: e.target.value })} />
          </Row>
        </Group>

        <Group title="Percorso" foot="Crediti, voti e periodi si adattano a qualsiasi percorso: università italiana, estera o un anno su misura.">
          <div className="row-block">
            <ProgramFields s={s} set={setSettings} />
          </div>
        </Group>

        <Group title="Obiettivi di studio">
          <div className="row-block">
            <GoalFields s={s} set={setSettings} />
          </div>
          <Row label="La settimana inizia di">
            <Seg<'1' | '0'>
              label="Primo giorno della settimana"
              value={String(s.weekStart) as '1' | '0'}
              onChange={(v) => setSettings({ weekStart: Number(v) as 0 | 1 })}
              options={[
                { id: '1', label: 'Lunedì' },
                { id: '0', label: 'Domenica' },
              ]}
            />
          </Row>
        </Group>

        <Group
          title="Periodo di monitoraggio"
          foot="Obiettivi e ritmo si calcolano su questo periodo. Senza una data d’inizio parte dalla tua prima sessione dell’anno accademico, così i mesi prima non contano come studio mancato. Senza una data di fine arriva al 31 agosto."
        >
          <Row label="Inizio">
            <input className="in inline-field" type="date" value={s.trackStart} max={s.trackEnd || undefined} onChange={(e) => setSettings({ trackStart: e.target.value })} />
          </Row>
          <Row label="Fine">
            <input className="in inline-field" type="date" value={s.trackEnd} min={s.trackStart || undefined} onChange={(e) => setSettings({ trackEnd: e.target.value })} />
          </Row>
          <Row label="In uso">
            <span className="row-value tnum">{periodText(data)}</span>
          </Row>
        </Group>

        <Group title="Giorni liberi" foot="Vacanze, viaggi, giorni d’esame: in questi giorni non c’è obiettivo e non si accumula ritardo.">
          {[...s.daysOff]
            .sort((x, y) => x.from.localeCompare(y.from))
            .map((d) => (
              <div className="row-item dayoff-row" key={d.id}>
                <input className="in" type="date" value={d.from} aria-label="Dal" onChange={(e) => e.target.value && saveDayOff(s.daysOff, { ...d, from: e.target.value, to: d.to < e.target.value ? e.target.value : d.to })} />
                <span className="row-hint">–</span>
                <input className="in" type="date" value={d.to} min={d.from} aria-label="Al" onChange={(e) => e.target.value && saveDayOff(s.daysOff, { ...d, to: e.target.value })} />
                <input className="in dayoff-label" defaultValue={d.label} placeholder="Es. vacanze di Natale" aria-label="Nome" onBlur={(e) => e.target.value !== d.label && saveDayOff(s.daysOff, { ...d, label: e.target.value.trim() })} />
                <button className="btn icon plain" aria-label="Elimina" onClick={() => setSettings({ daysOff: s.daysOff.filter((x) => x.id !== d.id) })}>
                  <IconTrash />
                </button>
              </div>
            ))}
          <button className="list-add" onClick={() => setSettings({ daysOff: [...s.daysOff, { id: uid(), from: dayKey(Date.now()), to: dayKey(Date.now()), label: '' }] })}>
            <IconPlus size={12} /> Aggiungi giorni liberi
          </button>
        </Group>

        <Group title="Attività" foot="Il tipo di lavoro di ogni sessione: si sceglie nel timer, a fine sessione e quando registri a mano.">
          {data.activities.map((a) => (
            <ActivityRow key={a.id} a={a} uses={data.sessions.filter((x) => x.activityId === a.id).length} />
          ))}
          <button
            className="list-add"
            onClick={() => saveActivity({ id: uid(), name: 'Nuova attività', color: ACTIVITY_COLORS[data.activities.length % ACTIVITY_COLORS.length] })}
          >
            <IconPlus size={12} /> Aggiungi attività
          </button>
        </Group>

        <Group title="Durante lo studio">
          <Toggle label="Schermo intero all’avvio del timer" hint="Esc per uscire, F per rientrare" checked={s.fullscreenOnStart} onChange={(v) => setSettings({ fullscreenOnStart: v })} />
          <Toggle
            label="Richiamo se la pausa si allunga"
            hint="Un secondo avviso se dopo la pausa non riparti"
            checked={s.breakNudgeMin > 0}
            onChange={(v) => setSettings({ breakNudgeMin: v ? 3 : 0 })}
          />
          <Toggle
            label="Scheda di fine sessione"
            hint="Esame, note e concentrazione; salvandola parte la pausa"
            checked={s.logAfterSession}
            onChange={(v) => setSettings({ logAfterSession: v })}
          />
          <Toggle label="Riparti automaticamente dopo la pausa" checked={s.autoFocus} onChange={(v) => setSettings({ autoFocus: v })} />
          <Toggle
            label="Notifiche"
            hint="Avvisa anche quando l’app è in secondo piano"
            checked={s.notify}
            onChange={async (v) => {
              if (v && !(await requestNotifications())) {
                return toast(isWeb ? 'Il browser non consente le notifiche in questa pagina' : 'Abilita le notifiche per Academic Weapon in Impostazioni di Sistema');
              }
              setSettings({ notify: v });
            }}
          />
        </Group>

        <Group title="Pomodoro">
          <Stepper label="Concentrazione" unit="min" value={s.focusMin} min={5} max={180} step={5} onChange={(v) => setSettings({ focusMin: v })} />
          <Stepper label="Pausa breve" unit="min" value={s.shortMin} min={1} max={60} step={1} onChange={(v) => setSettings({ shortMin: v })} />
          <Stepper label="Pausa lunga" unit="min" value={s.longMin} min={1} max={90} step={5} onChange={(v) => setSettings({ longMin: v })} />
          <Stepper label="Pausa lunga ogni" unit="pomodori" value={s.longEvery} min={2} max={12} step={1} onChange={(v) => setSettings({ longEvery: v })} />
        </Group>

        <Group title="Suoni" foot={isMacApp ? 'Sono i suoni di sistema di macOS.' : 'Nell’app per Mac vengono usati i suoni di sistema di macOS.'}>
          <SoundFields s={s} set={setSettings} />
        </Group>

        <Group title="Aspetto">
          <Row label="Tema">
            <Seg<ThemePref>
              label="Tema"
              value={theme}
              onChange={setThemePref}
              options={[
                { id: 'light', label: 'Chiaro' },
                { id: 'system', label: 'Automatico' },
                { id: 'dark', label: 'Scuro' },
              ]}
            />
          </Row>
          <Row label="Colore di evidenziazione">
            <div className="swatches" role="radiogroup" aria-label="Colore di evidenziazione">
              {ACCENTS.map((a) => (
                <button key={a.id} role="radio" title={a.label} aria-label={a.label} aria-checked={accent === a.id} style={{ background: a.hex }} onClick={() => setAccent(a.id)} />
              ))}
            </div>
          </Row>
        </Group>

        <Group
          title="Claude"
          foot={
            reviewChannel() === 'mac'
              ? 'La revisione settimanale invia ad Anthropic sessioni, note ed esami dell’ultima settimana, solo quando premi “Chiedi a Claude” in Statistiche › Revisione. Serve una chiave API (console.anthropic.com), a consumo: pochi centesimi a revisione. La chiave resta nel Portachiavi del Mac, fuori da backup ed esportazioni.'
              : reviewChannel() === 'claude.ai'
                ? 'La revisione settimanale invia a Claude sessioni, note ed esami dell’ultima settimana, solo quando premi “Chiedi a Claude” in Statistiche › Revisione, usando il tuo account Claude.'
                : 'Su questo sito l’app non contatta Claude. In Statistiche › Revisione puoi copiare il riepilogo della settimana e incollarlo tu in una chat.'
          }
        >
          {reviewChannel() ? (
            <Toggle label="Revisione settimanale con Claude" hint="Spenta: nessun dato lascia questo dispositivo" checked={s.reviewEnabled} onChange={(v) => setSettings({ reviewEnabled: v })} />
          ) : (
            <Row label="Revisione settimanale" hint="Solo con copia e incolla">
              <button className="btn" onClick={() => navigate('/statistiche')}>
                Apri
              </button>
            </Row>
          )}
          {reviewChannel() === 'mac' && s.reviewEnabled && <ClaudeKeyRow />}
        </Group>

        {isMacApp && (
          <Group title="Backup automatico" foot="Una copia di tutti i dati ogni giorno in cui usi l’app; restano gli ultimi 30 backup.">
            <Toggle label="Backup giornaliero" checked={s.autoBackup} onChange={(v) => setSettings({ autoBackup: v })} />
            <Row label="Cartella" hint={s.backupDir || 'Documenti › Academic Weapon Backup'}>
              <button className="btn" onClick={() => chooseFolder().then((dir) => dir && setSettings({ backupDir: dir }))}>
                Cambia…
              </button>
              <button className="btn" onClick={() => reveal(s.backupDir)}>
                Mostra
              </button>
            </Row>
            <Row label="Ultimo backup" hint={s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }) : 'mai'}>
              <button
                className="btn"
                onClick={async () => {
                  const r = await runBackup();
                  toast(r.ok ? 'Backup salvato' : `Backup non riuscito: ${r.error}`);
                }}
              >
                Esegui ora
              </button>
            </Row>
          </Group>
        )}

        {isWeb && inClaudeViewer() && (
          <Group title="Versione beta" foot="Questa è la versione di prova di Academic Weapon: si aggiorna da sola quando esce una novità.">
            <Row label="Feedback" hint={feedback.available ? 'Un commento su questa pagina, che arriva ad Alessio' : 'Usa i commenti di claude.ai su questa pagina'}>
              {feedback.available && (
                <button className="btn" onClick={(e) => feedback.open(e.currentTarget.closest('.group'))}>
                  Invia feedback
                </button>
              )}
            </Row>
          </Group>
        )}

        <Group title="Dati" foot={`${data.sessions.length} sessioni · ${data.subjects.length} esami · ${data.semesters.length} periodi.`}>
          <Row label="File di backup" hint="Esporta o importa tutti i dati in JSON">
            <button className="btn" onClick={exportJson}>
              <IconDownload size={12} /> Esporta
            </button>
            <button className="btn" onClick={() => file.current?.click()}>
              <IconUpload size={12} /> Importa
            </button>
            <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </Row>
          <Row label="Configurazione iniziale" hint="Rifai i passi del primo avvio">
            <button className="btn" onClick={() => setSettings({ setupDone: false })}>
              Ripeti
            </button>
          </Row>
        </Group>

        <Group title="Zona pericolosa" foot="Queste azioni non si possono annullare: fai prima un backup.">
          <Row label="Cancella tutte le sessioni" hint="Esami e periodi restano">
            <button
              className="btn destructive"
              onClick={async () => {
                if (await confirmDialog({ title: 'Cancellare tutte le sessioni?', message: 'Esami e periodi restano.', confirmLabel: 'Cancella sessioni', destructive: true })) {
                  update((d) => ({ ...d, sessions: [] }));
                  toast('Sessioni cancellate');
                }
              }}
            >
              Cancella sessioni
            </button>
          </Row>
          <Row label="Ricomincia da zero" hint="Cancella esami, periodi, sessioni e impostazioni">
            <button
              className="btn destructive"
              onClick={async () => {
                if (
                  await confirmDialog({
                    title: 'Cancellare tutto?',
                    message: 'Esami, periodi, sessioni e impostazioni. Non si può annullare: fai prima un backup.',
                    confirmLabel: 'Cancella tutto',
                    destructive: true,
                  })
                ) {
                  resetAll();
                  navigate('/', true);
                }
              }}
            >
              Cancella tutto
            </button>
          </Row>
        </Group>
      </div>
    </>
  );
}

/** System Settings–style group: caption above, rows in a rounded list, footnote below. */
const saveDayOff = (list: DayOff[], d: DayOff) => setSettings({ daysOff: list.map((x) => (x.id === d.id ? d : x)) });

const periodText = (data: UserData) => {
  const { start, end } = trackingPeriod(data);
  const f = (d: Date) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${f(start)} – ${f(new Date(end.getTime() - 1))}`;
};

function ClaudeKeyRow() {
  const [status, setStatus] = useState<{ set: boolean; hint: string } | null>(null);
  const [key, setKey] = useState('');
  useEffect(() => {
    claudeKeyStatus().then(setStatus);
  }, []);
  const save = async () => {
    const r = await claudeKeySet(key);
    if (!r.ok) return toast(`Chiave non salvata: ${r.error ?? ''}`);
    setKey('');
    setStatus(await claudeKeyStatus());
    toast('Chiave salvata nel Portachiavi');
  };
  if (status?.set)
    return (
      <Row label="Chiave API" hint={`Salvata nel Portachiavi (${status.hint})`}>
        <button
          className="btn destructive"
          onClick={async () => {
            await claudeKeyClear();
            setStatus(await claudeKeyStatus());
          }}
        >
          Rimuovi
        </button>
      </Row>
    );
  return (
    <Row label="Chiave API" hint="Incollala qui: viene cifrata e non resta nella pagina">
      <input className="in inline-field" type="password" autoComplete="off" value={key} placeholder="sk-ant-…" onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && key.trim() && save()} />
      <button className="btn" disabled={!key.trim()} onClick={save}>
        Salva
      </button>
    </Row>
  );
}

function ActivityRow({ a, uses }: { a: Activity; uses: number }) {
  const nextColor = () => saveActivity({ ...a, color: ACTIVITY_COLORS[(ACTIVITY_COLORS.indexOf(a.color) + 1) % ACTIVITY_COLORS.length] });
  const remove = async () => {
    if (uses) {
      const ok = await confirmDialog({
        title: `Eliminare “${a.name}”?`,
        message: `${uses} ${uses === 1 ? 'sessione resterà' : 'sessioni resteranno'} senza attività.`,
        confirmLabel: 'Elimina',
        destructive: true,
      });
      if (!ok) return;
    }
    deleteActivity(a.id);
  };
  return (
    <div className="row-item activity-row">
      <button className="swatch" style={{ background: a.color }} onClick={nextColor} aria-label="Cambia colore" title="Cambia colore" />
      <input className="in" defaultValue={a.name} aria-label="Nome dell’attività" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== a.name && saveActivity({ ...a, name: e.target.value.trim() })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      <span className="row-hint tnum">{uses ? `${uses} ${uses === 1 ? 'sessione' : 'sessioni'}` : ''}</span>
      <button className="btn icon plain" aria-label={`Elimina ${a.name}`} onClick={remove}>
        <IconTrash />
      </button>
    </div>
  );
}

function Group({ title, foot, children }: { title: string; foot?: string; children: ReactNode }) {
  return (
    <section className="group">
      <h2 className="group-title">{title}</h2>
      <div className="card list">{children}</div>
      {foot && <p className="group-foot">{foot}</p>}
    </section>
  );
}
