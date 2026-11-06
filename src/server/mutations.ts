"use server";

import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  agentLog,
  calendarEvents,
  companies,
  dataStatusEnum,
  excludedAddresses,
  followupModeEnum,
  googleAccounts,
  healthEnum,
  interactionPeople,
  interactions,
  languageEnum,
  metViaEnum,
  opportunities,
  people,
  priorityEnum,
  projectMembers,
  projects,
  projectStatusEnum,
  relationshipEnum,
  services,
  settings,
  suggestions,
  taskAssignees,
  tasks,
  taskStatusEnum,
} from "@/db/schema";
import { formatEuro } from "@/lib/format";
import { recomputeFollowups, refreshLastInteractions } from "./followups";
import { requireViewer } from "./session";
import { runSuggestionRules } from "./suggestions";
import { decrypt } from "./crypto";
import { revoke as revokeGoogle } from "./google/client";
import { syncGoogleAccount } from "./google/sync";

/**
 * Creazione e modifica dei record dall'app.
 * Ogni azione verifica l'utente e valida i dati: le Server Actions si possono chiamare con una POST diretta.
 */

export type Result<T = { id: string }> = { ok: true; data: T } | { ok: false; error: string };

function refresh() {
  revalidatePath("/", "layout");
}

const fail = (error: string): Result<never> => ({ ok: false, error });

const text = z.string().trim().max(5000);
const optionalText = text.transform((v) => (v ? v : null)).nullable().optional();
const required = (label: string) => z.string().trim().min(1, `${label}: campo obbligatorio`).max(300);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida").nullable().optional();
const uuid = z.string().uuid().nullable().optional();
const url = z
  .string()
  .trim()
  .transform((v) => (v && !/^https?:\/\//.test(v) ? `https://${v}` : v || null))
  .nullable()
  .optional();
const tags = z.array(z.string().trim().min(1).max(80)).max(30);
const money = z.coerce.number().positive("L'importo deve essere positivo").max(100_000_000).nullable().optional();

function firstIssue(e: z.ZodError) {
  return e.issues[0]?.message ?? "Dati non validi";
}

/** Una persona per email: si controllano email principale e altre email (specifica, sezione 4). */
async function emailTaken(email: string, exceptId?: string) {
  const lower = email.toLowerCase();
  const rows = await db
    .select({ id: people.id, firstName: people.firstName, lastName: people.lastName })
    .from(people)
    .where(
      and(
        or(sql`lower(${people.email}) = ${lower}`, sql`${lower} = any(${people.otherEmails})`),
        exceptId ? ne(people.id, exceptId) : undefined,
      ),
    );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Creazione
// ---------------------------------------------------------------------------

const companyInput = z.object({
  name: required("Nome"),
  website: url,
  country: optionalText,
  categories: tags.optional(),
  relationship: z.enum(relationshipEnum.enumValues).optional(),
  ownerId: uuid,
});

export async function createCompany(input: z.input<typeof companyInput>): Promise<Result> {
  const viewer = await requireViewer();
  const parsed = companyInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const [dup] = await db.select({ id: companies.id }).from(companies).where(sql`lower(${companies.name}) = lower(${v.name})`);
  if (dup) return fail(`Esiste già un'azienda chiamata "${v.name}"`);
  const domain = v.website?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const [c] = await db
    .insert(companies)
    .values({
      name: v.name,
      website: v.website ?? null,
      domains: domain ? [domain.toLowerCase()] : [],
      country: v.country ?? null,
      categories: v.categories ?? [],
      relationship: v.relationship ?? "prospect",
      ownerId: v.ownerId ?? viewer.id,
    })
    .returning();
  refresh();
  return { ok: true, data: { id: c.id } };
}

const personInput = z.object({
  firstName: required("Nome"),
  lastName: z.string().trim().max(200).optional(),
  email: z.string().trim().email("Email non valida").or(z.literal("")).optional(),
  companyId: uuid,
  newCompanyName: z.string().trim().max(300).optional(),
  position: optionalText,
  phone: optionalText,
  linkedin: url,
  ownerId: uuid,
  followupMode: z.enum(followupModeEnum.enumValues).nullable().optional(),
  metVia: z.enum(metViaEnum.enumValues).nullable().optional(),
  firstMeetingNotes: optionalText,
});

export async function createPerson(input: z.input<typeof personInput>): Promise<Result> {
  const viewer = await requireViewer();
  const parsed = personInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const email = v.email ? v.email.toLowerCase() : null;
  if (email) {
    const other = await emailTaken(email);
    if (other) return fail(`L'email è già di ${other.firstName} ${other.lastName}`.trim());
  }

  let companyId = v.companyId ?? null;
  if (!companyId && v.newCompanyName) {
    const created = await createCompany({ name: v.newCompanyName });
    if (!created.ok) return created;
    companyId = created.data.id;
  }
  // Owner di default: quello dell'azienda (specifica, sezione 4)
  let ownerId = v.ownerId ?? null;
  if (!ownerId && companyId) {
    const [c] = await db.select({ ownerId: companies.ownerId }).from(companies).where(eq(companies.id, companyId));
    ownerId = c?.ownerId ?? null;
  }

  const [p] = await db
    .insert(people)
    .values({
      firstName: v.firstName,
      lastName: v.lastName ?? "",
      email,
      companyId,
      position: v.position ?? null,
      phone: v.phone ?? null,
      linkedin: v.linkedin ?? null,
      ownerId: ownerId ?? viewer.id,
      followupMode: v.followupMode ?? null,
      metVia: v.metVia ?? null,
      firstMeetingNotes: v.firstMeetingNotes ?? null,
      status: "attivo",
    })
    .returning();
  refresh();
  return { ok: true, data: { id: p.id } };
}

const opportunityInput = z.object({
  name: required("Nome del deal"),
  companyId: z.string().uuid("Scegli l'azienda"),
  personId: uuid,
  ownerId: uuid,
  initialValue: money,
  quoteSentOn: isoDate,
  notes: optionalText,
});

export async function createOpportunity(input: z.input<typeof opportunityInput>): Promise<Result> {
  const viewer = await requireViewer();
  const parsed = opportunityInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const [o] = await db
    .insert(opportunities)
    .values({
      name: v.name,
      companyId: v.companyId,
      personId: v.personId ?? null,
      ownerId: v.ownerId ?? viewer.id,
      initialValue: v.initialValue ?? null,
      // Con la data di invio il deal entra subito in In progress e parte la sequenza
      stage: v.quoteSentOn ? "in_progress" : "lead",
      quoteSentOn: v.quoteSentOn ?? null,
      notes: v.notes ?? null,
    })
    .returning();
  await recomputeFollowups(db, { opportunities: [o.id], people: o.personId ? [o.personId] : [] });
  refresh();
  return { ok: true, data: { id: o.id } };
}

const projectInput = z.object({
  name: required("Nome del progetto"),
  companyId: uuid,
  ownerId: uuid,
  status: z.enum(projectStatusEnum.enumValues).optional(),
  startOn: isoDate,
  dueOn: isoDate,
  description: optionalText,
  memberIds: z.array(z.string().uuid()).optional(),
});

export async function createProject(input: z.input<typeof projectInput>): Promise<Result> {
  const viewer = await requireViewer();
  const parsed = projectInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const [p] = await db
    .insert(projects)
    .values({
      name: v.name,
      companyId: v.companyId ?? null,
      ownerId: v.ownerId ?? viewer.id,
      status: v.status ?? "da_avviare",
      startOn: v.startOn ?? null,
      dueOn: v.dueOn ?? null,
      description: v.description ?? null,
    })
    .returning();
  const members = new Set([p.ownerId!, ...(v.memberIds ?? [])]);
  await db.insert(projectMembers).values([...members].map((userId) => ({ projectId: p.id, userId })));
  refresh();
  return { ok: true, data: { id: p.id } };
}

const taskInput = z.object({
  title: required("Titolo"),
  projectId: uuid,
  parentId: uuid,
  dueOn: isoDate,
  priority: z.enum(priorityEnum.enumValues).optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
  description: optionalText,
});

export async function createTask(input: z.input<typeof taskInput>): Promise<Result> {
  const viewer = await requireViewer();
  const parsed = taskInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  let companyId: string | null = null;
  if (v.projectId) {
    const [p] = await db.select({ companyId: projects.companyId }).from(projects).where(eq(projects.id, v.projectId));
    companyId = p?.companyId ?? null;
  }
  const [t] = await db
    .insert(tasks)
    .values({
      title: v.title,
      projectId: v.projectId ?? null,
      parentId: v.parentId ?? null,
      companyId,
      dueOn: v.dueOn ?? null,
      priority: v.priority ?? "media",
      description: v.description ?? null,
      createdBy: viewer.id,
    })
    .returning();
  const assignees = v.assigneeIds?.length ? v.assigneeIds : [viewer.id];
  await db.insert(taskAssignees).values(assignees.map((userId) => ({ taskId: t.id, userId })));
  refresh();
  return { ok: true, data: { id: t.id } };
}

const interactionInput = z.object({
  type: z.enum(["nota", "chiamata", "meeting"]),
  title: required("Titolo"),
  summary: optionalText,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
  personId: uuid,
  companyId: uuid,
  opportunityId: uuid,
  projectId: uuid,
});

/** "Aggiungi interazione": chiamate e incontri fuori calendario (specifica, sezione 6). */
export async function addInteraction(input: z.input<typeof interactionInput>): Promise<Result> {
  const viewer = await requireViewer();
  const parsed = interactionInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  let companyId = v.companyId ?? null;
  if (!companyId && v.personId) {
    const [p] = await db.select({ companyId: people.companyId }).from(people).where(eq(people.id, v.personId));
    companyId = p?.companyId ?? null;
  }
  const [i] = await db
    .insert(interactions)
    .values({
      type: v.type,
      title: v.title,
      summary: v.summary ?? null,
      occurredAt: new Date(`${v.date}T12:00:00+01:00`),
      visibility: "team",
      ownerId: viewer.id,
      origin: "utente",
      companyId,
      opportunityId: v.opportunityId ?? null,
      projectId: v.projectId ?? null,
    })
    .returning();
  if (v.personId) {
    await db.insert(interactionPeople).values({ interactionId: i.id, personId: v.personId });
    await refreshLastInteractions(db, [v.personId]);
    await recomputeFollowups(db, { people: [v.personId] });
  }
  refresh();
  return { ok: true, data: { id: i.id } };
}

// ---------------------------------------------------------------------------
// Modifica di un campo, dalle schede
// ---------------------------------------------------------------------------

const companyFields = {
  name: required("Nome"),
  description: optionalText,
  country: optionalText,
  website: url,
  linkedin: url,
  driveFolderUrl: url,
  domains: tags,
  categories: tags,
  relationship: z.enum(relationshipEnum.enumValues),
  dataStatus: z.enum(dataStatusEnum.enumValues),
  ownerId: uuid,
};

const personFields = {
  firstName: required("Nome"),
  lastName: z.string().trim().max(200),
  position: optionalText,
  email: z.string().trim().email("Email non valida").or(z.literal("")).transform((v) => (v ? v.toLowerCase() : null)),
  otherEmails: tags,
  phone: optionalText,
  linkedin: url,
  firstMeetingNotes: optionalText,
  metVia: z.enum(metViaEnum.enumValues).nullable(),
  eventId: uuid,
  interests: tags,
  ownerId: uuid,
  companyId: uuid,
  followupMode: z.enum(followupModeEnum.enumValues).nullable(),
  snoozeUntil: isoDate,
  language: z.enum(languageEnum.enumValues).nullable(),
};

const opportunityFields = {
  name: required("Nome del deal"),
  companyId: z.string().uuid(),
  personId: uuid,
  ownerId: uuid,
  initialValue: money,
  finalValue: money,
  quoteSentOn: isoDate,
  quoteUrl: url,
  notes: optionalText,
  snoozeUntil: isoDate,
};

const projectFields = {
  name: required("Nome del progetto"),
  description: optionalText,
  status: z.enum(projectStatusEnum.enumValues),
  health: z.enum(healthEnum.enumValues),
  companyId: uuid,
  ownerId: uuid,
  startOn: isoDate,
  dueOn: isoDate,
  driveFolderUrl: url,
};

const taskFields = {
  title: required("Titolo"),
  description: optionalText,
  status: z.enum(taskStatusEnum.enumValues),
  priority: z.enum(priorityEnum.enumValues),
  dueOn: isoDate,
  projectId: uuid,
};

const ENTITIES = {
  company: { table: companies, fields: companyFields },
  person: { table: people, fields: personFields },
  opportunity: { table: opportunities, fields: opportunityFields },
  project: { table: projects, fields: projectFields },
  task: { table: tasks, fields: taskFields },
} as const;

export type Entity = keyof typeof ENTITIES;
export type FieldValue = string | number | string[] | null;

export async function updateField(entity: Entity, id: string, field: string, value: FieldValue): Promise<Result<{ value: unknown }>> {
  const viewer = await requireViewer();
  const config = ENTITIES[entity];
  if (!config) return fail("Record sconosciuto");
  const schema = (config.fields as Record<string, z.ZodType>)[field];
  if (!schema) return fail("Questo campo non si modifica da qui");
  const parsed = schema.safeParse(value === "" && field !== "email" ? null : value);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const next = parsed.data as never;
  const table = config.table;

  // Controlli e conseguenze specifiche
  if (entity === "person" && field === "email" && next) {
    const other = await emailTaken(next, id);
    if (other) return fail(`L'email è già di ${other.firstName} ${other.lastName}`.trim());
  }
  if (entity === "person" && field === "otherEmails") {
    for (const e of next as unknown as string[]) {
      const other = await emailTaken(e, id);
      if (other) return fail(`${e} è già di ${other.firstName} ${other.lastName}`.trim());
    }
  }

  let previous: Record<string, unknown> | undefined;
  if (entity === "opportunity") {
    [previous] = await db.select().from(opportunities).where(eq(opportunities.id, id));
    if (!previous) return fail("Opportunità non trovata");
    if (field === "finalValue" && previous.stage === "vinta" && next == null) return fail("Un deal vinto deve avere il valore finale");
  }

  const patch: Record<string, unknown> = { [field]: next };
  if ("updatedAt" in table) patch.updatedAt = new Date();
  if (entity === "task" && field === "status") patch.completedAt = next === "fatto" ? new Date() : null;
  if (entity === "opportunity" && field === "quoteSentOn" && next && previous?.stage === "lead") patch.stage = "in_progress";

  const updated = await db
    .update(table)
    .set(patch as never)
    .where(eq((table as typeof companies).id, id))
    .returning();
  if (!updated.length) return fail("Record non trovato");

  // Ogni cambio di valore lascia una riga nella storia del deal (specifica, sezione 5)
  if (entity === "opportunity" && (field === "initialValue" || field === "finalValue")) {
    const before = previous?.[field] as number | null;
    if (before !== next) {
      await db.insert(interactions).values({
        type: "modifica_valore",
        title: `${field === "initialValue" ? "Valore iniziale" : "Valore finale"}: ${formatEuro(before)} → ${formatEuro(next as unknown as number)}`,
        occurredAt: new Date(),
        visibility: "team",
        ownerId: viewer.id,
        origin: "utente",
        companyId: previous?.companyId as string,
        opportunityId: id,
      });
    }
  }

  if (entity === "person" && ["followupMode", "snoozeUntil"].includes(field)) {
    await recomputeFollowups(db, { people: [id] });
  }
  if (entity === "opportunity" && ["quoteSentOn", "snoozeUntil", "personId"].includes(field)) {
    await recomputeFollowups(db);
  }

  refresh();
  return { ok: true, data: { value: next } };
}

export async function setTaskAssignees(taskId: string, userIds: string[]): Promise<Result<{ id: string }>> {
  await requireViewer();
  const ids = z.array(z.string().uuid()).safeParse(userIds);
  if (!ids.success) return fail("Assegnatari non validi");
  await db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
  if (ids.data.length) await db.insert(taskAssignees).values(ids.data.map((userId) => ({ taskId, userId })));
  refresh();
  return { ok: true, data: { id: taskId } };
}

export async function setProjectMembers(projectId: string, userIds: string[]): Promise<Result<{ id: string }>> {
  await requireViewer();
  const ids = z.array(z.string().uuid()).safeParse(userIds);
  if (!ids.success) return fail("Team non valido");
  await db.delete(projectMembers).where(eq(projectMembers.projectId, projectId));
  if (ids.data.length) await db.insert(projectMembers).values(ids.data.map((userId) => ({ projectId, userId })));
  refresh();
  return { ok: true, data: { id: projectId } };
}

/** Un task si può eliminare. Persone e aziende no: si archiviano, così resta lo storico. */
export async function deleteTask(taskId: string): Promise<Result<{ id: string }>> {
  await requireViewer();
  await db.delete(tasks).where(eq(tasks.parentId, taskId));
  await db.delete(tasks).where(eq(tasks.id, taskId));
  refresh();
  return { ok: true, data: { id: taskId } };
}

export async function archivePerson(personId: string): Promise<Result<{ id: string }>> {
  await requireViewer();
  await db.update(people).set({ status: "archiviato" }).where(eq(people.id, personId));
  await recomputeFollowups(db, { people: [personId] });
  refresh();
  return { ok: true, data: { id: personId } };
}

// ---------------------------------------------------------------------------
// Impostazioni (specifica, sezione 6): si cambiano senza toccare il codice
// ---------------------------------------------------------------------------

const days = (label: string, max: number) =>
  z.coerce.number().int(`${label}: numero intero`).min(1, `${label}: almeno 1 giorno`).max(max, `${label}: al massimo ${max}`);

const followupSettingsInput = z
  .object({
    warmDays: days("Cadenza Caldo", 365),
    coldDays: days("Cadenza Freddo", 730),
    quoteReminderDays: days("Promemoria preventivo", 60),
    quoteMaxReminders: z.coerce.number().int().min(1, "Almeno 1 promemoria").max(30, "Al massimo 30 promemoria"),
    staleLeadDays: days("Lead fermo", 90),
    maxDraftsPerDay: z.coerce.number().int().min(1, "Almeno 1 bozza").max(100, "Al massimo 100 bozze"),
  })
  .refine((v) => v.warmDays < v.coldDays, { message: "La cadenza Caldo deve essere più breve di quella Freddo" });

export async function saveFollowupSettings(input: z.input<typeof followupSettingsInput>): Promise<Result<{ id: string }>> {
  await requireViewer();
  const parsed = followupSettingsInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  await db
    .insert(settings)
    .values({ key: "followup", value: parsed.data })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed.data } });
  // Le nuove cadenze valgono subito: si ricalcolano tutte le date
  await recomputeFollowups(db);
  refresh();
  return { ok: true, data: { id: "followup" } };
}

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Dominio non valido");

const generalSettingsInput = z.object({
  digestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario non valido"),
  digestDays: z.enum(["lun-ven", "tutti"]),
  internalDomains: z.array(domain).min(1, "Serve almeno il dominio di Somaspace"),
  categories: z.array(z.string().trim().min(1).max(40)).min(1, "Serve almeno una categoria"),
});

export async function saveGeneralSettings(input: z.input<typeof generalSettingsInput>): Promise<Result<{ id: string }>> {
  await requireViewer();
  const parsed = generalSettingsInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const rows = [
    { key: "digest", value: { time: v.digestTime, days: v.digestDays, timezone: "Europe/Rome" } },
    { key: "internal_domains", value: [...new Set(v.internalDomains)] },
    { key: "categories", value: [...new Set(v.categories)] },
  ];
  for (const r of rows) {
    await db.insert(settings).values(r).onConflictDoUpdate({ target: settings.key, set: { value: r.value } });
  }
  refresh();
  return { ok: true, data: { id: "general" } };
}

/** Domini e mittenti esclusi: newsletter, notifiche, fornitori. Non diventano mai contatti. */
export async function addExcludedAddress(address: string, reason?: string): Promise<Result<{ id: string }>> {
  await requireViewer();
  const a = z.string().trim().toLowerCase().min(3, "Indirizzo o dominio troppo corto").max(200).safeParse(address);
  if (!a.success) return fail(firstIssue(a.error));
  await db.insert(excludedAddresses).values({ address: a.data, reason: reason?.trim() || null }).onConflictDoNothing();
  refresh();
  return { ok: true, data: { id: a.data } };
}

export async function removeExcludedAddress(address: string): Promise<Result<{ id: string }>> {
  await requireViewer();
  await db.delete(excludedAddresses).where(eq(excludedAddresses.address, address));
  refresh();
  return { ok: true, data: { id: address } };
}

// ---------------------------------------------------------------------------
// Owner in blocco, dalle tabelle
// ---------------------------------------------------------------------------

const bulkOwnerInput = z.object({
  entity: z.enum(["company", "person"]),
  ids: z.array(z.string().uuid()).min(1, "Seleziona almeno una riga").max(1000),
  ownerId: z.string().uuid().nullable(),
  /** Per le aziende: dà lo stesso owner alle loro persone che non ne hanno uno */
  includePeople: z.boolean().optional(),
});

export async function assignOwner(input: z.input<typeof bulkOwnerInput>): Promise<Result<{ updated: number }>> {
  await requireViewer();
  const parsed = bulkOwnerInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { entity, ids, ownerId, includePeople } = parsed.data;
  let updated = 0;
  if (entity === "company") {
    const rows = await db.update(companies).set({ ownerId, updatedAt: new Date() }).where(inArray(companies.id, ids)).returning({ id: companies.id });
    updated = rows.length;
    if (includePeople && ownerId) {
      const ppl = await db
        .update(people)
        .set({ ownerId, updatedAt: new Date() })
        .where(and(inArray(people.companyId, ids), isNull(people.ownerId)))
        .returning({ id: people.id });
      updated += ppl.length;
    }
  } else {
    const rows = await db.update(people).set({ ownerId, updatedAt: new Date() }).where(inArray(people.id, ids)).returning({ id: people.id });
    updated = rows.length;
  }
  refresh();
  return { ok: true, data: { updated } };
}

/** Modalità di follow-up per più persone insieme: Caldo, Freddo o Nessuno (escono dai follow-up). */
export async function setFollowupModeBulk(ids: string[], mode: "caldo" | "freddo" | "nessuno"): Promise<Result<{ updated: number }>> {
  await requireViewer();
  const parsed = z.array(z.string().uuid()).min(1, "Seleziona almeno una persona").max(1000).safeParse(ids);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!followupModeEnum.enumValues.includes(mode)) return fail("Modalità non valida");
  const rows = await db.update(people).set({ followupMode: mode, updatedAt: new Date() }).where(inArray(people.id, parsed.data)).returning({ id: people.id });
  await recomputeFollowups(db, { people: parsed.data });
  refresh();
  return { ok: true, data: { updated: rows.length } };
}

/** Le persone prendono l'owner della loro azienda (specifica, sezione 4: di default l'owner dell'azienda). */
export async function inheritCompanyOwner(personIds: string[]): Promise<Result<{ updated: number }>> {
  await requireViewer();
  const ids = z.array(z.string().uuid()).min(1, "Seleziona almeno una persona").safeParse(personIds);
  if (!ids.success) return fail(firstIssue(ids.error));
  const res = (await db.execute(sql`
    update people p set owner_id = c.owner_id, updated_at = now()
    from companies c
    where p.company_id = c.id and c.owner_id is not null and p.id in (${sql.join(ids.data.map((i) => sql`${i}::uuid`), sql`, `)})
    returning p.id
  `)) as unknown as unknown[] | { rows: unknown[] };
  refresh();
  // PGlite restituisce { rows }, postgres-js direttamente l'elenco
  return { ok: true, data: { updated: Array.isArray(res) ? res.length : res.rows.length } };
}

// ---------------------------------------------------------------------------
// Opportunità suggerite
// ---------------------------------------------------------------------------

/** Ricalcola subito i suggerimenti a regole (di solito girano da soli una volta al giorno). */
export async function runSuggestions(): Promise<Result<{ created: number; updated: number; removed: number }>> {
  const viewer = await requireViewer();
  const res = await runSuggestionRules(db, viewer.id);
  refresh();
  return { ok: true, data: res };
}

const ORIGIN_BY_REASON = { servizio: "servizio", bando: "bando", segnale: "segnale", dormiente: "diretta", ripresa: "diretta" } as const;

/**
 * Accetta un suggerimento. Con `createOpportunity` apre anche un deal in Lead,
 * intestato all'owner dell'azienda (o a chi accetta, se l'azienda non ne ha uno).
 */
export async function acceptSuggestion(id: string, createOpportunity: boolean): Promise<Result<{ opportunityId: string | null }>> {
  const viewer = await requireViewer();
  if (!z.string().uuid().safeParse(id).success) return fail("Suggerimento non valido");
  const [row] = await db
    .select({ s: suggestions, company: companies, service: services, source: opportunities })
    .from(suggestions)
    .innerJoin(companies, eq(companies.id, suggestions.companyId))
    .leftJoin(services, eq(services.id, suggestions.serviceId))
    .leftJoin(opportunities, eq(opportunities.id, suggestions.sourceOpportunityId))
    .where(eq(suggestions.id, id));
  if (!row) return fail("Suggerimento non trovato");
  if (row.s.status !== "nuovo") return fail("Questo suggerimento è già stato deciso");

  let opportunityId: string | null = null;
  if (createOpportunity) {
    const what = row.service?.name ?? (row.s.reason === "ripresa" && row.source ? `Ripresa: ${row.source.name.split(" · ")[0]}` : "Nuova proposta");
    const [o] = await db
      .insert(opportunities)
      .values({
        name: `${what} · ${row.company.name}`,
        companyId: row.company.id,
        personId: row.s.personId,
        ownerId: row.company.ownerId ?? viewer.id,
        stage: "lead",
        origin: ORIGIN_BY_REASON[row.s.reason],
        notes: `Dal suggerimento: ${row.s.rationale}`,
      })
      .returning({ id: opportunities.id });
    opportunityId = o.id;
    await recomputeFollowups(db, { opportunities: [o.id] });
  }
  await db.update(suggestions).set({ status: "accettato", decidedAt: new Date(), opportunityId }).where(eq(suggestions.id, id));
  await db.insert(agentLog).values({
    action: "suggerimento_accettato",
    entityType: opportunityId ? "opportunity" : "company",
    entityId: opportunityId ?? row.company.id,
    outcome: "ok",
    detail: `${row.company.name}: ${opportunityId ? "aperto un deal in Lead" : "accettato senza deal"}`,
    onBehalfOf: viewer.id,
  });
  refresh();
  return { ok: true, data: { opportunityId } };
}

export async function discardSuggestion(id: string): Promise<Result<{ id: string }>> {
  await requireViewer();
  if (!z.string().uuid().safeParse(id).success) return fail("Suggerimento non valido");
  await db.update(suggestions).set({ status: "scartato", decidedAt: new Date() }).where(and(eq(suggestions.id, id), eq(suggestions.status, "nuovo")));
  refresh();
  return { ok: true, data: { id } };
}

const suggestionSettingsInput = z.object({
  dormantDays: z.coerce.number().int().min(30, "Almeno 30 giorni").max(1095, "Al massimo 3 anni"),
});

export async function saveSuggestionSettings(input: z.input<typeof suggestionSettingsInput>): Promise<Result<{ created: number; removed: number }>> {
  const viewer = await requireViewer();
  const parsed = suggestionSettingsInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  await db
    .insert(settings)
    .values({ key: "suggestions", value: parsed.data })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed.data } });
  const res = await runSuggestionRules(db, viewer.id);
  refresh();
  return { ok: true, data: { created: res.created, removed: res.removed } };
}

// ---------------------------------------------------------------------------
// Google: sincronizzazione a mano e scollegamento, solo della propria casella
// ---------------------------------------------------------------------------

export async function syncMyGoogle(): Promise<Result<{ recorded: number; proposed: number; events: number; more: boolean }>> {
  const viewer = await requireViewer();
  const res = await syncGoogleAccount(db, viewer.id);
  refresh();
  if (!res.ok) return fail(res.error);
  return { ok: true, data: { recorded: res.recorded, proposed: res.proposed, events: res.events, more: res.more } };
}

/** Revoca l'accesso a Google e toglie gli eventi del calendario. Le email già registrate restano, private. */
export async function disconnectGoogle(): Promise<Result<{ id: string }>> {
  const viewer = await requireViewer();
  const [acc] = await db.select().from(googleAccounts).where(eq(googleAccounts.userId, viewer.id));
  if (acc) {
    await revokeGoogle(decrypt(acc.refreshToken)).catch(() => undefined);
    await db.delete(calendarEvents).where(eq(calendarEvents.userId, viewer.id));
    await db.delete(googleAccounts).where(eq(googleAccounts.userId, viewer.id));
  }
  refresh();
  return { ok: true, data: { id: viewer.id } };
}

// ---------------------------------------------------------------------------
// Contatti proposti dall'agente: approvare o scartare, anche in blocco.
// Ognuno decide solo i propri (dalla sua casella) o quelli senza owner.
// ---------------------------------------------------------------------------

const pendingIds = z.array(z.string().uuid()).min(1, "Seleziona almeno un contatto").max(1000);

export async function approvePeople(ids: string[]): Promise<Result<{ updated: number }>> {
  const viewer = await requireViewer();
  const parsed = pendingIds.safeParse(ids);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const rows = await db
    .update(people)
    .set({ status: "attivo", updatedAt: new Date() })
    .where(
      and(inArray(people.id, parsed.data), eq(people.status, "da_approvare"), or(eq(people.ownerId, viewer.id), isNull(people.ownerId))),
    )
    .returning({ id: people.id });
  if (rows.length) await recomputeFollowups(db, { people: rows.map((r) => r.id) });
  refresh();
  return { ok: true, data: { updated: rows.length } };
}

/** Scartare un contatto esclude il suo indirizzo: l'agente non lo propone più. */
export async function discardPeople(ids: string[]): Promise<Result<{ updated: number }>> {
  const viewer = await requireViewer();
  const parsed = pendingIds.safeParse(ids);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const rows = await db
    .update(people)
    .set({ status: "archiviato", updatedAt: new Date() })
    .where(
      and(inArray(people.id, parsed.data), eq(people.status, "da_approvare"), or(eq(people.ownerId, viewer.id), isNull(people.ownerId))),
    )
    .returning({ email: people.email });
  const emails = rows.flatMap((r) => (r.email ? [r.email] : []));
  if (emails.length) {
    await db
      .insert(excludedAddresses)
      .values(emails.map((address) => ({ address, reason: "Scartato da Da approvare" })))
      .onConflictDoNothing();
  }
  refresh();
  return { ok: true, data: { updated: rows.length } };
}
