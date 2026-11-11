import "server-only";
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { interactionPeople, interactions, meetingParticipants, meetings, projects, users, type MeetingDoc } from "@/db/schema";
import { docKind, fileIdOf, guessProject, isGoogleDoc, parseGeminiNotes } from "@/lib/meetings/notes";
import { refreshLastInteractions } from "../followups";
import { GoogleError, googleGetText } from "./client";
import type { Ctx, SyncedEvent } from "./sync";

/**
 * I meeting fatti, dal Google Calendar di ogni fondatore.
 *
 * Un evento passato diventa un meeting del CRM se ha i file di Meet (registrazione, trascrizione,
 * note di Gemini), oppure se è con un cliente o nomina un progetto. Il meeting si lega a cliente,
 * progetto e persone (dagli invitati) e lascia una riga nella timeline. Le note di Gemini e la
 * trascrizione si leggono da Drive: il riepilogo diventa il recap del meeting.
 *
 * Lo stesso evento nel calendario di più fondatori è un solo meeting. Con un cliente è del team;
 * le riunioni interne restano visibili solo a chi c'era.
 */

const DAY = 86_400_000;
/** Documenti letti da Drive per giro e per account: gli altri al giro dopo. */
const DOCS_PER_RUN = 12;
/** Un documento che non si riesce a leggere si riprova dopo qualche ora (Meet lo allega in ritardo). */
const DOCS_RETRY_MS = 6 * 3_600_000;
const MAX_TEXT = 300_000;

export async function syncMeetings(db: Db, userId: string, token: string, ctx: Ctx, events: SyncedEvent[], canReadDrive: boolean) {
  const now = Date.now();
  const [projectRows, userRows] = await Promise.all([
    db.select({ id: projects.id, name: projects.name, companyId: projects.companyId, status: projects.status }).from(projects),
    db.select({ id: users.id, email: users.email }).from(users),
  ]);
  const userByEmail = new Map(userRows.map((u) => [u.email.toLowerCase(), u.id]));

  // I candidati: eventi finiti, non di tutto il giorno, con qualcuno oltre a me o con i file di Meet
  const candidates = events
    .filter((e) => !e.allDay && ((e.endsAt ?? e.startsAt) as Date).getTime() <= now)
    .map((e) => {
      const docs: MeetingDoc[] = (e.attachments ?? []).map((a) => ({
        kind: docKind(a),
        title: a.title,
        url: a.url,
        fileId: fileIdOf(a),
        mimeType: a.mimeType,
      }));
      const project = guessProject(projectRows, e.companyId ?? null, e.title);
      const companyId = e.companyId ?? project?.companyId ?? null;
      return { e, docs, project, companyId, hasMeetDocs: docs.some((d) => d.kind !== "altro") };
    })
    .filter((c) => c.hasMeetDocs || ((c.companyId || c.project) && (c.e.attendees?.length ?? 0) > 0));

  const existing = new Map<string, typeof meetings.$inferSelect>();
  for (let i = 0; i < candidates.length; i += 200) {
    const ids = candidates.slice(i, i + 200).map((c) => c.e.googleId);
    for (const m of await db.select().from(meetings).where(inArray(meetings.googleEventId, ids))) existing.set(m.googleEventId!, m);
  }

  let created = 0;
  const touched = new Set<string>();
  for (const c of candidates) {
    const { e } = c;
    const before = existing.get(e.googleId);
    const recent = (e.startsAt as Date).getTime() >= now - 31 * DAY;
    const mergedDocs = mergeDocs(before?.docs ?? [], c.docs);
    const docsChanged = !before || mergedDocs.length !== before.docs.length;
    // I meeting vecchi già registrati non cambiano più, salvo file nuovi allegati
    if (before && !recent && !docsChanged) continue;

    let m = before;
    if (!m) {
      const ownerId = (e.organizer && userByEmail.get(e.organizer)) || userId;
      [m] = await db
        .insert(meetings)
        .values({
          title: e.title,
          occurredAt: e.startsAt as Date,
          endsAt: (e.endsAt as Date | null) ?? null,
          source: "meet",
          companyId: c.companyId,
          projectId: c.project?.id ?? null,
          ownerId,
          visibility: c.companyId ? "team" : "privata",
          googleEventId: e.googleId,
          meetLink: e.meetLink ?? null,
          docs: mergedDocs,
        })
        .onConflictDoNothing()
        .returning();
      // Un altro fondatore l'ha appena registrato in parallelo
      if (!m) [m] = await db.select().from(meetings).where(eq(meetings.googleEventId, e.googleId));
      else created++;
      if (!m) continue;
    } else {
      const patch: Partial<typeof meetings.$inferInsert> = {
        title: e.title,
        occurredAt: e.startsAt as Date,
        endsAt: (e.endsAt as Date | null) ?? null,
        meetLink: e.meetLink ?? m.meetLink,
        docs: mergedDocs,
      };
      // Il collegamento scelto a mano non si tocca; altrimenti si completa quello che manca
      if (!m.linkedManually) {
        if (!m.companyId && c.companyId) {
          patch.companyId = c.companyId;
          patch.visibility = "team";
        }
        if (!m.projectId && c.project) patch.projectId = c.project.id;
      }
      [m] = await db.update(meetings).set(patch).where(eq(meetings.id, m.id)).returning();
    }

    // Partecipanti: le persone del CRM tra gli invitati e i fondatori (io compreso)
    const personIds = [
      ...new Set(
        (e.attendees ?? [])
          .map((a) => ctx.personByEmail.get(a))
          .filter((p) => p && p.status !== "archiviato")
          .map((p) => p!.id),
      ),
    ];
    const userIds = [...new Set([userId, ...(e.attendees ?? []).map((a) => userByEmail.get(a)).filter((x): x is string => Boolean(x))])];
    if (!before || recent) {
      await db.delete(meetingParticipants).where(eq(meetingParticipants.meetingId, m.id));
      await db
        .insert(meetingParticipants)
        .values([...personIds.map((personId) => ({ meetingId: m!.id, personId })), ...userIds.map((uid) => ({ meetingId: m!.id, userId: uid }))]);
    }

    // Una riga nella timeline di cliente, persone e progetto: conta anche come ultimo contatto
    await upsertMeetingInteraction(db, m, personIds);
    for (const p of personIds) touched.add(p);
  }

  const docsRead = canReadDrive ? await readMeetingDocs(db, token, candidates.map((c) => c.e.googleId)) : 0;
  if (touched.size) await refreshLastInteractions(db, [...touched]);
  return { meetings: created, docsRead };
}

function mergeDocs(a: MeetingDoc[], b: MeetingDoc[]) {
  const byUrl = new Map(a.map((d) => [d.url, d]));
  for (const d of b) byUrl.set(d.url, { ...byUrl.get(d.url), ...d });
  return [...byUrl.values()];
}

/** La riga di timeline del meeting, con il recap se c'è. Una sola, anche con più fondatori. */
export async function upsertMeetingInteraction(db: Db, m: typeof meetings.$inferSelect, personIds?: string[]) {
  const values = {
    type: "meeting" as const,
    title: m.title,
    occurredAt: m.occurredAt,
    summary: m.summary ? oneLine(m.summary, 280) : null,
    link: `/meeting/${m.id}`,
    sourceId: `meet:${m.googleEventId ?? m.id}`,
    visibility: m.visibility,
    ownerId: m.ownerId,
    origin: "agente" as const,
    companyId: m.companyId,
    projectId: m.projectId,
    meetingId: m.id,
  };
  const [row] = await db
    .insert(interactions)
    .values(values)
    .onConflictDoUpdate({
      target: [interactions.sourceId, interactions.ownerId],
      set: { title: values.title, occurredAt: values.occurredAt, summary: values.summary, visibility: values.visibility, companyId: values.companyId, projectId: values.projectId, meetingId: m.id },
    })
    .returning({ id: interactions.id });
  if (row && personIds?.length) {
    await db
      .insert(interactionPeople)
      .values(personIds.map((personId) => ({ interactionId: row.id, personId })))
      .onConflictDoNothing();
  }
}

const oneLine = (t: string, max: number) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/**
 * Note di Gemini e trascrizioni dei meeting di questo calendario, lette da Drive come testo.
 * Solo i documenti Google; le registrazioni (video) restano un link.
 */
async function readMeetingDocs(db: Db, token: string, googleIds: string[]) {
  if (!googleIds.length) return 0;
  const retryBefore = new Date(Date.now() - DOCS_RETRY_MS);
  const pending = await db
    .select()
    .from(meetings)
    .where(
      and(
        isNotNull(meetings.googleEventId),
        inArray(meetings.googleEventId, googleIds.slice(0, 2000)),
        or(isNull(meetings.notes), isNull(meetings.transcript)),
        sql`jsonb_array_length(${meetings.docs}) > 0`,
        or(isNull(meetings.docsFetchedAt), lt(meetings.docsFetchedAt, retryBefore)),
      ),
    )
    .orderBy(sql`${meetings.occurredAt} desc`)
    .limit(DOCS_PER_RUN * 3);

  let read = 0;
  for (const m of pending) {
    if (read >= DOCS_PER_RUN) break;
    const notesDoc = m.notes ? null : m.docs.find((d) => d.kind === "note" && isGoogleDoc(d.mimeType) && d.fileId);
    const transcriptDoc = m.transcript ? null : m.docs.find((d) => d.kind === "trascrizione" && isGoogleDoc(d.mimeType) && d.fileId);
    if (!notesDoc && !transcriptDoc) continue;
    const patch: Partial<typeof meetings.$inferInsert> = { docsFetchedAt: new Date() };
    for (const doc of [notesDoc, transcriptDoc]) {
      if (!doc) continue;
      const text = await exportDoc(token, doc.fileId!);
      if (text == null) continue;
      read++;
      if (doc.kind === "note") {
        const parsed = parseGeminiNotes(text);
        patch.notes = text.slice(0, MAX_TEXT);
        if (!m.summary && parsed.summary) patch.summary = parsed.summary;
        if (!m.nextSteps.length && parsed.nextSteps.length) patch.nextSteps = parsed.nextSteps;
      } else patch.transcript = text.slice(0, MAX_TEXT);
    }
    const [updated] = await db.update(meetings).set(patch).where(eq(meetings.id, m.id)).returning();
    if (updated && patch.summary) await upsertMeetingInteraction(db, updated);
  }
  return read;
}

/** Il testo di un Google Doc. Se il file non è accessibile da questo account, null: ci prova un altro fondatore. */
async function exportDoc(token: string, fileId: string) {
  try {
    const text = await googleGetText(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export`, { mimeType: "text/plain" });
    return text.replace(/^﻿/, "");
  } catch (e) {
    if (e instanceof GoogleError && ["403", "404"].includes(e.code ?? "")) return null;
    throw e;
  }
}
