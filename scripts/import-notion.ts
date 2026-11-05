/**
 * Importa i dati veri dai database Notion del CRM (specifica, sezione 10).
 * Legge l'export JSON in .data/notion-export (fuori da Git) e sostituisce i dati del database locale.
 * In Notion non si modifica niente.
 *
 *   pnpm db:import-notion
 *
 * Fase 1: l'export arriverà direttamente dall'API di Notion, con lo stesso formato.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { createDb } from "../src/db/client";
import * as s from "../src/db/schema";
import { todayInRome } from "../src/lib/followup/dates";
import { strengthLevel, strengthScore, strongest, type Strength } from "../src/lib/strength";
import { recomputeFollowups, refreshLastInteractions } from "../src/server/followups";
import { migrateDb } from "./migrate";

const EXPORT_DIR = process.env.NOTION_EXPORT_DIR ?? "./.data/notion-export";
const read = <T>(name: string): T[] => JSON.parse(readFileSync(join(EXPORT_DIR, `${name}.json`), "utf8"));

/** Le relazioni Notion arrivano come stringa JSON di URL: si tengono solo gli id. */
const ids = (relation: string | null): string[] =>
  relation ? (JSON.parse(relation) as string[]).map((u) => u.replace(/^user:\/\//, "").replace(/-/g, "").slice(-32)) : [];
const multi = (value: string | null): string[] => (value ? (JSON.parse(value) as string[]) : []);
const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const day = (v: string | null) => (v ? v.slice(0, 10) : null);
const noonOf = (d: string) => new Date(`${d}T12:00:00+01:00`);

// --- Righe dell'export (stesso ordine delle colonne della query) ------------------------
type CompanyRow = [string, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string];
type ContactRow = [string, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string];
type OppRow = [string, string, string | null, string | null, string | null, number | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string];
type EventRow = [string, string, string | null, string | null, string | null, string];
type ProjectRow = [string, string, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string];
type TeamRow = [string, string | null, string | null, string | null, string | null];
type TaskRow = [string, string | null, string, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string];

// --- Mappature della specifica, sezione 10 ------------------------------------------------

const RELATIONSHIP: Record<string, (typeof s.relationshipEnum.enumValues)[number]> = {
  Cliente: "cliente",
  Prospect: "prospect",
  Partner: "partner",
  Subfornitore: "fornitore",
  Interno: "interno",
};

/**
 * Settore → Categoria. Proposta da confermare (punto aperto della specifica):
 * i settori spazio vanno su Upstream e Downstream, Deep Tech resta categoria a sé.
 */
const SECTOR_TO_CATEGORY: Record<string, string> = {
  "Space Upstream": "Upstream",
  "Space Downstream": "Downstream",
  Geospatial: "Downstream",
  GIS: "Downstream",
  HAPS: "Upstream",
  "Parabolic Flight": "Upstream",
  "Enter in space": "Upstream",
  "Deep Tech": "Deep Tech",
  HR: "B2B",
};

const COUNTRY: Record<string, string> = { Italy: "Italia", Spain: "Spagna", Brazil: "Brasile", Olanda: "Paesi Bassi" };

const MET_VIA: Record<string, (typeof s.metViaEnum.enumValues)[number]> = {
  Evento: "evento",
  Workshop: "evento",
  Referral: "passaparola",
  LinkedIn: "linkedin",
  "Rete esistente": "rete_esistente",
  Inbound: "inbound",
  Altro: "altro",
};

const STAGE: Record<string, (typeof s.stageEnum.enumValues)[number]> = {
  "In preparazione": "lead",
  "Offerta inviata": "in_progress",
  "In negoziazione": "in_progress",
  Vinta: "vinta",
  Persa: "persa",
};

/** In Notion il motivo è testo libero: lo si classifica, il testo resta nelle note. */
function lostReason(note: string | null): (typeof s.lostReasonEnum.enumValues)[number] {
  const n = (note ?? "").toLowerCase();
  if (/nessun feedback|non (ha|hanno) (mai )?rispost/.test(n)) return "nessuna_risposta";
  if (/posticipat|rimandat|più avanti/.test(n)) return "tempistica";
  if (/preferito un|altra azienda|proposta più economica|concorrent/.test(n)) return "concorrente";
  if (/budget|prezzo|costo|troppo elevato/.test(n)) return "prezzo";
  return "altro";
}

const PROJECT_STATUS: Record<string, (typeof s.projectStatusEnum.enumValues)[number]> = {
  "Da iniziare": "da_avviare",
  "In corso": "attivo",
  "Da revisionare": "attivo",
  Completato: "chiuso",
};

const TASK_STATUS: Record<string, (typeof s.taskStatusEnum.enumValues)[number]> = {
  "Non iniziato": "da_fare",
  "In lavorazione": "in_corso",
  "Always On": "in_corso",
  Completato: "fatto",
};

const GENERIC_DOMAINS = new Set(["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "uniba.it"]);

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? full, lastName: parts.slice(1).join(" ") };
}

async function main() {
  const db = createDb();
  await migrateDb(db);

  const companiesRaw = read<CompanyRow>("companies");
  const contactsRaw = read<ContactRow>("contacts");
  const oppsRaw = read<OppRow>("opportunities");
  const eventsRaw = read<EventRow>("events");
  const projectsRaw = read<ProjectRow>("projects");
  const teamRaw = read<TeamRow>("team");
  const tasksRaw = read<TaskRow>("tasks");
  const skipped: string[] = [];

  const tables = [
    "suggestions", "grants", "services", "facts", "interaction_people", "interactions",
    "meeting_participants", "meetings", "task_assignees", "tasks", "project_members", "projects",
    "opportunities", "people", "events", "companies", "agent_log", "excluded_addresses", "settings", "users",
  ];
  await db.execute(sql.raw(`truncate ${tables.join(", ")} cascade`));

  // --- Team: i tre fondatori, più chi lavora già nel team con email aziendale ------------
  // Gli id utente Notion dei fondatori (Referente Somaspace, Assignee)
  const founders = [
    { notionUser: "24cd872b594c818ab9f40002fac2c446", email: "michele@somaspaceagency.com", name: "Michele Rosari", initials: "MR" },
    { notionUser: "24cd872b594c81b5a67a000214938606", email: "alessia@somaspaceagency.com", name: "Alessia Gloder", initials: "AG" },
    { notionUser: "24cd872b594c81738c5d000239b93b09", email: "giordano@somaspaceagency.com", name: "Giordano Fagiolo", initials: "GF" },
  ];
  const insertedFounders = await db
    .insert(s.users)
    .values(founders.map((f) => ({ email: f.email, name: f.name, initials: f.initials, role: "fondatore" as const })))
    .returning();
  const userByEmail = new Map(insertedFounders.map((u) => [u.email, u]));
  const userByNotion = new Map(founders.map((f) => [f.notionUser, userByEmail.get(f.email)!]));

  // TEAM E FORNITORI: interni con email aziendale diventano utenti; per ora solo i fondatori possono entrare
  const teamToUser = new Map<string, typeof s.users.$inferSelect>();
  const freelancerName = new Map<string, string>();
  for (const [id, name, email, kind] of teamRaw) {
    if (!name) continue;
    const existing = email ? userByEmail.get(email) : undefined;
    if (existing) {
      teamToUser.set(id, existing);
    } else if (kind === "Interno" && email?.endsWith("@somaspaceagency.com")) {
      const [u] = await db
        .insert(s.users)
        .values({ email, name, initials: name.slice(0, 2).toUpperCase(), role: "collaboratore", active: false })
        .returning();
      userByEmail.set(email, u);
      teamToUser.set(id, u);
    } else {
      freelancerName.set(id, name);
    }
  }

  // --- Eventi ------------------------------------------------------------------------------
  const eventById = new Map<string, typeof s.events.$inferSelect>();
  for (const [id, name, kind, date, country] of eventsRaw) {
    if (!date) {
      skipped.push(`Evento "${name}" senza data: non è un evento (resta come canale "Come l'ho conosciuto")`);
      continue;
    }
    const [e] = await db
      .insert(s.events)
      .values({ name: name.replace("LIving", "Living"), kind, date, country, notionPageId: id })
      .returning();
    eventById.set(id, e);
  }

  // --- Aziende -------------------------------------------------------------------------------
  // Dominio: dal sito, altrimenti dalle email dei contatti
  const contactDomains = new Map<string, Set<string>>();
  for (const c of contactsRaw) {
    const email = clean(c[3]);
    const domain = email?.split("@")[1]?.toLowerCase();
    if (!domain || GENERIC_DOMAINS.has(domain)) continue;
    for (const companyId of ids(c[11])) {
      contactDomains.set(companyId, (contactDomains.get(companyId) ?? new Set()).add(domain));
    }
  }

  const companyById = new Map<string, typeof s.companies.$inferSelect>();
  for (const [id, name, tipo, site, drive, referente, settore, nazione, created] of companiesRaw) {
    if (!clean(name)) {
      skipped.push(`Azienda senza nome (pagina ${id}): non importata`);
      continue;
    }
    const domains = new Set<string>(contactDomains.get(id) ?? []);
    const siteDomain = site?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    if (siteDomain) domains.add(siteDomain.toLowerCase());
    const categories = [...new Set(multi(settore).map((x) => SECTOR_TO_CATEGORY[x] ?? x))];
    const ownerId = ids(referente).map((u) => userByNotion.get(u)?.id).find(Boolean) ?? null;
    const [c] = await db
      .insert(s.companies)
      .values({
        name: name!.trim(),
        domains: [...domains],
        country: nazione ? (COUNTRY[nazione] ?? nazione) : null,
        website: clean(site),
        driveFolderUrl: clean(drive),
        categories,
        relationship: tipo ? RELATIONSHIP[tipo] : "prospect",
        ownerId,
        notionPageId: id,
        createdAt: noonOf(created),
      })
      .returning();
    companyById.set(id, c);
  }

  // --- Persone ---------------------------------------------------------------------------------
  const oppContacts = new Set(oppsRaw.flatMap((o) => ids(o[4])));
  const personById = new Map<string, typeof s.people.$inferSelect>();
  const personEvents = new Map<string, (typeof s.events.$inferSelect)[]>();
  const seenEmails = new Set<string>();
  for (const row of contactsRaw) {
    const [id, name, ruolo, email, tel, linkedin, , note, come, , eventi, aziende, interessi, referente, ultimo, , created] = row;
    if (!clean(name)) {
      skipped.push(`Contatto senza nome (pagina ${id}): non importato`);
      continue;
    }
    const company = ids(aziende).map((x) => companyById.get(x)).find(Boolean) ?? null;
    let mail = clean(email)?.toLowerCase() ?? null;
    if (mail && seenEmails.has(mail)) {
      skipped.push(`Email doppia ${mail} su "${name}": tenuta solo sul primo contatto`);
      mail = null;
    }
    if (mail) seenEmails.add(mail);

    const events = ids(eventi).map((e) => eventById.get(e)).filter((e): e is typeof s.events.$inferSelect => Boolean(e));
    const ownerId = ids(referente).map((u) => userByNotion.get(u)?.id).find(Boolean) ?? company?.ownerId ?? null;
    // Nessuna modalità attiva senza conferma: l'agente propone, l'utente conferma da Da approvare
    const isWarm = oppContacts.has(id) || company?.relationship === "cliente";
    const { firstName, lastName } = splitName(name!);
    const [p] = await db
      .insert(s.people)
      .values({
        firstName,
        lastName,
        companyId: company?.id ?? null,
        position: clean(ruolo),
        email: mail,
        phone: clean(tel),
        linkedin: clean(linkedin),
        firstMeetingNotes: clean(note),
        metVia: come ? (MET_VIA[come] ?? "altro") : null,
        eventId: events[0]?.id ?? null,
        interests: multi(interessi),
        ownerId,
        followupMode: null,
        proposedMode: isWarm ? "caldo" : "freddo",
        proposedModeReason: isWarm
          ? oppContacts.has(id)
            ? "Ha ricevuto almeno un'offerta: relazione da tenere calda."
            : "Lavora in un'azienda cliente."
          : "Contatto di rete senza opportunità: sentirsi ogni 90 giorni.",
        lastInteractionAt: ultimo ? noonOf(day(ultimo)!) : null,
        language: company?.country === "Italia" ? "it" : "en",
        status: "attivo",
        notionPageId: id,
        createdAt: noonOf(created),
      })
      .returning();
    personById.set(id, p);
    personEvents.set(p.id, events);
  }

  // --- Opportunità --------------------------------------------------------------------------------
  const today = todayInRome();
  const oppByProject = new Map<string, string>();
  const oppById = new Map<string, typeof s.opportunities.$inferSelect>();
  for (const row of oppsRaw) {
    const [id, name, fase, aziende, contatti, valore, invio, chiusura, persa, prossimo, , link, , tipo, note, progetto, created] = row;
    const company = ids(aziende).map((x) => companyById.get(x)).find(Boolean);
    if (!company) {
      skipped.push(`Opportunità "${name}" senza azienda: non importata`);
      continue;
    }
    const person = ids(contatti).map((x) => personById.get(x)).find(Boolean) ?? null;
    const stage = STAGE[fase ?? ""] ?? "lead";
    const quoteSentOn = day(invio);
    // Preventivi inviati da più di 30 giorni senza storia dei follow-up: sequenza esaurita, l'app chiede Persa o Rimanda
    const sequenceDone = stage === "in_progress" && quoteSentOn && quoteSentOn < todayMinus(30);
    const [o] = await db
      .insert(s.opportunities)
      .values({
        name: `${name} · ${company.name}`,
        stage,
        companyId: company.id,
        personId: person?.id ?? null,
        ownerId: person?.ownerId ?? company.ownerId ?? null,
        initialValue: valore,
        // Specifica: Vinta richiede il valore finale. In Notion c'è un solo importo.
        finalValue: stage === "vinta" ? valore : null,
        quoteSentOn,
        quoteUrl: clean(link),
        followupStep: sequenceDone ? 4 : 0,
        snoozeUntil: day(prossimo) && day(prossimo)! > today ? day(prossimo) : null,
        lostReason: stage === "persa" ? lostReason(note) : null,
        closedOn: stage === "vinta" ? day(chiusura) : stage === "persa" ? day(persa) : null,
        notes: [clean(note), tipo ? `Tipo offerta: ${tipo}` : null].filter(Boolean).join("\n") || null,
        notionPageId: id,
        createdAt: noonOf(created),
      })
      .returning();
    oppById.set(id, o);
    for (const prj of ids(progetto)) oppByProject.set(prj, o.id);

    // L'invio del preventivo è un contatto reale: entra nella timeline
    if (quoteSentOn) {
      const [i] = await db
        .insert(s.interactions)
        .values({
          type: "email_inviata",
          title: `Preventivo inviato: ${name}`,
          summary: valore ? `Offerta da ${valore.toLocaleString("it-IT")} €. Importato da Notion.` : "Importato da Notion.",
          occurredAt: noonOf(quoteSentOn),
          visibility: "team",
          ownerId: person?.ownerId ?? company.ownerId ?? null,
          origin: "utente",
          companyId: company.id,
          opportunityId: o.id,
          link: clean(link),
          sourceId: `notion-quote-${id}`,
        })
        .returning();
      if (person) await db.insert(s.interactionPeople).values({ interactionId: i.id, personId: person.id });
    }
  }

  // --- Interazioni ricostruite: l'incontro all'evento e l'ultimo contatto annotato in Notion ------------
  for (const [notionId, p] of personById) {
    for (const e of personEvents.get(p.id) ?? []) {
      const [i] = await db
        .insert(s.interactions)
        .values({
          type: "meeting",
          title: `Incontro a ${e.name}`,
          summary: "Conosciuto all'evento. Importato da Notion.",
          occurredAt: noonOf(e.date!),
          visibility: "team",
          origin: "utente",
          companyId: p.companyId,
          sourceId: `notion-event-${notionId}-${e.id}`,
        })
        .returning();
      await db.insert(s.interactionPeople).values({ interactionId: i.id, personId: p.id });
    }
    if (p.lastInteractionAt) {
      const [i] = await db
        .insert(s.interactions)
        .values({
          type: "nota",
          title: "Ultimo contatto annotato in Notion",
          occurredAt: p.lastInteractionAt,
          visibility: "team",
          origin: "utente",
          companyId: p.companyId,
          sourceId: `notion-last-${notionId}`,
        })
        .returning();
      await db.insert(s.interactionPeople).values({ interactionId: i.id, personId: p.id });
    }
  }

  // --- Progetti e task ---------------------------------------------------------------------------------
  const projectById = new Map<string, typeof s.projects.$inferSelect>();
  for (const row of projectsRaw) {
    const [id, name, ambito, status, clienti, inizio, fine, descrizione, drive, , pm, team, created] = row;
    const candidates = ids(clienti).map((x) => companyById.get(x)).filter((c): c is typeof s.companies.$inferSelect => Boolean(c));
    const company = candidates.find((c) => c.relationship !== "interno") ?? candidates[0] ?? null;
    const owner = ids(pm).map((x) => teamToUser.get(x)).find(Boolean) ?? null;
    const [p] = await db
      .insert(s.projects)
      .values({
        name,
        description: clean(descrizione),
        driveFolderUrl: clean(drive),
        companyId: company?.id ?? null,
        opportunityId: oppByProject.get(id) ?? null,
        status: ambito === "Congelato" ? "in_pausa" : (PROJECT_STATUS[status ?? ""] ?? "da_avviare"),
        ownerId: owner?.id ?? null,
        startOn: day(inizio),
        dueOn: day(fine),
        notionPageId: id,
        createdAt: noonOf(created),
      })
      .returning();
    projectById.set(id, p);
    const members = new Set([owner?.id, ...ids(team).map((x) => teamToUser.get(x)?.id)].filter((x): x is string => Boolean(x)));
    if (members.size) await db.insert(s.projectMembers).values([...members].map((userId) => ({ projectId: p.id, userId })));
  }

  let taskCount = 0;
  for (const row of tasksRaw) {
    const [id, name, status, progetto, assignee, assegnato, scadenza, , completata, , aggiornamenti, created] = row;
    if (!clean(name)) continue;
    const project = ids(progetto).map((x) => projectById.get(x)).find(Boolean) ?? null;
    const users = new Set<string>();
    for (const u of ids(assignee)) {
      const user = userByNotion.get(u);
      if (user) users.add(user.id);
    }
    const external: string[] = [];
    for (const t of ids(assegnato)) {
      const user = teamToUser.get(t);
      if (user) users.add(user.id);
      else if (freelancerName.has(t)) external.push(freelancerName.get(t)!);
    }
    const [t] = await db
      .insert(s.tasks)
      .values({
        title: name!.trim(),
        description: [clean(aggiornamenti), external.length ? `Fornitore: ${external.join(", ")}` : null].filter(Boolean).join("\n") || null,
        projectId: project?.id ?? null,
        companyId: project?.companyId ?? null,
        status: TASK_STATUS[status] ?? "da_fare",
        dueOn: day(scadenza),
        completedAt: status === "Completato" ? noonOf(day(completata) ?? day(created)!) : null,
        notionPageId: id,
        createdAt: noonOf(created),
      })
      .returning();
    if (users.size) await db.insert(s.taskAssignees).values([...users].map((userId) => ({ taskId: t.id, userId })));
    taskCount++;
  }

  // Salute dei progetti attivi: calcolata dai task in ritardo
  await db.execute(sql`
    update projects p set
      health = case when sub.late >= 2 then 'rosso'::health when sub.late = 1 then 'giallo'::health else 'verde'::health end,
      health_note = case when sub.late > 0 then sub.late || ' task in ritardo' else null end
    from (
      select p2.id, count(t.id) filter (where t.status in ('da_fare','in_corso') and t.due_on < ${today}) as late
      from projects p2 left join tasks t on t.project_id = p2.id group by p2.id
    ) sub where sub.id = p.id
  `);

  // --- Catalogo servizi e impostazioni ---------------------------------------------------------------------
  await db.insert(s.services).values(
    ["Brand", "Sito web", "Social e contenuti", "Video e render 3D", "Deck e pitch", "Eventi", "Marketing e lead gen"].map((name) => ({ name })),
  );
  await db.insert(s.settings).values([
    { key: "followup", value: { warmDays: 30, coldDays: 90, quoteSequence: [3, 7, 14, 30], maxDraftsPerDay: 15 } },
    { key: "digest", value: { time: "08:00", days: "lun-ven", timezone: "Europe/Rome" } },
    { key: "internal_domains", value: ["somaspaceagency.com"] },
    { key: "categories", value: ["B2B", "Upstream", "Downstream", "Software", "Hardware", "Deep Tech"] },
  ]);

  // --- Calcoli: ultimo contatto, forza relazione, follow-up -----------------------------------------------
  await refreshLastInteractions(db);
  const people = await db.select().from(s.people);
  const companyLevels = new Map<string, Strength[]>();
  for (const p of people) {
    const events = (personEvents.get(p.id) ?? []).map((e) => e.date!);
    const quotes = [...oppById.values()].filter((o) => o.personId === p.id && o.quoteSentOn).map((o) => o.quoteSentOn!);
    const level = strengthLevel(strengthScore({ today, sentOn: quotes, receivedOn: [], meetingsOn: events }));
    await db.update(s.people).set({ connectionStrength: level }).where(sql`id = ${p.id}`);
    if (p.companyId) companyLevels.set(p.companyId, [...(companyLevels.get(p.companyId) ?? []), level]);
  }
  for (const [companyId, levels] of companyLevels) {
    await db.update(s.companies).set({ connectionStrength: strongest(levels) }).where(sql`id = ${companyId}`);
  }
  await recomputeFollowups(db);

  await db.insert(s.agentLog).values({
    action: "Import da Notion",
    outcome: "ok",
    detail: `${companyById.size} aziende, ${personById.size} persone, ${oppById.size} opportunità, ${eventById.size} eventi, ${projectById.size} progetti, ${taskCount} task`,
  });

  console.log(
    `Importati: ${companyById.size}/${companiesRaw.length} aziende, ${personById.size}/${contactsRaw.length} persone, ` +
      `${oppById.size}/${oppsRaw.length} opportunità, ${eventById.size}/${eventsRaw.length} eventi, ` +
      `${projectById.size}/${projectsRaw.length} progetti, ${taskCount}/${tasksRaw.length} task.`,
  );
  if (skipped.length) console.log(`Note:\n- ${skipped.join("\n- ")}`);
}

function todayMinus(days: number) {
  const d = new Date(`${todayInRome()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
