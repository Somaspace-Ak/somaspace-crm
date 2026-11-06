import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { interactionPeople, interactions, opportunities, people, settings as settingsTable } from "@/db/schema";
import { toRomeDate } from "@/lib/followup/dates";
import {
  DEFAULT_SETTINGS,
  type FollowupSettings,
  opportunityFollowup,
  personFollowup,
  type QueueOpportunity,
  type QueuePerson,
} from "@/lib/followup/engine";

interface EmailDates {
  lastInboundOn: string | null;
  lastOutboundOn: string | null;
  lastInteractionOn: string | null;
}

const emptyDates: EmailDates = { lastInboundOn: null, lastOutboundOn: null, lastInteractionOn: null };

/**
 * Parametri dei follow-up dalla tabella Impostazioni (specifica, sezione 6),
 * con i valori iniziali della specifica per quello che manca.
 */
export async function loadFollowupSettings(db: Db): Promise<FollowupSettings> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "followup"));
  const saved = (row?.value ?? {}) as Partial<FollowupSettings>;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : fallback);
  return {
    warmDays: num(saved.warmDays, DEFAULT_SETTINGS.warmDays),
    coldDays: num(saved.coldDays, DEFAULT_SETTINGS.coldDays),
    quoteReminderDays: num(saved.quoteReminderDays, DEFAULT_SETTINGS.quoteReminderDays),
    quoteMaxReminders: num(saved.quoteMaxReminders, DEFAULT_SETTINGS.quoteMaxReminders),
    staleLeadDays: num(saved.staleLeadDays, DEFAULT_SETTINGS.staleLeadDays),
    maxDraftsPerDay: num(saved.maxDraftsPerDay, DEFAULT_SETTINGS.maxDraftsPerDay),
  };
}

/**
 * Le date dell'ultima email in entrata, in uscita e dell'ultima interazione.
 * Si contano tutte le caselle: sapere *quando* c'è stato un contatto è un dato del team,
 * il contenuto resta privato.
 */
async function personEmailDates(db: Db): Promise<Map<string, EmailDates>> {
  const rows = await db
    .select({
      personId: interactionPeople.personId,
      lastIn: sql<Date | null>`max(${interactions.occurredAt}) filter (where ${interactions.type} = 'email_ricevuta')`,
      lastOut: sql<Date | null>`max(${interactions.occurredAt}) filter (where ${interactions.type} = 'email_inviata')`,
      lastAny: sql<Date | null>`max(${interactions.occurredAt}) filter (where ${interactions.type} <> 'modifica_valore')`,
    })
    .from(interactionPeople)
    .innerJoin(interactions, eq(interactions.id, interactionPeople.interactionId))
    .groupBy(interactionPeople.personId);

  return new Map(
    rows.map((r) => [
      r.personId,
      {
        lastInboundOn: r.lastIn ? toRomeDate(new Date(r.lastIn)) : null,
        lastOutboundOn: r.lastOut ? toRomeDate(new Date(r.lastOut)) : null,
        lastInteractionOn: r.lastAny ? toRomeDate(new Date(r.lastAny)) : null,
      },
    ]),
  );
}

/**
 * Le email di ogni deal aperto: quelle collegate al deal, con il suo referente o con la sua azienda.
 * Così le email lette da Gmail contano per i promemoria del preventivo senza collegarle a mano.
 * Conta anche i giorni in cui gli abbiamo scritto dopo l'invio: ognuno vale come un promemoria fatto.
 */
async function opportunityEmailDates(db: Db): Promise<Map<string, EmailDates & { sentAfterQuote: number }>> {
  const res = (await db.execute(sql`
    select o.id,
      max(i.occurred_at) filter (where i.type = 'email_ricevuta') as last_in,
      max(i.occurred_at) filter (where i.type = 'email_inviata') as last_out,
      count(distinct (i.occurred_at at time zone 'Europe/Rome')::date)
        filter (where i.type = 'email_inviata' and o.quote_sent_on is not null
          and (i.occurred_at at time zone 'Europe/Rome')::date > o.quote_sent_on)::int as sent_after_quote
    from opportunities o
    join interactions i on i.type in ('email_ricevuta', 'email_inviata') and (
      i.opportunity_id = o.id
      or i.company_id = o.company_id
      or (o.person_id is not null and exists (
        select 1 from interaction_people ip where ip.interaction_id = i.id and ip.person_id = o.person_id))
    )
    where o.stage in ('lead', 'in_progress')
    group by o.id
  `)) as unknown as { rows?: Row[] } | Row[];
  type Row = { id: string; last_in: string | Date | null; last_out: string | Date | null; sent_after_quote: number };
  const rows: Row[] = Array.isArray(res) ? res : (res.rows ?? []);

  return new Map(
    rows.map((r) => [
      r.id,
      {
        lastInboundOn: r.last_in ? toRomeDate(new Date(r.last_in)) : null,
        lastOutboundOn: r.last_out ? toRomeDate(new Date(r.last_out)) : null,
        lastInteractionOn: null,
        sentAfterQuote: Number(r.sent_after_quote ?? 0),
      },
    ]),
  );
}

/** Tutto quello che serve al motore per costruire la coda. */
export async function loadFollowupInputs(db: Db): Promise<{
  people: QueuePerson[];
  opportunities: QueueOpportunity[];
}> {
  const [peopleRows, oppRows, pDates, oDates] = await Promise.all([
    db.select().from(people),
    db.select().from(opportunities),
    personEmailDates(db),
    opportunityEmailDates(db),
  ]);

  const openQuoteReferents = new Set(
    oppRows.filter((o) => o.stage === "in_progress" && o.personId).map((o) => o.personId!),
  );

  return {
    people: peopleRows.map((p) => {
      const dates = pDates.get(p.id) ?? emptyDates;
      return {
        id: p.id,
        status: p.status,
        mode: p.followupMode,
        lastInboundOn: dates.lastInboundOn,
        lastOutboundOn: dates.lastOutboundOn,
        lastInteractionOn: dates.lastInteractionOn ?? (p.lastInteractionAt ? toRomeDate(p.lastInteractionAt) : null),
        snoozeUntil: p.snoozeUntil,
        isReferentOfOpenQuote: openQuoteReferents.has(p.id),
      };
    }),
    opportunities: oppRows.map((o) => {
      const dates = oDates.get(o.id) ?? { ...emptyDates, sentAfterQuote: 0 };
      return {
        id: o.id,
        personId: o.personId,
        createdOn: toRomeDate(o.createdAt),
        stage: o.stage,
        quoteSentOn: o.quoteSentOn,
        // Promemoria fatti: con "Fatto" o scrivendo al cliente dopo il preventivo
        step: Math.max(o.followupStep, dates.sentAfterQuote),
        lastFollowupOn: o.lastFollowupOn,
        snoozeUntil: o.snoozeUntil,
        lastInboundOn: dates.lastInboundOn,
        lastOutboundOn: dates.lastOutboundOn,
      };
    }),
  };
}

/**
 * Ricalcola e scrive Prossimo follow-up come data vera su persone e opportunità,
 * così filtri e viste (anche in Notion) funzionano senza formule.
 */
export async function recomputeFollowups(db: Db, ids?: { people?: string[]; opportunities?: string[] }) {
  const [inputs, settings] = await Promise.all([loadFollowupInputs(db), loadFollowupSettings(db)]);

  for (const p of inputs.people) {
    if (ids?.people && !ids.people.includes(p.id)) continue;
    const f = personFollowup(p, settings);
    await db.update(people).set({ nextFollowupOn: f.nextOn }).where(eq(people.id, p.id));
  }
  for (const o of inputs.opportunities) {
    if (ids?.opportunities && !ids.opportunities.includes(o.id)) continue;
    const f = opportunityFollowup(o, settings);
    await db.update(opportunities).set({ nextFollowupOn: f.nextOn, followupStep: o.step }).where(eq(opportunities.id, o.id));
  }
}

/** Aggiorna Last interaction su persone e aziende dalle interazioni registrate. */
export async function refreshLastInteractions(db: Db, personIds?: string[]) {
  const rows = await db
    .select({
      personId: interactionPeople.personId,
      last: sql<Date>`max(${interactions.occurredAt})`,
    })
    .from(interactionPeople)
    .innerJoin(interactions, eq(interactions.id, interactionPeople.interactionId))
    .where(
      and(
        sql`${interactions.type} <> 'modifica_valore'`,
        personIds?.length ? inArray(interactionPeople.personId, personIds) : undefined,
      ),
    )
    .groupBy(interactionPeople.personId);

  for (const r of rows) {
    await db.update(people).set({ lastInteractionAt: new Date(r.last) }).where(eq(people.id, r.personId));
  }
  // L'azienda prende la data più recente tra le sue persone e le interazioni registrate su di lei (email comprese)
  await db.execute(sql`
    update companies c set last_interaction_at = sub.last
    from (
      select company_id, max(last) as last from (
        select company_id, max(last_interaction_at) as last from people where company_id is not null group by company_id
        union all
        select company_id, max(occurred_at) as last from interactions
        where company_id is not null and type <> 'modifica_valore' group by company_id
      ) x group by company_id
    ) sub
    where sub.company_id = c.id and sub.last is not null
  `);
}
