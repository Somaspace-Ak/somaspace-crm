import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
// Ogni tabella copiata in Notion tiene traccia della sua pagina specchio.
const notionPageId = () => text("notion_page_id");

// ---------------------------------------------------------------------------
// Accessi
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", ["fondatore", "collaboratore"]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  role: roleEnum("role").notNull().default("fondatore"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Relazioni (dalla specifica, sezioni 3-6)
// ---------------------------------------------------------------------------

export const relationshipEnum = pgEnum("relationship", [
  "prospect",
  "cliente",
  "partner",
  "fornitore",
  "interno",
]);
export const strengthEnum = pgEnum("connection_strength", [
  "molto_forte",
  "forte",
  "media",
  "debole",
  "nessuna",
]);
export const dataStatusEnum = pgEnum("data_status", ["da_verificare", "verificato"]);

export const companies = pgTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    domains: text("domains").array().notNull().default([]),
    description: text("description"),
    country: text("country"),
    website: text("website"),
    linkedin: text("linkedin"),
    categories: text("categories").array().notNull().default([]),
    relationship: relationshipEnum("relationship").notNull().default("prospect"),
    ownerId: uuid("owner_id").references(() => users.id),
    connectionStrength: strengthEnum("connection_strength").notNull().default("nessuna"),
    lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
    driveFolderUrl: text("drive_folder_url"),
    dataStatus: dataStatusEnum("data_status").notNull().default("verificato"),
    sources: text("sources"),
    // Stato in breve scritto dall'agente
    agentSummary: text("agent_summary"),
    notionPageId: notionPageId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("companies_name_idx").on(t.name)],
);

export const metViaEnum = pgEnum("met_via", [
  "evento",
  "programma",
  "passaparola",
  "linkedin",
  "inbound",
  "rete_esistente",
  "altro",
]);
export const followupModeEnum = pgEnum("followup_mode", ["caldo", "freddo", "nessuno"]);
export const personStatusEnum = pgEnum("person_status", ["da_approvare", "attivo", "archiviato"]);
export const languageEnum = pgEnum("language", ["it", "en"]);

export const events = pgTable("events", {
  id: id(),
  name: text("name").notNull(),
  date: date("date"),
  kind: text("kind"),
  country: text("country"),
  notionPageId: notionPageId(),
  createdAt: createdAt(),
});

export const people = pgTable(
  "people",
  {
    id: id(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull().default(""),
    companyId: uuid("company_id").references(() => companies.id),
    position: text("position"),
    // Email principale: chiave per collegare la posta. Unica.
    email: text("email").unique(),
    otherEmails: text("other_emails").array().notNull().default([]),
    phone: text("phone"),
    linkedin: text("linkedin"),
    firstMeetingNotes: text("first_meeting_notes"),
    metVia: metViaEnum("met_via"),
    eventId: uuid("event_id").references(() => events.id),
    interests: text("interests").array().notNull().default([]),
    ownerId: uuid("owner_id").references(() => users.id),
    followupMode: followupModeEnum("followup_mode"),
    proposedMode: followupModeEnum("proposed_mode"),
    proposedModeReason: text("proposed_mode_reason"),
    lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
    // Date vere, non formule: calcolate dal motore follow-up
    nextFollowupOn: date("next_followup_on"),
    snoozeUntil: date("snooze_until"),
    language: languageEnum("language"),
    connectionStrength: strengthEnum("connection_strength").notNull().default("nessuna"),
    status: personStatusEnum("status").notNull().default("attivo"),
    draftUrl: text("draft_url"),
    notionPageId: notionPageId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("people_company_idx").on(t.companyId), index("people_next_idx").on(t.nextFollowupOn)],
);

export const stageEnum = pgEnum("stage", ["lead", "in_progress", "vinta", "persa"]);
export const lostReasonEnum = pgEnum("lost_reason", [
  "prezzo",
  "tempistica",
  "nessuna_risposta",
  "concorrente",
  "annullato",
  "altro",
]);
export const opportunityOriginEnum = pgEnum("opportunity_origin", ["diretta", "servizio", "bando", "segnale"]);

export const opportunities = pgTable(
  "opportunities",
  {
    id: id(),
    name: text("name").notNull(),
    stage: stageEnum("stage").notNull().default("lead"),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    personId: uuid("person_id").references(() => people.id),
    ownerId: uuid("owner_id").references(() => users.id),
    // Gli importi vivono solo qui (specifica, sezione 1)
    initialValue: numeric("initial_value", { precision: 12, scale: 2, mode: "number" }),
    finalValue: numeric("final_value", { precision: 12, scale: 2, mode: "number" }),
    quoteSentOn: date("quote_sent_on"),
    quoteUrl: text("quote_url"),
    followupStep: integer("followup_step").notNull().default(0),
    lastFollowupOn: date("last_followup_on"),
    nextFollowupOn: date("next_followup_on"),
    snoozeUntil: date("snooze_until"),
    lostReason: lostReasonEnum("lost_reason"),
    closedOn: date("closed_on"),
    origin: opportunityOriginEnum("origin").notNull().default("diretta"),
    notes: text("notes"),
    draftUrl: text("draft_url"),
    notionPageId: notionPageId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("opportunities_stage_idx").on(t.stage)],
);

// ---------------------------------------------------------------------------
// Progetti e task
// ---------------------------------------------------------------------------

export const projectStatusEnum = pgEnum("project_status", ["da_avviare", "attivo", "in_pausa", "chiuso"]);
export const healthEnum = pgEnum("health", ["verde", "giallo", "rosso"]);

export const projects = pgTable("projects", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  driveFolderUrl: text("drive_folder_url"),
  companyId: uuid("company_id").references(() => companies.id),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id),
  status: projectStatusEnum("status").notNull().default("da_avviare"),
  ownerId: uuid("owner_id").references(() => users.id),
  startOn: date("start_on"),
  dueOn: date("due_on"),
  health: healthEnum("health").notNull().default("verde"),
  healthNote: text("health_note"),
  agentSummary: text("agent_summary"),
  notionPageId: notionPageId(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

export const taskStatusEnum = pgEnum("task_status", ["proposto", "da_fare", "in_corso", "fatto"]);
export const priorityEnum = pgEnum("priority", ["bassa", "media", "alta"]);
export const taskOriginEnum = pgEnum("task_origin", ["manuale", "meeting", "email", "agente"]);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id),
    personId: uuid("person_id").references(() => people.id),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id),
    parentId: uuid("parent_id"),
    status: taskStatusEnum("status").notNull().default("da_fare"),
    priority: priorityEnum("priority").notNull().default("media"),
    dueOn: date("due_on"),
    origin: taskOriginEnum("origin").notNull().default("manuale"),
    meetingId: uuid("meeting_id"),
    // Perché l'agente propone questo task (una riga)
    rationale: text("rationale"),
    createdBy: uuid("created_by").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notionPageId: notionPageId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tasks_project_idx").on(t.projectId), index("tasks_due_idx").on(t.dueOn)],
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })],
);

// ---------------------------------------------------------------------------
// Memoria
// ---------------------------------------------------------------------------

// privata = solo il proprietario (la sua casella); team = tutti i fondatori
export const visibilityEnum = pgEnum("visibility", ["privata", "team"]);

export const meetingSourceEnum = pgEnum("meeting_source", ["meet", "nota_vocale", "audio", "manuale"]);

export const meetings = pgTable("meetings", {
  id: id(),
  title: text("title").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  source: meetingSourceEnum("source").notNull(),
  companyId: uuid("company_id").references(() => companies.id),
  projectId: uuid("project_id").references(() => projects.id),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id),
  summary: text("summary"),
  decisions: jsonb("decisions").$type<string[]>().notNull().default([]),
  nextSteps: jsonb("next_steps").$type<string[]>().notNull().default([]),
  // La trascrizione è sempre privata di chi l'ha creata
  transcript: text("transcript"),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  visibility: visibilityEnum("visibility").notNull().default("team"),
  createdAt: createdAt(),
});

export const meetingParticipants = pgTable("meeting_participants", {
  id: id(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  personId: uuid("person_id").references(() => people.id),
  userId: uuid("user_id").references(() => users.id),
});

export const interactionTypeEnum = pgEnum("interaction_type", [
  "email_inviata",
  "email_ricevuta",
  "meeting",
  "chiamata",
  "nota_vocale",
  "nota",
  "modifica_valore",
]);
export const originEnum = pgEnum("origin", ["agente", "utente"]);

export const interactions = pgTable(
  "interactions",
  {
    id: id(),
    type: interactionTypeEnum("type").notNull(),
    title: text("title").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    // Una o due righe. Il testo completo delle email non si salva mai.
    summary: text("summary"),
    link: text("link"),
    // ID del messaggio Gmail o dell'evento: evita doppioni
    sourceId: text("source_id"),
    visibility: visibilityEnum("visibility").notNull().default("team"),
    // Di quale casella arriva, o chi l'ha scritta
    ownerId: uuid("owner_id").references(() => users.id),
    origin: originEnum("origin").notNull().default("agente"),
    companyId: uuid("company_id").references(() => companies.id),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id),
    projectId: uuid("project_id").references(() => projects.id),
    meetingId: uuid("meeting_id").references(() => meetings.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("interactions_source_owner_idx").on(t.sourceId, t.ownerId),
    index("interactions_company_idx").on(t.companyId),
    index("interactions_occurred_idx").on(t.occurredAt),
  ],
);

export const interactionPeople = pgTable(
  "interaction_people",
  {
    interactionId: uuid("interaction_id")
      .notNull()
      .references(() => interactions.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
  },
  (t) => [primaryKey({ columns: [t.interactionId, t.personId] })],
);

export const factKindEnum = pgEnum("fact_kind", [
  "bisogno",
  "budget",
  "tempistica",
  "obiezione",
  "preferenza",
  "contesto",
]);
export const factSourceEnum = pgEnum("fact_source", ["email", "meeting", "nota", "chiamata"]);

// Fatti sul cliente: conoscenza del team, senza dire da quale casella arrivano.
export const facts = pgTable("facts", {
  id: id(),
  text: text("text").notNull(),
  kind: factKindEnum("kind").notNull(),
  companyId: uuid("company_id").references(() => companies.id),
  personId: uuid("person_id").references(() => people.id),
  projectId: uuid("project_id").references(() => projects.id),
  // Se presente, il fatto torna in Oggi in quella data
  resurfaceOn: date("resurface_on"),
  validUntil: date("valid_until"),
  sourceType: factSourceEnum("source_type").notNull(),
  // Visibile solo a chi ha contribuito, per poterlo ritirare
  contributorId: uuid("contributor_id").references(() => users.id),
  retractedAt: timestamp("retracted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Opportunità proattive
// ---------------------------------------------------------------------------

export const serviceStatusEnum = pgEnum("service_status", ["nuovo", "attivo", "ritirato"]);

export const services = pgTable("services", {
  id: id(),
  name: text("name").notNull().unique(),
  description: text("description"),
  targetCategories: text("target_categories").array().notNull().default([]),
  status: serviceStatusEnum("status").notNull().default("attivo"),
  launchedOn: date("launched_on"),
  createdAt: createdAt(),
});

export const grantOriginEnum = pgEnum("grant_origin", ["manuale", "agente"]);

export const grants = pgTable("grants", {
  id: id(),
  name: text("name").notNull(),
  body: text("body"),
  url: text("url"),
  deadlineOn: date("deadline_on"),
  amount: text("amount"),
  requirements: text("requirements"),
  sectors: text("sectors").array().notNull().default([]),
  origin: grantOriginEnum("origin").notNull().default("manuale"),
  createdAt: createdAt(),
});

export const suggestionReasonEnum = pgEnum("suggestion_reason", ["servizio", "bando", "segnale", "dormiente", "ripresa"]);
export const suggestionStatusEnum = pgEnum("suggestion_status", ["nuovo", "accettato", "scartato"]);

export const suggestions = pgTable("suggestions", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  personId: uuid("person_id").references(() => people.id),
  reason: suggestionReasonEnum("reason").notNull(),
  serviceId: uuid("service_id").references(() => services.id),
  grantId: uuid("grant_id").references(() => grants.id),
  factId: uuid("fact_id").references(() => facts.id),
  /** Per "ripresa": il deal perso da cui nasce */
  sourceOpportunityId: uuid("source_opportunity_id").references(() => opportunities.id),
  rationale: text("rationale").notNull(),
  score: integer("score").notNull().default(50),
  status: suggestionStatusEnum("status").notNull().default("nuovo"),
  /** Chiave della regola che l'ha proposto (es. servizio:azienda:servizio). Vuota se lo propone l'agente */
  ruleKey: text("rule_key"),
  /** Il deal aperto accettando il suggerimento */
  opportunityId: uuid("opportunity_id").references(() => opportunities.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("suggestions_rule_key_idx").on(t.ruleKey)]);

// ---------------------------------------------------------------------------
// Google: caselle e calendari collegati
// ---------------------------------------------------------------------------

/** Un account Google per fondatore. Il refresh token è cifrato (AES-256-GCM, TOKEN_ENCRYPTION_KEY). */
export const googleAccounts = pgTable("google_accounts", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  refreshToken: text("refresh_token").notNull(),
  scopes: text("scopes").array().notNull().default([]),
  connectedAt: createdAt(),
  gmailSyncedAt: timestamp("gmail_synced_at", { withTimezone: true }),
  calendarSyncedAt: timestamp("calendar_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
});

/** Eventi del Google Calendar di ogni fondatore, dal mese scorso ai prossimi tre. */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    googleId: text("google_id").notNull(),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    meetLink: text("meet_link"),
    htmlLink: text("html_link"),
    attendees: text("attendees").array().notNull().default([]),
    // L'azienda dei partecipanti esterni, se la conosciamo: rende l'evento visibile al team
    companyId: uuid("company_id").references(() => companies.id),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("calendar_events_user_google_idx").on(t.userId, t.googleId), index("calendar_events_starts_idx").on(t.startsAt)],
);

// ---------------------------------------------------------------------------
// Tecniche
// ---------------------------------------------------------------------------

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const agentLog = pgTable("agent_log", {
  id: id(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  outcome: text("outcome").notNull(),
  detail: text("detail"),
  // Per quale utente ha agito l'agente (la sua casella, la sua richiesta)
  onBehalfOf: uuid("on_behalf_of").references(() => users.id),
});

export const excludedAddresses = pgTable("excluded_addresses", {
  address: text("address").primaryKey(),
  reason: text("reason"),
  createdAt: createdAt(),
});
