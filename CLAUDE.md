# Academic Weapon

Tracker dello studio personale di Alessio. Nasce come app per Mac (Electron); dallo stesso codice escono anche una versione web pubblica e una beta su claude.ai. I dati restano in locale: sul Mac o nel browser di chi usa la versione web.

## Come si compila e si prova

- Node **non** è nel PATH: sta in `~/.craft-node`. Prima di ogni comando: `export PATH="$HOME/.craft-node/bin:$PATH"`.
- Controllo dei tipi: `npx tsc --noEmit`. Test dei calcoli: `npm test` (Vitest, `src/lib/__tests__/`); girano anche dentro `npm run build` e `npm run web`. Ogni nuovo calcolo in `stats`, `insights` o `plan` va coperto da un test.
- Anteprima nel browser: config `academic-weapon` in `.claude/launch.json` (Vite su porta 5174). Nel browser i suoni sono sintetizzati e le funzioni native (schermo intero, barra dei menu, backup) non fanno nulla.
- App per Mac: `npm run desktop` → build Vite + pacchetto Electron in `Academic Weapon.app` (in questa cartella). Prima chiudere l'app aperta: `osascript -e 'quit app "Academic Weapon"'`, poi riaprirla con `open "Academic Weapon.app"`.
- **La cartella sta in Documenti, sincronizzata con iCloud**: quando una compilazione sostituisce dei file, iCloud può lasciare copie di conflitto con " 2", " 3" nel nome (anche `Academic Weapon 2.app`). Non vanno mai committate: sono ignorate da `.gitignore`; si spostano nel Cestino.
- I dati veri dell'utente stanno nel localStorage dell'app Electron (`~/Library/Application Support/Academic Weapon`), chiave `aw:data`. Nell'anteprima del browser si possono usare dati finti senza toccarli.

## Versione web beta (sincronizzata con l'app Mac)

- Stesso codice, due target: `npm run desktop` (Mac) e `npm run web` (pagina unica in `dist-web/academic-weapon.html`, `VITE_TARGET=web` da `.env.web`). `npm run release` li fa entrambi.
- Pubblicata come Artifact: https://claude.ai/artifact/832KQJA8oS2jQR7sfFhNCt (capabilities `downloads: true`, `comments: {composer_only: true}`, `sample: {}` per la revisione con Claude).
- **Versione pubblica senza login**: https://lexsev87.github.io/academic-weapon/ (repository pubblico `lexsev87/academic-weapon`, GitHub Pages). Il flusso `.github/workflows/pages.yml` la ricostruisce e ripubblica a ogni push su `main`.
- **Dopo ogni modifica all'app**: `npm run release` (app Mac + pagina claude.ai), ripubblicare `dist-web/academic-weapon.html` sull'Artifact (Artifact tool con `url`, senza `icon` né `capabilities`), poi commit e push su `main` per aggiornare il sito pubblico. Chi ha la pagina aperta riceve l'aggiornamento da solo.
- I commit sono firmati con l'indirizzo anonimo GitHub (`git config user.email` locale): non usare altre email, il repository è pubblico.
- Sul web: router in memoria, niente `confirm()`/download diretti (usare `confirmDialog` e `saveFile` di `lib/platform.ts`), storage solo tramite `readStore`/`writeStore`, tema con l'attributo proprio `data-appearance` (il visualizzatore usa `data-theme`), layout da telefono sotto 720 px con tab bar. I dati di ogni beta tester restano nel suo browser; il feedback arriva come commenti sulla pagina.

## Struttura

- `src/lib/store.ts` – modello dati (`UserData`: settings, semesters, subjects, activities, sessions, reviews, timer; ogni sessione ha esame **e** attività, `breakSec`, `pauses`/`pausedSec`; ogni esame ha `nextStep`), salvataggio in `localStorage['aw:data']`, `normalize()` migra i salvataggi vecchi. Ogni nuovo campo va aggiunto ai default **e** gestito in `normalize`. **Rete di sicurezza**: un salvataggio illeggibile non viene mai sovrascritto: finisce in `aw:data:broken`, si ripristina la copia buona del giorno (`aw:data:prev`) e `Notices` avvisa l'utente; lo stesso se la scrittura fallisce.
- `src/lib/stats.ts` – calcoli: totali, obiettivi (`goalFor`, blocchi), libretto (`career`: medie su qualsiasi scala, base di laurea /110 solo per i trentesimi), ritmo per esame (`pacePerDay`).
- `src/lib/insights.ts` – periodo di monitoraggio (`trackingPeriod(data)`: parte dalla **prima sessione** dell'anno accademico se non c'è una data impostata), `periodSummary` (ritardo e ritmo giudicati sulle **ultime 4 settimane**, `RECENT_DAYS`; ritmo previsto = media degli obiettivi delle settimane a venire), `focusInsights` (concentrazione per orario, attività, ordine del blocco, pause), `rangeInsights` per giorno/settimana/mese, `trendSeries` (studiato meno obiettivo, cumulato), `byActivity`, `pivot` (tabelle incrociate), `subjectInsights` (scheda esame).
- `src/lib/plan.ts` – `dayPlan`: quanto serve per giorno di studio a ogni esame fino all'appello e se gli esami chiedono più di quanto prevedono gli obiettivi. Usato **solo** come dato nella revisione settimanale: l'app non propone più un piano (l'utente sceglie cosa studiare).
- `src/lib/streak.ts` – serie di giorni: un giorno conta con almeno 25 minuti (`STREAK_MIN_MIN`); giorni liberi e giorni senza obiettivo non la rompono (studiarci la allunga); oggi non la rompe finché non finisce. Record e traguardi (`MILESTONES`).
- `src/lib/review.ts` – revisione settimanale: `reviewData` (il testo che Claude legge, mostrato all'utente) e istruzioni. Canali: `mac` = Claude collegato via MCP (l'utente la chiede in chat); `claude.ai` = capability `sample` sull'account di chi guarda; sito pubblico = copia e incolla.
- **Claude via MCP (solo app Mac)**: `desktop/mcp.cjs` è un server MCP stdio che Claude Desktop o Claude Code avviano come `ELECTRON_RUN_AS_NODE=1 "<binario dell'app>" "<…/Resources/app/mcp.cjs>"`. Strumenti: `get_overview`, `log_session`, `list_sessions`, `set_next_step`, `get_weekly_review_data`, `save_weekly_review`. Scambio solo tramite file in `~/Library/Application Support/Academic Weapon/claude-bridge/`: l'app scrive `snapshot.json` (dati + riepilogo + testo della revisione, `lib/claudeBridge.ts`) e `app.pid`; il server lascia voci in `inbox/` che l'app importa (subito se aperta, altrimenti al prossimo avvio) e poi cancella; le sessioni hanno un id, quindi importarle due volte non le duplica. "Collega" in Impostazioni aggiunge la voce a `claude_desktop_config.json` (tenendo le altre e salvando una copia `.academic-weapon.bak`). Per provare senza toccare i dati veri: `AW_USER_DATA` (profilo dell'app), `AW_DATA_DIR` (cartella letta dal server) e `AW_CLAUDE_CONFIG` (file di configurazione di Claude).
- `src/lib/timer.ts` – motore del timer, flusso pomodoro (fine blocco → scheda di fine sessione `pending` → pausa), stato della vista a schermo intero (`setFocusView`).
- `src/lib/native.ts` – ponte verso macOS (`window.aw`, definito in `desktop/preload.cjs`): suoni di sistema, timer nella barra dei menu, schermo intero, rimbalzo nel Dock, backup.
- `src/lib/backup.ts` – backup automatico giornaliero (solo app Mac).
- `src/pages/app/` – pagine: `Shell` (finestra, barra laterale, ⌘1–7, nella barra in alto pillola del timer e "+ Sessione"), `Dashboard` (Oggi, volutamente corta: obiettivo del giorno con la **serie**, "Cosa studi?" con gli esami da avviare a scelta, appelli, sessioni recenti), `TimerPage` (Focus), `FocusOverlay` (schermo intero + scheda di fine sessione), `SessionsPage` (registrazione a mano + storico con filtri, selezione multipla, tabella/schede), `Sessions` (`SessionForm` con inizio/fine/pausa condiviso, `SessionModal`, elenco, CSV), `CalendarPage` (giorno/settimana/mese/elenco + riepilogo del periodo visibile), `ExamsPage` + `ExamDetail` (scheda di ogni esame), `StatsPage` (Andamento = `PeriodPanel` + `FocusInsights`, Grafici, Tabelle = `PivotTables`, Revisione = `ReviewPanel`), `SettingsPage` (anche attività, periodo di monitoraggio, giorni liberi, Claude), `Setup`.
- `src/components/Celebration.tsx` – piccole ricompense: toast quando oggi conta per la serie o l'obiettivo è raggiunto, scheda a ogni traguardo della serie (ognuna una sola volta, via `streakToastDay`, `goalToastDay`, `milestoneShown`).
- `src/components/Notices.tsx` – avvisi sui dati (salvataggio illeggibile, scrittura fallita, promemoria di backup fuori dall'app Mac); `Charts.tsx` ha anche `TrendChart`, `Donut`, `GoalBars`.
- `src/components/Prefs.tsx` – blocchi di impostazioni condivisi da Setup e Impostazioni (percorso, obiettivi, suoni).
- `src/styles/` – `base.css` (token colore, tema chiaro/scuro, accenti macOS); `app.css` è solo l'elenco ordinato degli `@import` dei file per area (`shell`, `foundation`, `controls`, `today`, `focus`, `calendar`, `charts`, `responsive`, `sessions`, `period`, `review`…). L'ordine conta: le regole responsive vengono dopo i layout che adattano.
- `desktop/` – shell Electron: `main.cjs` (finestra, protocollo `app://`, IPC), `preload.cjs`, `pack.mjs`.
- `design/logo-source.webp` – logo (drago con occhiali che legge un libro e sputa formule, in biblioteca), unica fonte. `./scripts/make-icons.sh` lo ritaglia nella forma arrotondata macOS sulla griglia 824/1024 con ombra e genera `src/assets/logo.png` (256 px, interfaccia), `public/icon.png` (favicon) e `desktop/icon.icns`. Per cambiare logo: sostituire il file sorgente e rilanciare lo script.

## Decisioni da rispettare

- **Stile Apple, minimal ma colorato**: font di sistema, barra laterale traslucida (vibrancy), liste raggruppate, icone colorate come in Impostazioni di macOS. Tema scuro blu notte, non grigio piatto. Interfaccia tutta in **italiano**.
- **Niente login. Gamification leggera** (scelta dell'utente, 14 nov 2026): serie di giorni con fiamma, record, traguardi con una scheda di festeggiamento, toast quando oggi conta. Niente punti, livelli, classifiche o medaglie da collezionare.
- **Percorso flessibile**: tipo di percorso, crediti (CFU/ECTS/nessuno), scala dei voti e nome dei periodi sono configurabili. Non dare per scontata l'università italiana (l'utente fa un anno quantitativo su misura).
- **Pomodoro 50+10** di default. L'obiettivo giornaliero si conta **in blocchi pausa inclusa** (4 h = 4 blocchi da 50 min), con obiettivi diversi per feriali e weekend.
- **Flusso di studio**: play → schermo intero → a fine blocco scheda di fine sessione (esame, note, concentrazione 1–5, durata) → poi parte la pausa. Suoni distinti per fine studio e fine pausa (suoni di sistema macOS).
- **Schermo intero**: usare `setSimpleFullScreen` (istantaneo) nascosto dietro una dissolvenza; **non** lo schermo intero nativo (scorre in un altro Spazio) e **non** animare le dimensioni della finestra o `clip-path` (scatta). Animare solo `opacity`/`transform`.
- **Electron e zone trascinabili**: le zone `-webkit-app-region: drag` intercettano i clic anche sotto gli overlay. Niente zone trascinabili sopra pulsanti; con l'overlay aperto, la classe `html.focus-open` le disattiva.
- Prima di dire che qualcosa funziona nell'app per Mac, provarla davvero (anteprima nel browser ≠ finestra Electron).
- **Obiettivi che non scoraggiano**: niente debito cumulato da inizio anno. Ritardo e ritmo si guardano sulle ultime 4 settimane; i giorni liberi (`settings.daysOff`) non hanno obiettivo; il periodo parte dalla prima sessione.
- **Oggi resta corta**: risponde a "cosa faccio adesso". Le analisi stanno in Statistiche.
- **L'utente decide cosa studiare**: niente piano suggerito né esami assegnati in Oggi.
- **Claude senza chiave API né costi aggiuntivi**: si collega all'app via MCP e lavora sull'account Claude dell'utente; legge i dati e registra sessioni solo quando l'utente lo chiede in una chat. Niente chat dentro l'app e niente chiamate di rete dall'app verso Claude. Piano, ritmo e analisi della concentrazione restano calcoli in codice.
- Backup automatico **giornaliero** nell'app Mac (ultimi 30).

## Sistema di design (skill apple-design, emil-design-eng, animate)

- Token in `src/styles/base.css`: scala tipografica con tracking e interlinea per dimensione (`--t-*`), spaziature `--s*` in rem, raggi `--r-*`, colori semantici macOS (`--label`, `--label-2/3/4`, `--separator`, `--fill`…), materiali (`--material-bar`, blur) e movimento (`--ease-out`, `--ease-in-out`, `--ease-drawer`, `--d-*`). Usare questi, non valori sciolti.
- Componenti condivisi in `src/components/UI.tsx`: `PageHeader` (titolo grande; il titolo compatto compare nella toolbar traslucida quando scorre via), `Section`, `Metric`, `Modal` (figli come funzione `(close) => …` per la chiusura animata), `Seg` (cursore che scorre), `Stepper`, toast.
- Movimento: solo `transform`/`opacity`; curve personalizzate; UI sotto 300 ms; uscite più veloci delle entrate; niente `transition: all`; niente animazioni su navigazione e azioni da tastiera (Esc chiude i modali all'istante); hover solo con `@media (hover: hover) and (pointer: fine)`; feedback alla pressione con `scale(0.97)`; sempre varianti per `prefers-reduced-motion` e `prefers-reduced-transparency`.
- Attenzione ai nomi di classe generici: `.today` collideva col calendario (ora la Home usa `.today-card`).

## Idee messe da parte

- Salvare quanto è durata davvero ogni pausa (oggi c'è solo il richiamo e il contatore a schermo).
- Riepilogo mensile esportabile in PDF.
