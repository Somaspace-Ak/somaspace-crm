"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/db";
import {
  agentLog,
  companies,
  excludedAddresses,
  facts,
  interactionPeople,
  interactions,
  opportunities,
  people,
  projectMembers,
  projects,
  tasks,
  type followupModeEnum,
  type lostReasonEnum,
} from "@/db/schema";
import { addDays, todayInRome } from "@/lib/followup/dates";
import { formatEuro } from "@/lib/format";
import { recomputeFollowups } from "./followups";
import { authEnabled } from "@/lib/supabase/config";
import { requireViewer, VIEWER_COOKIE } from "./session";

type Mode = (typeof followupModeEnum.enumValues)[number];
type LostReason = (typeof lostReasonEnum.enumValues)[number];

function refresh() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Utente (solo prototipo: in produzione è il login Google)
// ---------------------------------------------------------------------------

export async function switchViewer(email: string) {
  // Solo in locale: online si entra con il login
  if (authEnabled) throw new Error("Con il login attivo non si cambia utente");
  const jar = await cookies();
  jar.set(VIEWER_COOKIE, email, { path: "/", httpOnly: true, sameSite: "lax" });
  refresh();
}

// ---------------------------------------------------------------------------
// Coda Oggi
// ---------------------------------------------------------------------------

export async function snooze(kind: "persona" | "opportunita", id: string, until: string) {
  await requireViewer();
  if (kind === "persona") await db.update(people).set({ snoozeUntil: until }).where(eq(people.id, id));
  else await db.update(opportunities).set({ snoozeUntil: until }).where(eq(opportunities.id, id));
  await recomputeFollowups(db, kind === "persona" ? { people: [id] } : { opportunities: [id] });
  refresh();
}

export async function snoozeBy(kind: "persona" | "opportunita", id: string, days: number) {
  return snooze(kind, id, addDays(todayInRome(), days));
}

/** "Segna come fatto": chiamata o incontro senza email. Registra l'interazione e ricalcola. */
export async function markFollowupDone(kind: "persona" | "opportunita", id: string, note?: string) {
  const viewer = await requireViewer();
  const today = todayInRome();
  const now = new Date();

  if (kind === "opportunita") {
    const [o] = await db.select().from(opportunities).where(eq(opportunities.id, id));
    if (!o) return;
    await db
      .update(opportunities)
      .set({ followupStep: Math.min(o.followupStep + 1, 4), lastFollowupOn: today, snoozeUntil: null, draftUrl: null })
      .where(eq(opportunities.id, id));
    const [i] = await db
      .insert(interactions)
      .values({
        type: "nota",
        title: `Follow-up passo ${Math.min(o.followupStep + 1, 4)} fatto`,
        summary: note || "Segnato come fatto dall'app.",
        occurredAt: now,
        visibility: "team",
        ownerId: viewer.id,
        origin: "utente",
        companyId: o.companyId,
        opportunityId: o.id,
      })
      .returning();
    if (o.personId) await db.insert(interactionPeople).values({ interactionId: i.id, personId: o.personId });
    await recomputeFollowups(db, { opportunities: [id] });
  } else {
    const [p] = await db.select().from(people).where(eq(people.id, id));
    if (!p) return;
    // Un contatto fatto conta come email in uscita: la cadenza riparte da oggi
    const [i] = await db
      .insert(interactions)
      .values({
        type: "email_inviata",
        title: "Follow-up fatto",
        summary: note || "Segnato come fatto dall'app.",
        occurredAt: now,
        visibility: "team",
        ownerId: viewer.id,
        origin: "utente",
        companyId: p.companyId,
      })
      .returning();
    await db.insert(interactionPeople).values({ interactionId: i.id, personId: id });
    await db.update(people).set({ lastInteractionAt: now, snoozeUntil: null, draftUrl: null }).where(eq(people.id, id));
    await recomputeFollowups(db, { people: [id] });
  }
  refresh();
}

export async function changeMode(personId: string, mode: Mode) {
  await requireViewer();
  await db.update(people).set({ followupMode: mode }).where(eq(people.id, personId));
  await recomputeFollowups(db, { people: [personId] });
  refresh();
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function moveOpportunity(
  id: string,
  stage: "lead" | "in_progress" | "vinta" | "persa",
  extra: { finalValue?: number; lostReason?: LostReason; quoteSentOn?: string } = {},
) {
  const viewer = await requireViewer();
  const [o] = await db.select().from(opportunities).where(eq(opportunities.id, id));
  if (!o) return { ok: false, error: "Opportunità non trovata" };

  // Regole della specifica: ogni stage chiede il suo dato obbligatorio
  if (stage === "vinta" && !(extra.finalValue && extra.finalValue > 0)) return { ok: false, error: "Serve il valore finale" };
  if (stage === "persa" && !extra.lostReason) return { ok: false, error: "Serve il motivo" };
  if (stage === "in_progress" && !(extra.quoteSentOn ?? o.quoteSentOn)) return { ok: false, error: "Serve la data di invio del preventivo" };

  const today = todayInRome();
  await db
    .update(opportunities)
    .set({
      stage,
      finalValue: stage === "vinta" ? extra.finalValue : o.finalValue,
      lostReason: stage === "persa" ? extra.lostReason : null,
      quoteSentOn: extra.quoteSentOn ?? o.quoteSentOn,
      closedOn: stage === "vinta" || stage === "persa" ? today : null,
      updatedAt: new Date(),
    })
    .where(eq(opportunities.id, id));

  if (stage === "vinta" && extra.finalValue !== o.finalValue) {
    await db.insert(interactions).values({
      type: "modifica_valore",
      title: `Valore finale: ${formatEuro(extra.finalValue)}`,
      summary: o.initialValue ? `Valore iniziale ${formatEuro(o.initialValue)}.` : null,
      occurredAt: new Date(),
      visibility: "team",
      ownerId: viewer.id,
      origin: "utente",
      companyId: o.companyId,
      opportunityId: o.id,
    });
  }

  if (stage === "vinta") {
    // Il progetto nasce senza importi: restano solo nell'opportunità
    const existing = await db.select().from(projects).where(eq(projects.opportunityId, o.id));
    if (!existing.length) {
      const [prj] = await db
        .insert(projects)
        .values({
          name: o.name,
          companyId: o.companyId,
          opportunityId: o.id,
          status: "da_avviare",
          ownerId: o.ownerId ?? viewer.id,
          startOn: today,
          agentSummary: "Progetto appena aperto dalla vittoria del deal.",
        })
        .returning();
      await db.insert(projectMembers).values({ projectId: prj.id, userId: o.ownerId ?? viewer.id });
      await db.insert(tasks).values({
        title: "Kick-off con il cliente",
        projectId: prj.id,
        status: "proposto",
        priority: "alta",
        dueOn: addDays(today, 5),
        origin: "agente",
        rationale: "Primo passo di ogni progetto nuovo.",
      });
      await db.insert(agentLog).values({
        action: "Progetto creato",
        entityType: "project",
        entityId: prj.id,
        outcome: "ok",
        detail: `Dal deal vinto "${o.name}"`,
        onBehalfOf: viewer.id,
      });
    }
    await db.update(companies).set({ relationship: "cliente" }).where(eq(companies.id, o.companyId));
  }

  await recomputeFollowups(db);
  refresh();
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export async function toggleTask(id: string, done: boolean) {
  await requireViewer();
  await db
    .update(tasks)
    .set({ status: done ? "fatto" : "da_fare", completedAt: done ? new Date() : null, updatedAt: new Date() })
    .where(eq(tasks.id, id));
  refresh();
}

// ---------------------------------------------------------------------------
// Da approvare: l'agente propone, le persone decidono
// ---------------------------------------------------------------------------

export async function acceptTask(id: string) {
  await requireViewer();
  await db.update(tasks).set({ status: "da_fare" }).where(and(eq(tasks.id, id), eq(tasks.status, "proposto")));
  refresh();
}

export async function discardTask(id: string) {
  await requireViewer();
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.status, "proposto")));
  refresh();
}

export async function approvePerson(id: string) {
  await requireViewer();
  await db.update(people).set({ status: "attivo" }).where(eq(people.id, id));
  await recomputeFollowups(db, { people: [id] });
  refresh();
}

/** Scartare un indirizzo lo esclude dai suggerimenti futuri. */
export async function discardPerson(id: string) {
  await requireViewer();
  const [p] = await db.update(people).set({ status: "archiviato" }).where(eq(people.id, id)).returning();
  if (p?.email) {
    await db.insert(excludedAddresses).values({ address: p.email, reason: "Scartato da Da approvare" }).onConflictDoNothing();
  }
  refresh();
}

export async function acceptModeProposal(id: string) {
  await requireViewer();
  const [p] = await db.select().from(people).where(eq(people.id, id));
  if (!p?.proposedMode) return;
  await db.update(people).set({ followupMode: p.proposedMode, proposedMode: null, proposedModeReason: null }).where(eq(people.id, id));
  await recomputeFollowups(db, { people: [id] });
  refresh();
}

/** Dopo la migrazione arrivano decine di proposte: si possono confermare tutte insieme. */
export async function acceptAllModeProposals() {
  await requireViewer();
  await db.execute(sql`
    update people set followup_mode = proposed_mode, proposed_mode = null, proposed_mode_reason = null
    where proposed_mode is not null and status = 'attivo'
  `);
  await recomputeFollowups(db);
  refresh();
}

export async function dismissModeProposal(id: string) {
  await requireViewer();
  await db.update(people).set({ proposedMode: null, proposedModeReason: null }).where(eq(people.id, id));
  refresh();
}

export async function verifyCompany(id: string) {
  await requireViewer();
  await db.update(companies).set({ dataStatus: "verificato" }).where(eq(companies.id, id));
  refresh();
}

// ---------------------------------------------------------------------------
// Opportunità suggerite e fatti condivisi
// ---------------------------------------------------------------------------

/** Ogni fondatore può ritirare un fatto che la sua casella ha condiviso. */
export async function retractFact(id: string) {
  const viewer = await requireViewer();
  await db
    .update(facts)
    .set({ retractedAt: new Date() })
    .where(and(eq(facts.id, id), eq(facts.contributorId, viewer.id)));
  refresh();
}
