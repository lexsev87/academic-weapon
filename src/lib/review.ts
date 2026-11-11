import { focusInsights, periodSummary } from './insights';
import { askClaudeNative, hasNativeClaude } from './native';
import { claudeUse, inClaudeViewer } from './platform';
import { dayPlan } from './plan';
import { addDays, dayKey, fmtDur, fmtTime, goalFor, isDayOff, parseDayKey, startOfDay } from './stats';
import { uid, update, type Review, type UserData } from './store';

/* The weekly review: Claude reads the last seven days and writes half a page. Nothing is sent
   unless the user asks for it; the exact text that leaves the device is `reviewData`, shown in the UI. */

const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const day = (d: Date | number) => new Date(d).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const one = (v: number) => v.toFixed(1).replace('.', ',');

export const REVIEW_INSTRUCTIONS = `Sei il tutor di studio di uno studente universitario. Qui sotto trovi i dati del suo tracker di studio per gli ultimi sette giorni, con un po' di contesto.

Scrivi una revisione settimanale in italiano, dandogli del tu, lunga al massimo 300 parole, in testo semplice con questa struttura esatta (titoli preceduti da "## ", elenchi con "- "):

## Com'è andata
Due o tre frasi: quanto ha studiato rispetto all'obiettivo e cosa ha funzionato. Parti dai fatti, senza complimenti di circostanza.

## Cosa noto
Due o tre osservazioni concrete che un grafico non mostra: collega orari, attività, concentrazione, pause e note delle sessioni. Ogni osservazione cita il dato su cui si basa. Se i dati sono pochi per dire qualcosa, dillo invece di inventare.

## Per la prossima settimana
Tre azioni al massimo, specifiche e verificabili (quale esame, quando, quanti blocchi), che tengano conto degli appelli e dei prossimi passi annotati.

Regole: usa solo i dati forniti; non dare consigli generici sullo studio; non proporre premi, serie o punteggi; se gli esami chiedono più ore di quelle previste dagli obiettivi, dillo chiaramente e proponi cosa tagliare o spostare.`;

/** The data sent with a review request, as plain text the user can read before sending. */
export function reviewData(data: UserData, now = new Date()): string {
  const { settings: s, sessions, subjects, activities } = data;
  const today0 = startOfDay(now);
  const from = addDays(today0, -6);
  const to = addDays(today0, 1);
  const week = sessions.filter((x) => x.start >= from.getTime() && x.start < to.getTime());
  const sub = (id: string | null) => subjects.find((x) => x.id === id)?.name ?? 'senza esame';
  const act = (id: string | null) => activities.find((x) => x.id === id)?.name ?? '';
  const L: string[] = [];

  L.push(`Oggi: ${now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`);
  if (s.programType || s.degree) L.push(`Percorso: ${[s.programType, s.degree].filter(Boolean).join(', ')}`);
  L.push(`Metodo: blocchi da ${s.focusMin} minuti di studio + ${s.shortMin} di pausa.`);
  L.push(`Obiettivo giornaliero di studio: ${[1, 2, 3, 4, 5, 6, 0].map((i) => `${WEEKDAYS[i]} ${fmtDur(goalFor({ ...s, daysOff: [] }, addDays(today0, (i - today0.getDay() + 7) % 7)), true) || '0'}`).join(', ')}.`);
  const off = s.daysOff.filter((x) => (x.to || x.from) >= dayKey(from)).sort((a, b) => a.from.localeCompare(b.from));
  if (off.length) L.push(`Giorni liberi: ${off.map((x) => `${day(parseDayKey(x.from))}${x.to && x.to !== x.from ? `–${day(parseDayKey(x.to))}` : ''}${x.label ? ` (${x.label})` : ''}`).join('; ')}.`);

  L.push('', 'ULTIMI 7 GIORNI (studiato / obiettivo)');
  let studied = 0;
  let goal = 0;
  for (let d = from; d < to; d = addDays(d, 1)) {
    const sec = week.filter((x) => dayKey(x.start) === dayKey(d)).reduce((a, x) => a + x.dur, 0);
    const g = goalFor(s, d);
    studied += sec;
    goal += g;
    L.push(`- ${day(d)}: ${sec ? fmtDur(sec) : 'niente'} / ${isDayOff(s, d) ? 'giorno libero' : g ? fmtDur(g) : 'nessun obiettivo'}`);
  }
  L.push(`Totale: ${fmtDur(studied)} su ${fmtDur(goal)}.`);

  L.push('', `SESSIONI DELLA SETTIMANA (${week.length})`);
  if (!week.length) L.push('Nessuna sessione.');
  for (const x of week)
    L.push(
      `- ${day(x.start)} ${fmtTime(x.start)}, ${fmtDur(x.dur)}, ${sub(x.subjectId)}${act(x.activityId) ? `, ${act(x.activityId)}` : ''}` +
        `${x.focus ? `, concentrazione ${x.focus}/5` : ''}${x.pauses ? `, ${x.pauses} ${x.pauses === 1 ? 'pausa' : 'pause'}` : ''}${x.note ? `, nota: ${x.note.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`,
    );

  const plan = dayPlan(data, now);
  const open = subjects.filter((x) => x.status !== 'passed');
  L.push('', `ESAMI IN PREPARAZIONE (${open.length})`);
  for (const x of open) {
    const total = sessions.filter((y) => y.subjectId === x.id).reduce((a, y) => a + y.dur, 0);
    const inWeek = week.filter((y) => y.subjectId === x.id).reduce((a, y) => a + y.dur, 0);
    const days = x.examDate ? Math.round((parseDayKey(x.examDate).getTime() - today0.getTime()) / 86400000) : null;
    const row = plan.rows.find((r) => r.subject.id === x.id);
    L.push(
      `- ${x.name}: ${days === null ? 'nessun appello fissato' : days < 0 ? 'appello passato' : `appello tra ${days} giorni`}; ` +
        `studiate ${one(total / 3600)} h${x.targetHours ? ` su ${x.targetHours} previste` : ''}; questa settimana ${inWeek ? fmtDur(inWeek) : 'niente'}` +
        `${row?.needPerDay ? `; servono ${fmtDur(row.needPerDay)} per giorno di studio` : ''}${x.nextStep ? `; prossimo passo annotato: ${x.nextStep.slice(0, 160)}` : ''}`,
    );
  }
  if (plan.demand > 0) L.push(`In tutto gli esami chiedono ${fmtDur(plan.demand)} per giorno di studio; gli obiettivi ne prevedono ${fmtDur(plan.capacity)}.`);

  const p = periodSummary(data, now);
  L.push('', `ULTIME 4 SETTIMANE: studiate ${one(p.recentStudied / 3600)} h su ${one(p.recentGoal / 3600)} h di obiettivo (${p.recentDays} giorni considerati).`);

  const f = focusInsights(data, to.getTime() - 90 * 86400000, to.getTime());
  if (f.rated >= 3) {
    L.push('', `CONCENTRAZIONE, ULTIMI 90 GIORNI (${f.rated} sessioni valutate, media ${one(f.avg)}/5)`);
    const line = (name: string, groups: { label: string; avg: number; n: number }[]) => groups.length && L.push(`- ${name}: ${groups.map((g) => `${g.label} ${one(g.avg)} (${g.n})`).join(', ')}`);
    line('per momento della giornata', f.byTime);
    line('per attività', f.byActivity);
    line('per ordine del blocco nel giorno', f.byOrder);
    if (f.pausesPerBlock > 0) L.push(`- pause: in media ${one(f.pausesPerBlock)} per blocco`);
  }
  return L.join('\n');
}

/** Instructions and data in one text: what "Copia per Claude" puts on the clipboard and what the web beta sends. */
export const reviewPrompt = (data: UserData, now = new Date()) => `${REVIEW_INSTRUCTIONS}\n\n--- DATI ---\n${reviewData(data, now)}`;

export type ReviewChannel = 'mac' | 'claude.ai' | null;
/** How this copy of the app can reach Claude by itself (the copy button works everywhere). */
export const reviewChannel = (): ReviewChannel => (hasNativeClaude ? 'mac' : inClaudeViewer() ? 'claude.ai' : null);

export type ReviewError = { code: 'no-key' | 'auth' | 'rate' | 'network' | 'refused' | 'declined' | 'unavailable' | 'cancelled' | 'other'; message?: string };
export const REVIEW_ERROR_TEXT: Record<ReviewError['code'], string> = {
  'no-key': 'Manca la chiave API: aggiungila in Impostazioni › Claude.',
  auth: 'La chiave API non è valida. Controllala in Impostazioni › Claude.',
  rate: 'Hai raggiunto un limite d’uso di Claude. Riprova più tardi.',
  network: 'Non riesco a raggiungere Claude: controlla la connessione.',
  refused: 'Claude non ha risposto a questa richiesta.',
  declined: 'Non hai dato il permesso di usare Claude da questa pagina.',
  unavailable: 'Qui Claude non è disponibile: usa “Copia per Claude”.',
  cancelled: '',
  other: 'Qualcosa non ha funzionato. Riprova tra poco.',
};

type Sample = (input: string, opts?: { onText?: (u: { text: string }) => void; signal?: AbortSignal; cache?: boolean }) => Promise<{ text: string; truncated: boolean }>;

/** Asks Claude for the review. Resolves with the text, or rejects with a ReviewError. */
export async function askReview(data: UserData, opts: { onText?: (text: string) => void; signal?: AbortSignal } = {}): Promise<string> {
  const channel = reviewChannel();
  if (channel === 'mac') {
    const r = await askClaudeNative(REVIEW_INSTRUCTIONS, reviewData(data));
    if (r.ok) return r.text;
    throw { code: r.code, message: r.message } satisfies ReviewError;
  }
  if (channel === 'claude.ai') {
    const sample = await claudeUse<Sample>('sample');
    if (!sample) throw { code: 'unavailable' } satisfies ReviewError;
    try {
      const r = await sample(reviewPrompt(data), { onText: (u) => opts.onText?.(u.text), signal: opts.signal, cache: false });
      return r.text;
    } catch (e) {
      const code = (e as { code?: string })?.code;
      const map: Record<string, ReviewError['code']> = {
        cancelled: 'cancelled',
        not_granted: 'declined',
        sampling_disabled: 'unavailable',
        not_declared: 'unavailable',
        capability_disabled: 'unavailable',
        capability_removed: 'unavailable',
        rate_limited: 'rate',
        refused: 'refused',
      };
      throw { code: map[code ?? ''] ?? 'other' } satisfies ReviewError;
    }
  }
  throw { code: 'unavailable' } satisfies ReviewError;
}

/** Keeps the review with the data (the last 12 stay). */
export function saveReview(text: string, now = new Date()): Review {
  const r: Review = { id: uid(), at: now.getTime(), weekStart: dayKey(addDays(startOfDay(now), -6)), text: text.trim() };
  update((d) => ({ ...d, reviews: [r, ...d.reviews].slice(0, 12) }));
  return r;
}
export const deleteReview = (id: string) => update((d) => ({ ...d, reviews: d.reviews.filter((r) => r.id !== id) }));
