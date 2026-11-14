import { useEffect, useRef, useState } from 'react';
import { IconTrash } from '../../components/Icons';
import { confirmDialog, Section, toast } from '../../components/UI';
import { askReview, deleteReview, REVIEW_ERROR_TEXT, reviewChannel, reviewData, reviewPrompt, saveReview, type ReviewError } from '../../lib/review';
import { navigate } from '../../lib/router';
import { addDays, parseDayKey } from '../../lib/stats';
import type { Review, UserData } from '../../lib/store';

/** Renders the review's plain text: "## " headings, "- " lists, paragraphs. Never as HTML. */
function ReviewText({ text }: { text: string }) {
  const blocks: JSX.Element[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((t, i) => <li key={i}>{t}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/\*\*/g, '');
    if (!line) flush();
    else if (/^#{1,3}\s/.test(line)) {
      flush();
      blocks.push(<h4 key={blocks.length}>{line.replace(/^#{1,3}\s+/, '')}</h4>);
    } else if (/^[-•]\s/.test(line)) list.push(line.replace(/^[-•]\s+/, ''));
    else {
      flush();
      blocks.push(<p key={blocks.length}>{line}</p>);
    }
  }
  flush();
  return <div className="review-text">{blocks}</div>;
}

const weekLabel = (r: Review) => {
  const from = parseDayKey(r.weekStart);
  const f = (d: Date) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  return `${f(from)} – ${f(addDays(from, 6))}`;
};

/** Weekly review written by Claude: off until the user turns it on, and always shows what it sends. */
export function ReviewPanel({ data }: { data: UserData }) {
  const channel = reviewChannel();
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState('');
  const [error, setError] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => ctl.current?.abort();
  }, [channel]);

  const ask = async () => {
    ctl.current = new AbortController();
    setBusy(true);
    setError('');
    setLive('');
    try {
      const text = await askReview(data, { onText: setLive, signal: ctl.current.signal });
      saveReview(text);
      setLive('');
    } catch (e) {
      const err = e as ReviewError;
      if (err.code !== 'cancelled') setError(REVIEW_ERROR_TEXT[err.code] ?? REVIEW_ERROR_TEXT.other);
      setLive('');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reviewPrompt(data));
      toast('Copiato: incollalo in una chat con Claude');
    } catch {
      toast('Non riesco a copiare: seleziona il testo qui sotto');
    }
  };

  const remove = async (r: Review) => {
    if (await confirmDialog({ title: 'Eliminare questa revisione?', confirmLabel: 'Elimina', destructive: true })) deleteReview(r.id);
  };

  const canAsk = channel === 'claude.ai';
  const [latest, ...older] = data.reviews;

  return (
    <>
      <Section title="Revisione settimanale" note="scritta da Claude sugli ultimi 7 giorni">
        <div className="card pad review-intro">
          <p>
            Claude legge le sessioni, le note, la concentrazione e gli appelli dell’ultima settimana e ti scrive mezza pagina: com’è andata, cosa nota, tre cose da fare la settimana prossima.
          </p>
          <div className="review-actions">
            {canAsk && (
              <button className="btn primary" onClick={ask} disabled={busy}>
                {busy ? 'Claude sta scrivendo…' : 'Chiedi a Claude'}
              </button>
            )}
            {busy && channel === 'claude.ai' && (
              <button className="btn" onClick={() => ctl.current?.abort()}>
                Ferma
              </button>
            )}
            {channel === 'mac' && (
              <button className="btn" onClick={() => navigate('/impostazioni')}>
                Collegamento a Claude
              </button>
            )}
            <button className="btn" onClick={copy}>
              Copia per Claude
            </button>
            <button className="btn plain" onClick={() => setPasting((v) => !v)}>
              Incolla una risposta
            </button>
          </div>
          <p className="secondary">
            {channel === 'mac'
              ? 'Con Claude collegato (Impostazioni › Claude), scrivi in una chat: “fammi la revisione della settimana su Academic Weapon”. Claude legge i dati qui sotto, ti risponde e, se vuoi, salva qui la revisione. Usa il tuo account Claude, senza costi in più.'
              : channel === 'claude.ai'
                ? 'Con “Chiedi a Claude” i dati qui sotto vengono inviati a Claude con il tuo account, che ne conta l’uso. Niente parte senza che tu prema il pulsante.'
                : 'Da qui l’app non può contattare Claude: copia il testo, incollalo in una chat con Claude e, se vuoi conservarla, incolla qui la risposta.'}
          </p>
          {error && (
            <p className="review-error" role="alert">
              {error}
            </p>
          )}
          {pasting && (
            <div className="review-paste">
              <textarea className="in" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Incolla qui la risposta di Claude" rows={6} />
              <button
                className="btn"
                disabled={!pasted.trim()}
                onClick={() => {
                  saveReview(pasted);
                  setPasted('');
                  setPasting(false);
                }}
              >
                Salva revisione
              </button>
            </div>
          )}
          <details className="review-data">
            <summary>Cosa viene inviato</summary>
            <pre>{reviewData(data)}</pre>
          </details>
        </div>
      </Section>

      {(busy || live) && (
        <Section title="In scrittura">
          <div className="card pad">{live ? <ReviewText text={live} /> : <p className="secondary">Claude sta leggendo la tua settimana…</p>}</div>
        </Section>
      )}

      {latest && (
        <Section
          title={`Settimana ${weekLabel(latest)}`}
          note={new Date(latest.at).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
          accessory={
            <button className="btn icon plain" aria-label="Elimina revisione" onClick={() => remove(latest)}>
              <IconTrash />
            </button>
          }
        >
          <div className="card pad">
            <ReviewText text={latest.text} />
          </div>
        </Section>
      )}
      {older.length > 0 && (
        <Section title="Revisioni precedenti">
          <div className="card list">
            {older.map((r) => (
              <details className="review-old" key={r.id}>
                <summary>
                  Settimana {weekLabel(r)}
                  <button
                    className="btn icon plain"
                    aria-label="Elimina revisione"
                    onClick={(e) => {
                      e.preventDefault();
                      remove(r);
                    }}
                  >
                    <IconTrash />
                  </button>
                </summary>
                <ReviewText text={r.text} />
              </details>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
