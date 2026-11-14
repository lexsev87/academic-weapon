// Academic Weapon for Claude: an MCP server (stdio) that Claude Desktop or Claude Code starts on
// this Mac. It reads the snapshot the app writes and leaves new entries in an inbox the app
// imports (right away if it is open, otherwise at the next launch). No network, no API key: Claude
// runs on the user's own Claude account. Launched as
//   ELECTRON_RUN_AS_NODE=1 "<Academic Weapon binary>" "<this file>"
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const DATA_DIR = process.env.AW_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'Academic Weapon');
const BRIDGE = path.join(DATA_DIR, 'claude-bridge');
const INBOX = path.join(BRIDGE, 'inbox');
const SNAPSHOT = path.join(BRIDGE, 'snapshot.json');
const LOCK = path.join(BRIDGE, 'app.pid');

/* ---------- reading what the app knows ---------- */
function snapshot() {
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  } catch {
    return null;
  }
}
function appRunning() {
  try {
    const pid = Number(fs.readFileSync(LOCK, 'utf8'));
    if (!pid) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function pending() {
  try {
    return fs
      .readdirSync(INBOX)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(fs.readFileSync(path.join(INBOX, f), 'utf8')));
  } catch {
    return [];
  }
}
function enqueue(type, payload) {
  fs.mkdirSync(INBOX, { recursive: true });
  const item = { id: payload.id || crypto.randomUUID(), type, payload, createdAt: Date.now() };
  const tmp = path.join(INBOX, `.${item.id}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(item));
  fs.renameSync(tmp, path.join(INBOX, `${item.id}.json`)); // the app only ever sees complete files
  return item;
}

/* ---------- helpers ---------- */
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const hhmm = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDur = (sec) => {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m} min`;
};
const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (t) => ({ content: [{ type: 'text', text: t }], isError: true });
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/** Finds an exam or activity by name: exact, then prefix, then contained. */
function match(list, name, kind) {
  const n = norm(name);
  if (!n) return { item: null };
  const by = (f) => list.filter((x) => f(norm(x.name)));
  for (const found of [by((x) => x === n), by((x) => x.startsWith(n)), by((x) => x.includes(n) || n.includes(x))]) {
    if (found.length === 1) return { item: found[0] };
    if (found.length > 1) return { error: `“${name}” corrisponde a più ${kind}: ${found.map((x) => x.name).join(', ')}. Usa il nome esatto.` };
  }
  return { error: `Nessun ${kind === 'esami' ? 'esame' : 'attività'} chiamato “${name}”. Disponibili: ${list.map((x) => x.name).join(', ') || 'nessuno'}.` };
}

/** The snapshot, with what Claude logged but the app has not imported yet already applied. */
function needSnapshot() {
  const s = snapshot();
  if (!s || !s.data) return { error: 'Academic Weapon non ha ancora condiviso i dati: apri l’app una volta sul Mac, poi riprova.' };
  const queued = pending();
  const known = new Set((s.data.sessions || []).map((x) => x.id));
  const added = queued.filter((p) => p.type === 'add_session' && !known.has(p.payload.id)).map((p) => ({ ...p.payload, pending: true }));
  const steps = new Map(queued.filter((p) => p.type === 'set_next_step').map((p) => [p.payload.subjectId, p.payload.nextStep]));
  s.data = {
    ...s.data,
    sessions: [...(s.data.sessions || []), ...added],
    subjects: (s.data.subjects || []).map((x) => (steps.has(x.id) ? { ...x, nextStep: steps.get(x.id) } : x)),
  };
  s.queued = queued.length;
  return { s };
}
const freshness = (s) => {
  const mins = Math.round((Date.now() - (s.writtenAt || 0)) / 60000);
  return appRunning() ? 'App aperta: i dati sono aggiornati.' : `App chiusa: dati aggiornati a ${mins < 60 ? `${mins} min fa` : new Date(s.writtenAt).toLocaleString('it-IT')}.`;
};

const server = new McpServer({ name: 'academic-weapon', version: '1.0.0' });

server.registerTool(
  'get_overview',
  {
    title: 'Situazione dello studio',
    description:
      "Returns the user's study tracker state from the Academic Weapon app: today's goal and study time, this week, the streak, open exams (with exam dates, hours studied and the saved 'next step'), activity types and the latest sessions. Call this first, before logging, to learn the exact exam and activity names.",
    annotations: { readOnlyHint: true },
  },
  async () => {
    const { s, error } = needSnapshot();
    if (error) return fail(error);
    const d = s.data;
    const now = Date.now();
    const sum = s.summary || {};
    const exams = (d.subjects || []).filter((x) => x.status !== 'passed');
    const total = (id) => (d.sessions || []).filter((x) => x.subjectId === id).reduce((a, x) => a + x.dur, 0);
    const name = (list, id) => (list || []).find((x) => x.id === id)?.name;
    const last = [...(d.sessions || [])].sort((a, b) => b.start - a.start).slice(0, 10);
    const todayKey = dayKey(now);
    const todayStudied = d.sessions.filter((x) => dayKey(x.start) === todayKey).reduce((a, x) => a + x.dur, 0);
    const lines = [
      `Oggi è ${new Date(now).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ore ${hhmm(now)}.`,
      freshness(s),
      '',
      `Oggi: ${fmtDur(todayStudied)} studiate${sum.todayGoal ? ` su un obiettivo di ${fmtDur(sum.todayGoal)}` : ' (giorno senza obiettivo)'}.`,
      `Settimana: ${fmtDur(sum.weekStudied || 0)}${sum.weekGoal ? ` su ${fmtDur(sum.weekGoal)}` : ''}.`,
      `Serie: ${sum.streak || 0} giorni di fila${sum.streakToday ? ' (oggi già conta)' : sum.streakRestToday ? ' (oggi è giorno libero)' : ` (oggi non conta ancora: servono ${sum.streakMinMin || 25} minuti)`}; record ${sum.streakBest || 0}.`,
      `Blocco di studio: ${d.settings?.focusMin ?? 50} minuti + ${d.settings?.shortMin ?? 10} di pausa.`,
      '',
      `Esami in corso (${exams.length}):`,
      ...exams.map(
        (x) =>
          `- ${x.name}: ${x.examDate ? `appello ${x.examDate}` : 'nessun appello'}; studiate ${fmtDur(total(x.id))}${x.targetHours ? ` su ${x.targetHours} h previste` : ''}${x.nextStep ? `; prossimo passo: ${x.nextStep}` : ''}`,
      ),
      '',
      `Attività: ${(d.activities || []).map((a) => a.name).join(', ') || 'nessuna'}.`,
      '',
      'Ultime sessioni:',
      ...(last.length
        ? last.map((x) => `- ${dayKey(x.start)} ${hhmm(x.start)}, ${fmtDur(x.dur)}, ${name(d.subjects, x.subjectId) || 'senza esame'}${name(d.activities, x.activityId) ? `, ${name(d.activities, x.activityId)}` : ''}${x.note ? `: ${x.note}` : ''}`)
        : ['- nessuna']),
    ];
    if (s.queued) lines.push('', `${s.queued} registrazioni fatte da Claude sono in attesa: compariranno quando l’app sarà aperta.`);
    return text(lines.join('\n'));
  },
);

server.registerTool(
  'log_session',
  {
    title: 'Registra una sessione di studio',
    description:
      "Logs a study session the user tells you about into Academic Weapon. Use the exam and activity names from get_overview. Give either minutes, or start and end. Dates and times are the user's local time. Confirm the details with the user if anything is unclear; never invent a session.",
    inputSchema: {
      exam: z.string().optional().describe('Exam name as listed by get_overview. Omit for study not tied to an exam.'),
      activity: z.string().optional().describe('Activity type (e.g. Esercizi, Lettura, Ripasso) as listed by get_overview.'),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Day of the session, YYYY-MM-DD. Defaults to today.'),
      start: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe('Start time HH:MM. Required for a past day; for today it defaults to "minutes" ago.'),
      end: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe('End time HH:MM, if known instead of minutes.'),
      minutes: z.number().int().min(1).max(600).optional().describe('Minutes of actual study (breaks excluded).'),
      break_minutes: z.number().int().min(0).max(300).optional().describe('Minutes of break between start and end, not counted as study.'),
      focus: z.number().int().min(1).max(5).optional().describe('Self-rated concentration 1-5, only if the user said it.'),
      note: z.string().max(500).optional().describe('What was studied, in the user’s words.'),
      allow_overlap: z.boolean().optional().describe('Set true only after the user confirmed logging over an existing session.'),
    },
    annotations: { destructiveHint: false, idempotentHint: false },
  },
  async (a) => {
    const { s, error } = needSnapshot();
    if (error) return fail(error);
    const d = s.data;
    const ex = match(d.subjects || [], a.exam, 'esami');
    if (ex.error) return fail(ex.error);
    const ac = match(d.activities || [], a.activity, 'attività');
    if (ac.error) return fail(ac.error);

    const today = dayKey(Date.now());
    const day = a.date || today;
    const [y, mo, dd] = day.split('-').map(Number);
    const at = (t) => {
      const [h, m] = t.split(':').map(Number);
      return new Date(y, mo - 1, dd, h, m).getTime();
    };
    const brk = (a.break_minutes || 0) * 60;
    let start;
    let dur;
    if (a.start && a.end) {
      start = at(a.start);
      let end = at(a.end);
      if (end <= start) end += 86400000; // past midnight
      dur = Math.round((end - start) / 1000) - brk;
    } else if (a.minutes) {
      dur = a.minutes * 60;
      if (a.start) start = at(a.start);
      else if (day === today) start = Date.now() - (dur + brk) * 1000;
      else return fail('Per un giorno passato serve l’ora d’inizio (start): chiedila all’utente.');
    } else return fail('Serve la durata: indica minutes, oppure start ed end.');
    if (!(dur >= 60)) return fail('La sessione deve durare almeno un minuto di studio.');
    if (dur > 12 * 3600) return fail('Più di 12 ore di studio in una sessione: controlla i dati con l’utente.');
    if (start > Date.now() + 60000) return fail('La sessione sarebbe nel futuro: si registrano solo sessioni già fatte.');

    const end = start + (dur + brk) * 1000;
    const all = d.sessions;
    const clash = all.find((x) => start < x.start + (x.dur + (x.breakSec || 0)) * 1000 && x.start < end);
    if (clash && !a.allow_overlap)
      return fail(
        `C’è già una sessione il ${dayKey(clash.start)} alle ${hhmm(clash.start)} (${fmtDur(clash.dur)}) che si sovrappone. Chiedi all’utente se è la stessa; se vuole comunque aggiungerla, richiama con allow_overlap: true.`,
      );

    const id = crypto.randomUUID();
    enqueue('add_session', {
      id,
      start,
      dur,
      breakSec: brk,
      subjectId: ex.item?.id ?? null,
      activityId: ac.item?.id ?? null,
      note: (a.note || '').trim(),
      focus: a.focus || 0,
      kind: 'manual',
    });
    return text(
      `Registrata: ${dayKey(start)} ${hhmm(start)}–${hhmm(end)}, ${fmtDur(dur)} di studio${brk ? ` (+${fmtDur(brk)} di pausa)` : ''}, ${ex.item?.name || 'senza esame'}${ac.item ? `, ${ac.item.name}` : ''}${a.focus ? `, concentrazione ${a.focus}/5` : ''}${a.note ? `, nota: ${a.note}` : ''}. ` +
        (appRunning() ? 'È già nell’app.' : 'Comparirà in Academic Weapon alla prossima apertura.'),
    );
  },
);

server.registerTool(
  'list_sessions',
  {
    title: 'Elenca le sessioni',
    description: 'Lists study sessions between two days (inclusive), optionally for one exam. Use it to answer questions about past study or to check before logging.',
    inputSchema: {
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('First day, YYYY-MM-DD.'),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Last day, YYYY-MM-DD. Defaults to today.'),
      exam: z.string().optional().describe('Only this exam.'),
    },
    annotations: { readOnlyHint: true },
  },
  async (a) => {
    const { s, error } = needSnapshot();
    if (error) return fail(error);
    const d = s.data;
    let subjectId;
    if (a.exam) {
      const ex = match(d.subjects || [], a.exam, 'esami');
      if (ex.error) return fail(ex.error);
      subjectId = ex.item.id;
    }
    const to = a.to || dayKey(Date.now());
    const name = (list, id) => (list || []).find((x) => x.id === id)?.name;
    const list = (d.sessions || [])
      .filter((x) => dayKey(x.start) >= a.from && dayKey(x.start) <= to && (subjectId === undefined || x.subjectId === subjectId))
      .sort((x, y) => x.start - y.start);
    const total = list.reduce((acc, x) => acc + x.dur, 0);
    const rows = list
      .slice(-200)
      .map(
        (x) =>
          `- ${dayKey(x.start)} ${hhmm(x.start)}, ${fmtDur(x.dur)}, ${name(d.subjects, x.subjectId) || 'senza esame'}${name(d.activities, x.activityId) ? `, ${name(d.activities, x.activityId)}` : ''}${x.focus ? `, concentrazione ${x.focus}/5` : ''}${x.note ? `: ${x.note}` : ''}${x.pending ? ' (in attesa di importazione)' : ''}`,
      );
    return text([`${list.length} sessioni dal ${a.from} al ${to}, in tutto ${fmtDur(total)}.`, ...(list.length > 200 ? ['(mostro le ultime 200)'] : []), ...rows, '', freshness(s)].join('\n'));
  },
);

server.registerTool(
  'set_next_step',
  {
    title: 'Salva da dove ripartire',
    description: "Saves where the user wants to pick up next time on an exam (e.g. 'esercizio 9 del cap. 5'). The app shows it when the user starts studying that exam.",
    inputSchema: {
      exam: z.string().describe('Exam name as listed by get_overview.'),
      next_step: z.string().max(200).describe('Where to pick up next time. Empty string clears it.'),
    },
  },
  async (a) => {
    const { s, error } = needSnapshot();
    if (error) return fail(error);
    const ex = match(s.data.subjects || [], a.exam, 'esami');
    if (ex.error) return fail(ex.error);
    if (!ex.item) return fail('Serve il nome dell’esame.');
    enqueue('set_next_step', { subjectId: ex.item.id, nextStep: a.next_step.trim() });
    return text(`Salvato per ${ex.item.name}: ${a.next_step.trim() || '(nessun prossimo passo)'}.`);
  },
);

server.registerTool(
  'get_weekly_review_data',
  {
    title: 'Dati per la revisione settimanale',
    description:
      "Returns the instructions and the last seven days of data for the user's weekly study review. Use it when the user asks for a review of their week, write the review following the instructions, show it, then offer to save it with save_weekly_review.",
    annotations: { readOnlyHint: true },
  },
  async () => {
    const { s, error } = needSnapshot();
    if (error) return fail(error);
    if (!s.review) return fail('Questi dati non sono ancora disponibili: aggiorna Academic Weapon e aprilo una volta.');
    return text(`${s.review}\n\n${freshness(s)}`);
  },
);

server.registerTool(
  'save_weekly_review',
  {
    title: 'Salva la revisione settimanale',
    description: 'Saves a weekly review you wrote into the app (Statistiche › Revisione), so the user can find it later. Only after the user agreed.',
    inputSchema: { text: z.string().min(20).max(6000).describe('The review text, with "## " headings and "- " lists.') },
  },
  async (a) => {
    enqueue('save_review', { text: a.text, at: Date.now() });
    return text(appRunning() ? 'Revisione salvata in Statistiche › Revisione.' : 'Revisione salvata: la trovi in Statistiche › Revisione alla prossima apertura dell’app.');
  },
);

server.connect(new StdioServerTransport()).catch((err) => {
  process.stderr.write(`academic-weapon mcp: ${err && err.message ? err.message : err}\n`);
  process.exit(1);
});
