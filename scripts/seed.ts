/**
 * Dati demo: aziende e persone INVENTATE del settore spazio, mai clienti reali.
 * Le date sono relative a oggi, così la demo è sempre viva: la coda Oggi ha sempre qualcosa.
 *
 *   pnpm db:seed
 */
import { sql } from "drizzle-orm";
import { createDb } from "../src/db/client";
import * as s from "../src/db/schema";
import { addDays, todayInRome } from "../src/lib/followup/dates";
import { recomputeFollowups, refreshLastInteractions } from "../src/server/followups";
import { migrateDb } from "./migrate";

const db = createDb();
const today = todayInRome();
const d = (offset: number) => addDays(today, offset);
/** Un istante di `offset` giorni fa, all'ora indicata (ora italiana d'inverno). */
const at = (offset: number, hour = 10, minute = 0) =>
  new Date(`${d(offset)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+01:00`);

async function reset() {
  const tables = [
    "suggestions", "grants", "services", "facts", "interaction_people", "interactions",
    "meeting_participants", "meetings", "task_assignees", "tasks", "project_members", "projects",
    "opportunities", "people", "events", "companies", "agent_log", "excluded_addresses", "settings", "users",
  ];
  await db.execute(sql.raw(`truncate ${tables.join(", ")} cascade`));
}

async function main() {
  await migrateDb(db);
  await reset();

  // --- Team ----------------------------------------------------------------
  const [michele, alessia, giordano] = await db
    .insert(s.users)
    .values([
      { email: "michele@somaspaceagency.com", name: "Michele", initials: "MI" },
      { email: "alessia@somaspaceagency.com", name: "Alessia", initials: "AL" },
      { email: "giordano@somaspaceagency.com", name: "Giordano", initials: "GI" },
    ])
    .returning();

  // --- Eventi ----------------------------------------------------------------
  const [expo, accel] = await db
    .insert(s.events)
    .values([
      { name: "Space Expo Europe (esempio)", date: d(-60), kind: "Fiera", country: "Germania" },
      { name: "Programma acceleratore NewSpace (esempio)", date: d(-200), kind: "Programma", country: "Italia" },
    ])
    .returning();

  // --- Aziende -------------------------------------------------------------
  const c = await db
    .insert(s.companies)
    .values([
      { name: "Orbitale Srl", domains: ["orbitale.example"], country: "Italia", website: "https://orbitale.example", categories: ["Upstream", "Hardware"], relationship: "cliente", ownerId: michele.id, description: "Costruisce piccoli satelliti per osservazione della Terra. Team di 40 persone a Torino.", agentSummary: "Sito nuovo in lavorazione, lancio previsto a metà febbraio prima della fiera di marzo. Rapporto ottimo con Sara Conti." },
      { name: "Nebula Dynamics", domains: ["nebula-dynamics.example"], country: "Germania", website: "https://nebula-dynamics.example", categories: ["Hardware", "B2B"], relationship: "prospect", ownerId: michele.id, description: "Sottosistemi di propulsione elettrica per costellazioni LEO.", agentSummary: "Preventivo per video e render 3D inviato, in attesa di risposta. Lukas ha chiesto tempi rapidi per una fiera." },
      { name: "Stellar Forge", domains: ["stellarforge.example"], country: "Francia", website: "https://stellarforge.example", categories: ["Software"], relationship: "prospect", ownerId: giordano.id, description: "Software di pianificazione missioni per operatori satellitari." },
      { name: "AstroLink", domains: ["astrolink.example"], country: "Spagna", website: "https://astrolink.example", categories: ["Downstream", "Software"], relationship: "cliente", ownerId: alessia.id, description: "Servizi di connettività satellitare per il settore marittimo.", agentSummary: "Progetto stand in ritardo su render e brochure. Nessun contatto con il cliente da 12 giorni." },
      { name: "Kepler Ground Systems", domains: ["keplergs.example"], country: "Paesi Bassi", website: "https://keplergs.example", categories: ["Downstream", "B2B"], relationship: "partner", ownerId: alessia.id, description: "Stazioni di terra e servizi di tracciamento." },
      { name: "Lumen Orbital", domains: ["lumenorbital.example"], country: "Italia", website: "https://lumenorbital.example", categories: ["Upstream"], relationship: "prospect", ownerId: michele.id, description: "Startup di servizi in orbita: ispezione e rifornimento." },
      { name: "Vela Space Analytics", domains: ["vela-analytics.example"], country: "Italia", website: "https://vela-analytics.example", linkedin: "https://linkedin.com/company/vela-analytics-example", categories: ["Downstream", "Software"], relationship: "prospect", ownerId: giordano.id, dataStatus: "da_verificare", description: "Analisi di immagini satellitari per agricoltura e assicurazioni.", sources: "vela-analytics.example/about · linkedin.com/company/vela-analytics-example" },
      { name: "Cosmica Ventures", domains: ["cosmica.example"], country: "Svizzera", website: "https://cosmica.example", categories: ["B2B"], relationship: "partner", ownerId: michele.id, description: "Fondo di venture capital dedicato alla space economy." },
      { name: "Helio Propulsion", domains: ["heliopropulsion.example"], country: "Italia", website: "https://heliopropulsion.example", categories: ["Hardware", "Upstream"], relationship: "prospect", ownerId: giordano.id, description: "Motori a propellente verde per piccoli lanciatori." },
      { name: "Polaris Mission Design", domains: ["polarismd.example"], country: "Belgio", website: "https://polarismd.example", categories: ["Software", "B2B"], relationship: "cliente", ownerId: alessia.id, description: "Consulenza di ingegneria di missione per agenzie e PMI." },
    ])
    .returning();
  const [orbitale, nebula, stellar, astrolink, kepler, lumen, vela, cosmica, helio, polaris] = c;

  // --- Persone -------------------------------------------------------------
  const p = await db
    .insert(s.people)
    .values([
      { firstName: "Marco", lastName: "Bellini", companyId: orbitale.id, position: "CEO", email: "marco.bellini@orbitale.example", ownerId: michele.id, followupMode: "caldo", metVia: "rete_esistente", interests: ["Sito web", "Brand"], language: "it" },
      { firstName: "Sara", lastName: "Conti", companyId: orbitale.id, position: "Head of Marketing", email: "sara.conti@orbitale.example", ownerId: giordano.id, followupMode: "caldo", metVia: "evento", eventId: expo.id, interests: ["Sito web", "Social e contenuti"], firstMeetingNotes: "Conosciuta allo stand di Space Expo. Cercava un'agenzia che capisse il settore.", language: "it" },
      { firstName: "Lukas", lastName: "Weber", companyId: nebula.id, position: "Business Developer", email: "lukas.weber@nebula-dynamics.example", ownerId: michele.id, followupMode: "caldo", metVia: "evento", eventId: expo.id, interests: ["Video e render 3D"], language: "en" },
      { firstName: "Camille", lastName: "Durand", companyId: stellar.id, position: "CMO", email: "camille.durand@stellarforge.example", ownerId: giordano.id, followupMode: "freddo", metVia: "linkedin", interests: ["Deck e pitch"], language: "en" },
      { firstName: "Javier", lastName: "Ortega", companyId: astrolink.id, position: "COO", email: "javier.ortega@astrolink.example", ownerId: alessia.id, followupMode: "caldo", metVia: "passaparola", interests: ["Eventi"], language: "en" },
      { firstName: "Lucía", lastName: "Navarro", companyId: astrolink.id, position: "Marketing Manager", email: "lucia.navarro@astrolink.example", ownerId: alessia.id, followupMode: "freddo", language: "en" },
      { firstName: "Pieter", lastName: "de Vries", companyId: kepler.id, position: "CEO", email: "pieter@keplergs.example", ownerId: alessia.id, followupMode: "caldo", metVia: "programma", eventId: accel.id, interests: ["Marketing e lead gen"], language: "en" },
      { firstName: "Emma", lastName: "Bakker", companyId: kepler.id, position: "Communication Lead", email: "emma.bakker@keplergs.example", ownerId: alessia.id, followupMode: "freddo", snoozeUntil: d(40), language: "en" },
      { firstName: "Giulia", lastName: "Ferri", companyId: lumen.id, position: "CEO", email: "giulia.ferri@lumenorbital.example", ownerId: michele.id, followupMode: "freddo", proposedMode: "caldo", proposedModeReason: "Deal perso per tempistica a luglio, ha detto che il budget riapre a gennaio.", metVia: "programma", eventId: accel.id, interests: ["Brand"], language: "it" },
      { firstName: "Andrea", lastName: "Galli", companyId: vela.id, position: "CTO", email: "andrea.galli@vela-analytics.example", ownerId: giordano.id, proposedMode: "freddo", proposedModeReason: "Contatto di rete recente, nessun bisogno ancora esplicito.", metVia: "inbound", language: "it" },
      { firstName: "Elena", lastName: "Moretti", companyId: cosmica.id, position: "Partner", email: "elena.moretti@cosmica.example", ownerId: michele.id, followupMode: "freddo", metVia: "rete_esistente", language: "it" },
      { firstName: "Tommaso", lastName: "Riva", companyId: helio.id, position: "Head of Business Development", email: "tommaso.riva@heliopropulsion.example", ownerId: giordano.id, status: "da_approvare", language: "it" },
      { firstName: "Anke", lastName: "Peeters", companyId: polaris.id, position: "Marketing Lead", email: "anke.peeters@polarismd.example", ownerId: alessia.id, followupMode: "caldo", metVia: "evento", eventId: expo.id, interests: ["Social e contenuti", "Video e render 3D"], language: "en" },
      { firstName: "Hugo", lastName: "Lambert", companyId: polaris.id, position: "Office Manager", email: "hugo.lambert@polarismd.example", ownerId: alessia.id, followupMode: "nessuno", language: "en" },
    ])
    .returning();
  const [marco, sara, lukas, camille, javier, lucia, pieter, , giulia, andrea, elena, tommaso, anke] = p;

  // --- Opportunità -----------------------------------------------------------
  const created = (offset: number) => at(offset, 9);
  const o = await db
    .insert(s.opportunities)
    .values([
      { name: "Sito web Orbitale 2027", stage: "vinta", companyId: orbitale.id, personId: sara.id, ownerId: michele.id, initialValue: 34000, finalValue: 38000, quoteSentOn: d(-70), closedOn: d(-45), createdAt: created(-80) },
      { name: "Video e render 3D del propulsore", stage: "in_progress", companyId: nebula.id, personId: lukas.id, ownerId: michele.id, initialValue: 24000, quoteSentOn: d(-8), followupStep: 1, lastFollowupOn: d(-5), quoteUrl: "https://drive.google.com/esempio-preventivo-nebula", createdAt: created(-15) },
      { name: "Deck per investitori", stage: "lead", companyId: stellar.id, personId: camille.id, ownerId: giordano.id, initialValue: 8000, createdAt: created(-10) },
      { name: "Stand e materiali Space Expo", stage: "vinta", companyId: astrolink.id, personId: javier.id, ownerId: alessia.id, initialValue: 18500, finalValue: 18500, quoteSentOn: d(-50), closedOn: d(-35), createdAt: created(-55) },
      { name: "Campagna lead generation Q1", stage: "in_progress", companyId: kepler.id, personId: pieter.id, ownerId: alessia.id, initialValue: 16000, quoteSentOn: d(-20), followupStep: 2, lastFollowupOn: d(-13), createdAt: created(-25) },
      { name: "Brand identity Lumen", stage: "persa", companyId: lumen.id, personId: giulia.id, ownerId: michele.id, initialValue: 15000, quoteSentOn: d(-150), lostReason: "tempistica", closedOn: d(-120), createdAt: created(-160) },
      { name: "Social e contenuti 2026", stage: "vinta", companyId: polaris.id, personId: anke.id, ownerId: alessia.id, initialValue: 12000, finalValue: 12000, quoteSentOn: d(-100), closedOn: d(-90), createdAt: created(-110) },
      { name: "Sito web Cosmica", stage: "in_progress", companyId: cosmica.id, personId: elena.id, ownerId: michele.id, initialValue: 22000, quoteSentOn: d(-35), followupStep: 4, lastFollowupOn: d(-4), createdAt: created(-40) },
      { name: "Pitch deck serie A", stage: "lead", companyId: vela.id, personId: andrea.id, ownerId: giordano.id, initialValue: 9000, createdAt: created(-2) },
      { name: "Video di lancio", stage: "persa", companyId: helio.id, ownerId: giordano.id, initialValue: 14000, quoteSentOn: d(-90), lostReason: "prezzo", closedOn: d(-60), createdAt: created(-95) },
    ])
    .returning();
  const [dealOrbitale, dealNebula, , dealAstro, dealKepler, , dealPolaris, dealCosmica] = o;

  // --- Progetti e task ---------------------------------------------------------
  const [prjOrbitale, prjAstro, prjPolaris] = await db
    .insert(s.projects)
    .values([
      { name: "Sito web Orbitale 2027", companyId: orbitale.id, opportunityId: dealOrbitale.id, status: "attivo", ownerId: giordano.id, startOn: d(-44), dueOn: d(100), health: "verde", healthNote: "Task in linea, ultimo meeting ieri.", agentSummary: "Wireframe approvati. In corso il copy delle pagine prodotto. Il cliente ha chiesto una moodboard con toni più scuri e ha spostato il lancio a metà febbraio." },
      { name: "Stand Space Expo AstroLink", companyId: astrolink.id, opportunityId: dealAstro.id, status: "attivo", ownerId: alessia.id, startOn: d(-34), dueOn: d(25), health: "rosso", healthNote: "2 task in ritardo, nessun contatto con il cliente da 12 giorni, fiera tra 25 giorni.", agentSummary: "Render dello stand e brochure in ritardo. Serve un aggiornamento a Javier entro questa settimana." },
      { name: "Social e contenuti 2026 Polaris", companyId: polaris.id, opportunityId: dealPolaris.id, status: "attivo", ownerId: alessia.id, startOn: d(-89), dueOn: d(57), health: "giallo", healthNote: "Il piano editoriale di dicembre non è ancora approvato.", agentSummary: "Contenuti di novembre pubblicati. Anke deve approvare il piano di dicembre." },
    ])
    .returning();

  await db.insert(s.projectMembers).values([
    { projectId: prjOrbitale.id, userId: giordano.id },
    { projectId: prjOrbitale.id, userId: michele.id },
    { projectId: prjOrbitale.id, userId: alessia.id },
    { projectId: prjAstro.id, userId: alessia.id },
    { projectId: prjAstro.id, userId: giordano.id },
    { projectId: prjPolaris.id, userId: alessia.id },
  ]);

  // Meeting (prima dei task, che possono nascere da un meeting)
  const [mtgOrbitale, mtgNebula, mtgKeplerToday] = await db
    .insert(s.meetings)
    .values([
      {
        title: "Revisione wireframe sito Orbitale",
        occurredAt: at(-1, 15),
        source: "meet",
        companyId: orbitale.id,
        projectId: prjOrbitale.id,
        ownerId: giordano.id,
        summary: "Wireframe approvati con due modifiche. Il cliente vuole un video in apertura della home e sposta il lancio a metà febbraio per arrivare pronto alla fiera di marzo.",
        decisions: ["Video in apertura della home", "Lancio spostato a metà febbraio", "Le pagine prodotto restano tre"],
        nextSteps: ["Moodboard con toni più scuri entro venerdì", "Copy delle pagine prodotto entro la prossima settimana", "Proposta per il video della home"],
        transcript: "[Trascrizione di esempio]\nSara: Ci piace molto la struttura. Possiamo avere qualcosa di più scuro come atmosfera?\nGiordano: Certo, prepariamo una moodboard entro venerdì...",
      },
      {
        title: "Chiamata con Lukas Weber",
        occurredAt: at(-9, 11),
        source: "nota_vocale",
        companyId: nebula.id,
        opportunityId: dealNebula.id,
        ownerId: michele.id,
        summary: "Lukas vuole un video del propulsore per la fiera di aprile. Budget intorno ai 25.000 €. Decide con il CEO entro fine mese.",
        decisions: ["Inviare preventivo entro venerdì"],
        nextSteps: ["Preventivo video e render 3D", "Esempi di render tecnici"],
        transcript: "[Nota vocale di esempio] Ho appena sentito Lukas di Nebula...",
      },
      {
        title: "Aggiornamento campagna con Pieter",
        occurredAt: at(0, 16),
        source: "manuale",
        companyId: kepler.id,
        opportunityId: dealKepler.id,
        ownerId: alessia.id,
      },
    ])
    .returning();

  await db.insert(s.meetingParticipants).values([
    { meetingId: mtgOrbitale.id, personId: sara.id },
    { meetingId: mtgOrbitale.id, personId: marco.id },
    { meetingId: mtgOrbitale.id, userId: giordano.id },
    { meetingId: mtgOrbitale.id, userId: michele.id },
    { meetingId: mtgNebula.id, personId: lukas.id },
    { meetingId: mtgNebula.id, userId: michele.id },
    { meetingId: mtgKeplerToday.id, personId: pieter.id },
    { meetingId: mtgKeplerToday.id, userId: alessia.id },
  ]);

  const t = await db
    .insert(s.tasks)
    .values([
      { title: "Wireframe home e pagine prodotto", projectId: prjOrbitale.id, status: "fatto", priority: "alta", dueOn: d(-3), completedAt: at(-2), createdBy: giordano.id },
      { title: "Copy delle pagine prodotto", projectId: prjOrbitale.id, status: "in_corso", priority: "alta", dueOn: d(6), createdBy: giordano.id, origin: "meeting", meetingId: mtgOrbitale.id },
      { title: "Moodboard con toni più scuri", projectId: prjOrbitale.id, status: "proposto", priority: "alta", dueOn: d(2), origin: "meeting", meetingId: mtgOrbitale.id, rationale: "Emerso nel meeting di ieri: Sara ha chiesto un'atmosfera più scura, entro venerdì." },
      { title: "Proposta per il video della home", projectId: prjOrbitale.id, status: "proposto", priority: "media", dueOn: d(9), origin: "meeting", meetingId: mtgOrbitale.id, rationale: "Decisione del meeting: video in apertura della home. Possibile estensione del contratto." },
      { title: "Revisione struttura con il cliente", projectId: prjOrbitale.id, status: "da_fare", priority: "media", dueOn: d(0), createdBy: michele.id },
      { title: "Render 3D dello stand", projectId: prjAstro.id, status: "in_corso", priority: "alta", dueOn: d(-3), createdBy: alessia.id },
      { title: "Brochure bilingue", projectId: prjAstro.id, status: "da_fare", priority: "alta", dueOn: d(-1), createdBy: alessia.id },
      { title: "Aggiornare Javier sullo stato dello stand", projectId: prjAstro.id, status: "proposto", priority: "alta", dueOn: d(1), origin: "agente", rationale: "Nessun contatto con il cliente da 12 giorni e due task in ritardo." },
      { title: "Logistica e spedizione materiali", projectId: prjAstro.id, status: "da_fare", priority: "media", dueOn: d(15), createdBy: alessia.id },
      { title: "Piano editoriale di dicembre", projectId: prjPolaris.id, status: "in_corso", priority: "media", dueOn: d(3), createdBy: alessia.id },
      { title: "Report risultati di novembre", projectId: prjPolaris.id, status: "da_fare", priority: "bassa", dueOn: d(26), createdBy: alessia.id },
      { title: "Preparare esempi di render tecnici per Nebula", opportunityId: dealNebula.id, companyId: nebula.id, status: "da_fare", priority: "media", dueOn: d(1), createdBy: michele.id, origin: "meeting", meetingId: mtgNebula.id },
    ])
    .returning();
  const [, copyTask] = t;

  const sub = await db
    .insert(s.tasks)
    .values([
      { title: "Pagina Satelliti", projectId: prjOrbitale.id, parentId: copyTask.id, status: "fatto", completedAt: at(-1), dueOn: d(2) },
      { title: "Pagina Servizi di terra", projectId: prjOrbitale.id, parentId: copyTask.id, status: "in_corso", dueOn: d(4) },
      { title: "Pagina Missioni", projectId: prjOrbitale.id, parentId: copyTask.id, status: "da_fare", dueOn: d(6) },
    ])
    .returning();

  const assignee = (taskIdx: number, ...users: (typeof michele)[]) =>
    users.map((u) => ({ taskId: t[taskIdx].id, userId: u.id }));
  await db.insert(s.taskAssignees).values([
    ...assignee(0, giordano),
    ...assignee(1, alessia, giordano),
    ...assignee(2, giordano),
    ...assignee(3, michele),
    ...assignee(4, michele, giordano),
    ...assignee(5, giordano),
    ...assignee(6, alessia),
    ...assignee(7, alessia),
    ...assignee(8, alessia),
    ...assignee(9, alessia),
    ...assignee(10, alessia),
    ...assignee(11, michele),
    ...sub.map((x) => ({ taskId: x.id, userId: alessia.id })),
  ]);

  // --- Interazioni: ogni email resta privata della casella da cui arriva ---------
  type I = typeof s.interactions.$inferInsert;
  const rows: { row: I; people: string[] }[] = [];
  const email = (
    owner: typeof michele,
    dir: "in" | "out",
    offset: number,
    title: string,
    summary: string,
    personIds: string[],
    extra: Partial<I> = {},
  ) =>
    rows.push({
      row: {
        type: dir === "in" ? "email_ricevuta" : "email_inviata",
        title,
        summary,
        occurredAt: at(offset, dir === "in" ? 9 : 17, 30),
        visibility: "privata",
        ownerId: owner.id,
        origin: "agente",
        link: "https://mail.google.com/",
        sourceId: `demo-${rows.length}`,
        ...extra,
      },
      people: personIds,
    });

  // Orbitale (Giordano e Michele)
  email(michele, "out", -31, "Aggiornamento collaborazione", "Michele ha mandato a Marco il riepilogo del primo mese di lavoro sul sito.", [marco.id], { companyId: orbitale.id });
  email(giordano, "out", -3, "Wireframe sito", "Inviati i wireframe di home e pagine prodotto per la revisione.", [sara.id], { companyId: orbitale.id, projectId: prjOrbitale.id });
  email(giordano, "in", -1, "Re: Wireframe sito", "Sara chiede se la moodboard può arrivare prima di venerdì per mostrarla al CEO.", [sara.id], { companyId: orbitale.id, projectId: prjOrbitale.id });
  // Nebula (Michele): preventivo e primo follow-up
  email(michele, "out", -8, "Preventivo video e render 3D", "Inviato il preventivo da 24.000 € con tempi di consegna per la fiera di aprile.", [lukas.id], { companyId: nebula.id, opportunityId: dealNebula.id });
  email(michele, "out", -5, "Re: Preventivo video e render 3D", "Follow-up: conferma che il preventivo è arrivato e disponibilità per domande.", [lukas.id], { companyId: nebula.id, opportunityId: dealNebula.id });
  // Kepler (Alessia): sequenza e risposta del cliente
  email(alessia, "out", -20, "Proposta campagna lead generation Q1", "Inviata la proposta di campagna con tre canali e budget di 16.000 €.", [pieter.id], { companyId: kepler.id, opportunityId: dealKepler.id });
  email(alessia, "out", -17, "Re: Proposta campagna", "Follow-up passo 1: conferma ricezione.", [pieter.id], { companyId: kepler.id, opportunityId: dealKepler.id });
  email(alessia, "out", -13, "Re: Proposta campagna", "Follow-up passo 2: proposta di una call breve.", [pieter.id], { companyId: kepler.id, opportunityId: dealKepler.id });
  email(alessia, "in", -2, "Re: Proposta campagna", "Pieter chiede se il budget può essere diviso su due trimestri.", [pieter.id], { companyId: kepler.id, opportunityId: dealKepler.id });
  // Cosmica (Michele): sequenza completa senza risposta
  email(michele, "out", -35, "Preventivo sito Cosmica", "Inviato il preventivo per il nuovo sito.", [elena.id], { companyId: cosmica.id, opportunityId: dealCosmica.id });
  for (const [i, off] of [-32, -28, -21, -4].entries()) {
    email(michele, "out", off, "Re: Preventivo sito Cosmica", `Follow-up passo ${i + 1}.`, [elena.id], { companyId: cosmica.id, opportunityId: dealCosmica.id });
  }
  // Relazioni calde e fredde
  email(alessia, "out", -33, "Saluti dopo l'acceleratore", "Alessia ha mandato a Pieter un aggiornamento sui nuovi servizi.", [pieter.id], { companyId: kepler.id });
  email(michele, "out", -95, "Novità Somaspace", "Michele ha condiviso il nuovo portfolio con Giulia.", [giulia.id], { companyId: lumen.id });
  email(michele, "in", -94, "Re: Novità Somaspace", "Giulia ringrazia: il budget marketing è fermo fino a gennaio, poi riaprono il rebrand.", [giulia.id], { companyId: lumen.id });
  email(michele, "out", -93, "Re: Novità Somaspace", "Michele propone di risentirsi a gennaio.", [giulia.id], { companyId: lumen.id });
  email(alessia, "out", -10, "Materiali stand", "Alessia ha chiesto a Javier il logo in vettoriale per lo stand.", [javier.id], { companyId: astrolink.id, projectId: prjAstro.id });
  email(alessia, "out", -60, "Piacere di averti conosciuta", "Primo contatto dopo la fiera.", [lucia.id], { companyId: astrolink.id });
  email(alessia, "out", -5, "Contenuti di novembre", "Inviato il calendario dei post di novembre per conferma.", [anke.id], { companyId: polaris.id, projectId: prjPolaris.id });
  email(alessia, "in", -4, "Re: Contenuti di novembre", "Anke approva novembre e accenna a un video per il nuovo satellite.", [anke.id], { companyId: polaris.id, projectId: prjPolaris.id });
  email(alessia, "out", -4, "Re: Contenuti di novembre", "Alessia ringrazia e chiede dettagli sul video.", [anke.id], { companyId: polaris.id });
  email(michele, "out", -40, "Evento investitori", "Invito all'evento investitori di dicembre.", [elena.id], { companyId: cosmica.id });
  email(giordano, "out", -100, "Contatto da LinkedIn", "Giordano ha presentato Somaspace a Camille dopo un messaggio su LinkedIn.", [camille.id], { companyId: stellar.id });
  email(giordano, "in", -6, "Richiesta informazioni", "Andrea scrive dal form del sito: cercano un deck per il round del 2027.", [andrea.id], { companyId: vela.id });
  email(giordano, "out", -5, "Re: Richiesta informazioni", "Giordano propone una call conoscitiva.", [andrea.id], { companyId: vela.id });

  // Interazioni del team: meeting, note, cambi di valore
  rows.push({
    row: { type: "meeting", title: mtgOrbitale.title, summary: mtgOrbitale.summary, occurredAt: mtgOrbitale.occurredAt, visibility: "team", ownerId: giordano.id, origin: "agente", companyId: orbitale.id, projectId: prjOrbitale.id, meetingId: mtgOrbitale.id, sourceId: "demo-meet-1" },
    people: [sara.id],
  });
  rows.push({
    row: { type: "nota_vocale", title: mtgNebula.title, summary: mtgNebula.summary, occurredAt: mtgNebula.occurredAt, visibility: "team", ownerId: michele.id, origin: "utente", companyId: nebula.id, opportunityId: dealNebula.id, meetingId: mtgNebula.id },
    people: [lukas.id],
  });
  rows.push({
    row: { type: "modifica_valore", title: "Valore iniziale: 22.000 € → 24.000 €", summary: "Aggiunti 4 render tecnici su richiesta di Lukas.", occurredAt: at(-8, 12), visibility: "team", ownerId: michele.id, origin: "utente", companyId: nebula.id, opportunityId: dealNebula.id },
    people: [],
  });
  rows.push({
    row: { type: "chiamata", title: "Chiamata con Javier", summary: "Javier conferma le dimensioni dello stand: 6x4 metri, angolo.", occurredAt: at(-12, 11), visibility: "team", ownerId: alessia.id, origin: "utente", companyId: astrolink.id, projectId: prjAstro.id },
    people: [javier.id],
  });

  for (const { row, people: ids } of rows) {
    const [inserted] = await db.insert(s.interactions).values(row).returning();
    if (ids.length) {
      await db.insert(s.interactionPeople).values(ids.map((personId) => ({ interactionId: inserted.id, personId })));
    }
  }

  // --- Fatti sul cliente (condivisi, senza fonte visibile) ------------------------
  const f = await db
    .insert(s.facts)
    .values([
      { text: "Vogliono il nuovo sito online prima della fiera di marzo", kind: "tempistica", companyId: orbitale.id, projectId: prjOrbitale.id, sourceType: "meeting", contributorId: giordano.id },
      { text: "Il budget marketing è fermo fino a gennaio, poi riaprono il rebrand", kind: "budget", companyId: lumen.id, personId: giulia.id, resurfaceOn: d(0), sourceType: "email", contributorId: michele.id },
      { text: "Preferiscono dividere i pagamenti su due trimestri", kind: "preferenza", companyId: kepler.id, personId: pieter.id, sourceType: "email", contributorId: alessia.id },
      { text: "Il loro marketing manager cambia a dicembre", kind: "contesto", companyId: astrolink.id, sourceType: "chiamata", contributorId: alessia.id },
      { text: "Stanno preparando un round serie A per il 2027", kind: "contesto", companyId: vela.id, personId: andrea.id, sourceType: "email", contributorId: giordano.id },
      { text: "Vorrebbero un video per il lancio del loro nuovo satellite", kind: "bisogno", companyId: polaris.id, personId: anke.id, sourceType: "email", contributorId: alessia.id },
      { text: "Decisione sul video presa dal CEO entro fine mese", kind: "tempistica", companyId: nebula.id, personId: lukas.id, sourceType: "nota", contributorId: michele.id },
    ])
    .returning();

  // --- Servizi, bandi, suggerimenti ------------------------------------------------
  const sv = await db
    .insert(s.services)
    .values([
      { name: "Brand", targetCategories: ["Upstream", "Downstream", "Hardware", "Software", "B2B"] },
      { name: "Sito web", targetCategories: ["Upstream", "Downstream", "Software", "B2B"] },
      { name: "Social e contenuti", targetCategories: ["Downstream", "Software", "B2B"] },
      { name: "Video e render 3D", targetCategories: ["Hardware", "Upstream"] },
      { name: "Deck e pitch", targetCategories: ["Software", "Upstream"] },
      { name: "Eventi", targetCategories: ["Hardware", "Downstream", "B2B"] },
      { name: "Marketing e lead gen", targetCategories: ["B2B", "Downstream"] },
      { name: "Configuratore 3D interattivo", description: "Modello 3D del prodotto navigabile dal sito, per fiere e vendite.", targetCategories: ["Hardware", "Upstream"], status: "nuovo", launchedOn: d(-3) },
    ])
    .returning();
  const svc = (name: string) => sv.find((x) => x.name === name)!;

  const [grantSpace, grantVoucher] = await db
    .insert(s.grants)
    .values([
      { name: "Bando Space Economy 2027 (esempio)", body: "Regione (esempio)", deadlineOn: d(45), amount: "fino a 200.000 €", requirements: "PMI con sede in Italia, progetti di comunicazione e internazionalizzazione nel settore spazio.", sectors: ["Upstream", "Downstream"], origin: "agente", url: "https://example.com/bando-space-economy" },
      { name: "Voucher internazionalizzazione PMI (esempio)", body: "Camera di commercio (esempio)", deadlineOn: d(20), amount: "fino a 10.000 €", requirements: "PMI che partecipano a fiere estere.", sectors: ["B2B", "Hardware"], origin: "manuale", url: "https://example.com/voucher" },
    ])
    .returning();

  await db.insert(s.suggestions).values([
    { companyId: polaris.id, personId: anke.id, reason: "servizio", serviceId: svc("Video e render 3D").id, factId: f[5].id, rationale: "Anke ha accennato a un video per il lancio del nuovo satellite. Sono già clienti soddisfatti.", score: 88 },
    { companyId: lumen.id, personId: giulia.id, reason: "segnale", factId: f[1].id, rationale: "Deal perso per tempistica a luglio. Il budget marketing riapre a gennaio: momento giusto per ripresentare il rebrand.", score: 84 },
    { companyId: vela.id, personId: andrea.id, reason: "servizio", serviceId: svc("Deck e pitch").id, factId: f[4].id, rationale: "Preparano un round serie A nel 2027. Hanno già scritto chiedendo un deck.", score: 78 },
    { companyId: helio.id, personId: tommaso.id, reason: "bando", grantId: grantSpace.id, rationale: "Hardware upstream con sede in Italia: rientrano nei requisiti. Il bando copre comunicazione e fiere.", score: 72 },
    { companyId: orbitale.id, personId: marco.id, reason: "servizio", serviceId: svc("Configuratore 3D interattivo").id, rationale: "Fiera a marzo e sito nuovo in lavorazione: il configuratore 3D si integra nel progetto in corso.", score: 70 },
    { companyId: nebula.id, personId: lukas.id, reason: "bando", grantId: grantVoucher.id, rationale: "Partecipano alla fiera di aprile: il voucher può coprire parte del video.", score: 64 },
    { companyId: cosmica.id, personId: elena.id, reason: "dormiente", rationale: "Nessuna risposta al preventivo del sito dopo quattro follow-up. Possibile ripresa con un'offerta ridotta.", score: 40 },
  ]);

  // --- Impostazioni e log ------------------------------------------------------
  await db.insert(s.settings).values([
    { key: "followup", value: { warmDays: 30, coldDays: 90, quoteSequence: [3, 7, 14, 30], maxDraftsPerDay: 15 } },
    { key: "digest", value: { time: "08:00", days: "lun-ven", timezone: "Europe/Rome" } },
    { key: "internal_domains", value: ["somaspaceagency.com"] },
    { key: "categories", value: ["B2B", "Upstream", "Downstream", "Software", "Hardware"] },
  ]);
  await db.insert(s.excludedAddresses).values([
    { address: "newsletter@", reason: "Newsletter" },
    { address: "no-reply@", reason: "Notifiche automatiche" },
  ]);
  await db.insert(s.agentLog).values([
    { at: at(0, 8), action: "Digest inviato", outcome: "ok", detail: "3 digest, 11 voci in coda", onBehalfOf: null },
    { at: at(-1, 15, 50), action: "Meeting analizzato", entityType: "meeting", entityId: mtgOrbitale.id, outcome: "ok", detail: "3 decisioni, 2 task proposti, 1 fatto", onBehalfOf: giordano.id },
    { at: at(-1, 3), action: "Ricerca bandi", outcome: "ok", detail: "1 bando nuovo trovato: Bando Space Economy 2027", onBehalfOf: null },
    { at: at(-2, 9, 40), action: "Azienda arricchita", entityType: "company", entityId: vela.id, outcome: "da verificare", detail: "Descrizione, sito, LinkedIn, categoria", onBehalfOf: giordano.id },
    { at: at(-2, 9, 35), action: "Nuovo contatto proposto", entityType: "person", entityId: tommaso.id, outcome: "in attesa", detail: "Due email scambiate, dominio heliopropulsion.example già nel CRM", onBehalfOf: giordano.id },
  ]);

  // --- Calcoli dell'agente -------------------------------------------------------
  await refreshLastInteractions(db);
  await recomputeFollowups(db);
  await db.execute(sql`
    update people set connection_strength = case
      when last_interaction_at > now() - interval '7 days' then 'forte'::connection_strength
      when last_interaction_at > now() - interval '35 days' then 'media'::connection_strength
      when last_interaction_at is not null then 'debole'::connection_strength
      else 'nessuna'::connection_strength end
  `);
  await db.update(s.people).set({ connectionStrength: "molto_forte" }).where(sql`email = ${sara.email}`);
  await db.execute(sql`
    update companies c set connection_strength = sub.best from (
      select company_id, (array_agg(connection_strength order by array_position(
        array['nessuna','debole','media','forte','molto_forte']::connection_strength[], connection_strength) desc))[1] as best
      from people where company_id is not null group by company_id
    ) sub where sub.company_id = c.id
  `);

  console.log(`Demo pronta per oggi (${today}): ${c.length} aziende, ${p.length} persone, ${o.length} opportunità.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
