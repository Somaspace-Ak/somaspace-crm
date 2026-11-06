import "server-only";
import { and, eq, gte, inArray, lte, notInArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  agentLog,
  calendarEvents,
  companies,
  excludedAddresses,
  googleAccounts,
  interactionPeople,
  interactions,
  people,
  settings,
} from "@/db/schema";
import { decodeEntities, domainOf, isAutomated, isExcluded, isFreeMail, parseAddressList, splitName } from "@/lib/google/email";
import { decrypt } from "../crypto";
import { recomputeFollowups, refreshLastInteractions } from "../followups";
import { accessToken, GoogleError, googleGet, mapLimit } from "./client";

/**
 * Sincronizzazione in sola lettura di Gmail e Calendar, una casella per fondatore.
 *
 * Gmail: per ogni email con un contatto del CRM si registra un'interazione privata della casella
 * (oggetto, data, una riga di anteprima: mai il testo completo). I mittenti nuovi che non sono
 * newsletter o notifiche vanno in Da approvare. Le date aggiornano ultimo contatto e follow-up.
 *
 * Calendar: gli eventi dal mese scorso ai prossimi tre, con il link Meet e l'azienda dei partecipanti.
 */

/** Alla prima sincronizzazione si guarda indietro di tanti giorni. */
const FIRST_SYNC_DAYS = 90;
/** Email al massimo per giro: le altre al giro successivo. */
const MAX_MESSAGES = 400;
const DAY = 86_400_000;

type Ctx = {
  self: string;
  internalDomains: string[];
  excluded: string[];
  personByEmail: Map<string, { id: string; companyId: string | null; status: string }>;
  companyByDomain: Map<string, string>;
};

async function loadContext(db: Db, self: string): Promise<Ctx> {
  const [ppl, cos, ex, cfg] = await Promise.all([
    db.select({ id: people.id, email: people.email, other: people.otherEmails, companyId: people.companyId, status: people.status }).from(people),
    db.select({ id: companies.id, domains: companies.domains }).from(companies),
    db.select({ address: excludedAddresses.address }).from(excludedAddresses),
    db.select().from(settings).where(eq(settings.key, "internal_domains")),
  ]);
  const personByEmail = new Map<string, { id: string; companyId: string | null; status: string }>();
  for (const p of ppl) for (const e of [p.email, ...p.other]) if (e) personByEmail.set(e.toLowerCase(), { id: p.id, companyId: p.companyId, status: p.status });
  const companyByDomain = new Map<string, string>();
  for (const c of cos) for (const d of c.domains) companyByDomain.set(d.toLowerCase().replace(/^www\./, ""), c.id);
  return {
    self,
    internalDomains: (cfg[0]?.value as string[] | undefined) ?? ["somaspaceagency.com"],
    excluded: ex.map((x) => x.address),
    personByEmail,
    companyByDomain,
  };
}

// ---------------------------------------------------------------------------
// Gmail
// ---------------------------------------------------------------------------

type GmailMessage = {
  id: string;
  threadId: string;
  internalDate: string;
  snippet?: string;
  payload?: { headers?: { name: string; value: string }[] };
};

/** Gli id dei messaggi di una ricerca Gmail, dal più recente, fino a `cap`. */
async function listIds(token: string, q: string, cap: number) {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await googleGet<{ messages?: { id: string }[]; nextPageToken?: string }>(
      token,
      "https://gmail.googleapis.com/gmail/v1/users/me/messages",
      { q, maxResults: Math.min(100, cap - ids.length), pageToken },
    );
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < cap);
  return { ids, truncated: Boolean(pageToken) };
}

/** Quelle già registrate per questa casella non si rileggono. */
async function unknownIds(db: Db, userId: string, ids: string[]) {
  const known = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const rows = await db
      .select({ s: interactions.sourceId })
      .from(interactions)
      .where(and(eq(interactions.ownerId, userId), inArray(interactions.sourceId, ids.slice(i, i + 200))));
    rows.forEach((r) => r.s && known.add(r.s));
  }
  return ids.filter((id) => !known.has(id));
}

/**
 * Legge le intestazioni e registra le email con i contatti del CRM.
 * Con `proposeNew` un mittente sconosciuto che scrive di persona va in Da approvare.
 */
async function recordMessages(db: Db, userId: string, token: string, ctx: Ctx, ids: string[], proposeNew: boolean, touched: Set<string>) {
  const messages = await mapLimit(ids, 8, (id) =>
    googleGet<GmailMessage>(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`, { format: "metadata" }).catch(() => null),
  );
  let recorded = 0;
  let proposed = 0;
  for (const m of messages) {
    if (!m) continue;
    const h = (name: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === name)?.value ?? null;
    const from = parseAddressList(h("from"))[0];
    if (!from) continue;
    const outbound = from.email === ctx.self;
    const recipients = [...parseAddressList(h("to")), ...parseAddressList(h("cc"))];
    const external = (outbound ? recipients : [from, ...recipients]).filter(
      (a) => a.email !== ctx.self && !isExcluded(a.email, ctx.internalDomains, ctx.excluded),
    );
    const automated = isAutomated(from.email, { listUnsubscribe: h("list-unsubscribe"), precedence: h("precedence") });
    if (automated && !outbound) continue;

    const personIds: string[] = [];
    let companyId: string | null = null;
    for (const a of external) {
      let p = ctx.personByEmail.get(a.email);
      if (!p && proposeNew && !outbound && a.email === from.email && !isAutomated(a.email)) {
        const domainCompany = isFreeMail(a.email) ? null : (ctx.companyByDomain.get(domainOf(a.email)) ?? null);
        const [created] = await db
          .insert(people)
          .values({ ...splitName(a), email: a.email, companyId: domainCompany, ownerId: userId, status: "da_approvare" })
          .onConflictDoNothing()
          .returning({ id: people.id, companyId: people.companyId, status: people.status });
        if (created) {
          p = created;
          ctx.personByEmail.set(a.email, created);
          proposed++;
        }
      }
      if (!p || p.status === "archiviato") continue;
      personIds.push(p.id);
      companyId ??= p.companyId;
    }
    if (!personIds.length) continue;

    const [row] = await db
      .insert(interactions)
      .values({
        type: outbound ? "email_inviata" : "email_ricevuta",
        title: (h("subject") || "(senza oggetto)").slice(0, 200),
        occurredAt: new Date(Number(m.internalDate)),
        summary: m.snippet ? decodeEntities(m.snippet).slice(0, 240) : null,
        link: `https://mail.google.com/mail/?authuser=${encodeURIComponent(ctx.self)}#all/${m.threadId}`,
        sourceId: m.id,
        // Il contenuto resta della casella: al team arrivano solo date e fatti
        visibility: "privata",
        ownerId: userId,
        origin: "agente",
        companyId,
      })
      .onConflictDoNothing()
      .returning({ id: interactions.id });
    if (!row) continue;
    await db
      .insert(interactionPeople)
      .values([...new Set(personIds)].map((personId) => ({ interactionId: row.id, personId })))
      .onConflictDoNothing();
    personIds.forEach((id) => touched.add(id));
    recorded++;
  }
  return { recorded, proposed };
}

/** Indirizzi dei contatti del CRM per blocco di ricerca nello storico. */
const BACKFILL_CHUNK = 10;
/** Quanto indietro si cerca lo storico con i contatti. */
const BACKFILL_DAYS = 730;
/** Email al massimo per blocco: le più recenti con quei contatti. */
const BACKFILL_PER_CHUNK = 150;
/** Tempo massimo di un giro: lo storico continua al giro successivo. */
const TIME_BUDGET_MS = 180_000;

type Account = typeof googleAccounts.$inferSelect;

async function syncGmail(db: Db, acc: Account, token: string, ctx: Ctx, started: number) {
  const touched = new Set<string>();

  // 1. Le email recenti, anche dai mittenti nuovi
  const since = acc.gmailSyncedAt ? new Date(acc.gmailSyncedAt.getTime() - DAY) : new Date(Date.now() - FIRST_SYNC_DAYS * DAY);
  const recent = await listIds(token, `after:${Math.floor(since.getTime() / 1000)} -in:chats -category:promotions -category:social -category:forums`, 3000);
  const unread = await unknownIds(db, acc.userId, recent.ids);
  // A blocchi dalle più vecchie della finestra: il giro dopo riprende da dove si è fermato
  const todo = unread.slice(-MAX_MESSAGES);
  const r1 = await recordMessages(db, acc.userId, token, ctx, todo, true, touched);
  const recentDone = !recent.truncated && unread.length <= MAX_MESSAGES;

  // 2. Lo storico con i contatti del CRM, fino a due anni, un blocco di indirizzi alla volta
  let cursor = acc.gmailBackfillCursor;
  let backfillDone = Boolean(acc.gmailBackfillDoneAt);
  let r2 = { recorded: 0, proposed: 0 };
  if (!backfillDone) {
    const addresses = [...ctx.personByEmail.entries()]
      .filter(([email, p]) => p.status === "attivo" && !isExcluded(email, ctx.internalDomains, ctx.excluded))
      .map(([email]) => email)
      .sort();
    const after = Math.floor((Date.now() - BACKFILL_DAYS * DAY) / 1000);
    while (cursor * BACKFILL_CHUNK < addresses.length && Date.now() - started < TIME_BUDGET_MS) {
      const chunk = addresses.slice(cursor * BACKFILL_CHUNK, (cursor + 1) * BACKFILL_CHUNK);
      const q = `{${chunk.map((a) => `from:${a} to:${a} cc:${a}`).join(" ")}} after:${after}`;
      const { ids } = await listIds(token, q, BACKFILL_PER_CHUNK);
      const res = await recordMessages(db, acc.userId, token, ctx, await unknownIds(db, acc.userId, ids), false, touched);
      r2 = { recorded: r2.recorded + res.recorded, proposed: r2.proposed + res.proposed };
      cursor++;
      backfillDone = cursor * BACKFILL_CHUNK >= addresses.length;
      // Salvato a ogni blocco: se il giro si interrompe, il prossimo riparte da qui
      await db
        .update(googleAccounts)
        .set({ gmailBackfillCursor: cursor, gmailBackfillDoneAt: backfillDone ? new Date() : null })
        .where(eq(googleAccounts.userId, acc.userId));
    }
    if (cursor * BACKFILL_CHUNK >= addresses.length && !backfillDone) {
      backfillDone = true;
      await db.update(googleAccounts).set({ gmailBackfillDoneAt: new Date() }).where(eq(googleAccounts.userId, acc.userId));
    }
  }

  if (touched.size) {
    await refreshLastInteractions(db, [...touched]);
    await recomputeFollowups(db, { people: [...touched] });
  }
  return {
    scanned: recent.ids.length,
    recorded: r1.recorded + r2.recorded,
    proposed: r1.proposed + r2.proposed,
    more: !recentDone || !backfillDone,
    recentDone,
  };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

type CalendarEvent = {
  id: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; self?: boolean; resource?: boolean }[];
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  attachments?: { title?: string; fileUrl?: string; mimeType?: string }[];
};

async function syncCalendar(db: Db, userId: string, token: string, ctx: Ctx) {
  const from = new Date(Date.now() - 31 * DAY);
  const to = new Date(Date.now() + 92 * DAY);
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const page = await googleGet<{ items?: CalendarEvent[]; nextPageToken?: string }>(
      token,
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      { timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: true, orderBy: "startTime", maxResults: 250, pageToken },
    );
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken && events.length < 1000);

  const seen: string[] = [];
  for (const e of events) {
    const startRaw = e.start?.dateTime ?? e.start?.date;
    if (e.status === "cancelled" || !startRaw) continue;
    const allDay = !e.start?.dateTime;
    const attendees = (e.attendees ?? []).filter((a) => a.email && !a.self && !a.resource).map((a) => a.email!.toLowerCase());
    const external = attendees.filter((a) => !isExcluded(a, ctx.internalDomains, ctx.excluded));
    const companyId =
      external.map((a) => ctx.personByEmail.get(a)?.companyId).find(Boolean) ??
      external.map((a) => (isFreeMail(a) ? undefined : ctx.companyByDomain.get(domainOf(a)))).find(Boolean) ??
      null;
    const values = {
      userId,
      googleId: e.id,
      title: (e.summary || "(senza titolo)").slice(0, 300),
      startsAt: new Date(allDay ? `${startRaw}T00:00:00Z` : startRaw),
      endsAt: e.end?.dateTime ? new Date(e.end.dateTime) : null,
      allDay,
      meetLink: e.hangoutLink ?? e.conferenceData?.entryPoints?.find((x) => x.entryPointType === "video")?.uri ?? null,
      htmlLink: e.htmlLink ?? null,
      attendees,
      attachments: (e.attachments ?? [])
        .filter((a) => a.fileUrl)
        .map((a) => ({ title: a.title ?? "Allegato", url: a.fileUrl!, mimeType: a.mimeType ?? null })),
      companyId,
      updatedAt: new Date(),
    };
    await db
      .insert(calendarEvents)
      .values(values)
      .onConflictDoUpdate({ target: [calendarEvents.userId, calendarEvents.googleId], set: values });
    seen.push(e.id);
  }
  // Eventi cancellati o spostati fuori dalla finestra
  await db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        gte(calendarEvents.startsAt, from),
        lte(calendarEvents.startsAt, to),
        seen.length ? notInArray(calendarEvents.googleId, seen) : undefined,
      ),
    );
  return { events: seen.length };
}

// ---------------------------------------------------------------------------
// Giro completo
// ---------------------------------------------------------------------------

export type SyncResult = { ok: true; scanned: number; recorded: number; proposed: number; events: number; more: boolean; recentDone: boolean } | { ok: false; error: string };

export async function syncGoogleAccount(db: Db, userId: string): Promise<SyncResult> {
  const [acc] = await db.select().from(googleAccounts).where(eq(googleAccounts.userId, userId));
  if (!acc) return { ok: false, error: "Google non collegato" };
  const started = new Date();
  try {
    const token = await accessToken(decrypt(acc.refreshToken));
    const ctx = await loadContext(db, acc.email);
    const cal = await syncCalendar(db, userId, token, ctx);
    const mail = await syncGmail(db, acc, token, ctx, started.getTime());
    await db
      .update(googleAccounts)
      // Se restano email recenti da leggere, il prossimo giro riparte dalla stessa data
      .set({ gmailSyncedAt: mail.recentDone ? started : acc.gmailSyncedAt, calendarSyncedAt: started, lastError: null })
      .where(eq(googleAccounts.userId, userId));
    await db.insert(agentLog).values({
      action: "sync_google",
      outcome: "ok",
      detail: `${acc.email}: ${mail.recorded} email registrate, ${mail.proposed} contatti da approvare, ${cal.events} eventi${mail.more ? ", continua al prossimo giro" : ""}`,
      onBehalfOf: userId,
    });
    return { ok: true, ...mail, ...cal };
  } catch (e) {
    const revoked = e instanceof GoogleError && /invalid_grant/.test(`${e.code} ${e.message}`);
    const quota = e instanceof GoogleError && e.code === "quota";
    const error = revoked
      ? "Accesso a Google revocato o scaduto: ricollega l'account"
      : quota
        ? "Google ha chiesto di rallentare (limite di richieste al minuto). Il prossimo giro riprende da dove si è fermato."
        : e instanceof Error
          ? e.message
          : String(e);
    await db.update(googleAccounts).set({ lastError: error }).where(eq(googleAccounts.userId, userId));
    await db.insert(agentLog).values({ action: "sync_google", outcome: "errore", detail: `${acc.email}: ${error}`, onBehalfOf: userId });
    return { ok: false, error };
  }
}

export async function syncAllGoogleAccounts(db: Db) {
  const accounts = await db.select({ userId: googleAccounts.userId }).from(googleAccounts);
  const results = [];
  for (const a of accounts) results.push({ userId: a.userId, ...(await syncGoogleAccount(db, a.userId)) });
  return results;
}
