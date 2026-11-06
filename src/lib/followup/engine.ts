import { addDays, daysBetween, maxDate, type IsoDate } from "./dates";

/**
 * Motore dei follow-up: regole della specifica, sezione 8.
 * Funzioni pure, senza database: le usano i job dell'agente, l'app e i test.
 */

export interface FollowupSettings {
  warmDays: number;
  coldDays: number;
  /** Preventivo senza risposta: un promemoria N giorni dopo l'ultimo contatto (invio, nostra email, Fatto) */
  quoteReminderDays: number;
  /** Dopo N promemoria senza risposta l'app chiede Persa o Rimanda */
  quoteMaxReminders: number;
  /** Regola 7: un lead senza preventivo da più di N giorni è un promemoria */
  staleLeadDays: number;
  maxDraftsPerDay: number;
}

export const DEFAULT_SETTINGS: FollowupSettings = {
  warmDays: 30,
  coldDays: 90,
  quoteReminderDays: 5,
  quoteMaxReminders: 6,
  staleLeadDays: 7,
  maxDraftsPerDay: 15,
};

export type Mode = "caldo" | "freddo" | "nessuno";

export interface PersonFollowupInput {
  status: "da_approvare" | "attivo" | "archiviato";
  mode: Mode | null;
  lastInboundOn: IsoDate | null;
  lastOutboundOn: IsoDate | null;
  /** Ultima interazione di qualsiasi tipo (email, meeting, chiamata) */
  lastInteractionOn: IsoDate | null;
  snoozeUntil: IsoDate | null;
  /** Regola 2: referente di un'opportunità In progress */
  isReferentOfOpenQuote: boolean;
}

export type PersonFollowupState =
  | "non_attivo"
  | "sospeso_preventivo"
  | "rimanda"
  | "attesa_risposta"
  | "in_cadenza"
  | "senza_dati";

export interface PersonFollowup {
  state: PersonFollowupState;
  nextOn: IsoDate | null;
}

/** Regola 1: Rimanda a vince finché non parte un'email in quella data o dopo. */
function activeSnooze(snoozeUntil: IsoDate | null, lastOutboundOn: IsoDate | null): IsoDate | null {
  if (!snoozeUntil) return null;
  if (lastOutboundOn && lastOutboundOn >= snoozeUntil) return null;
  return snoozeUntil;
}

/** Il contatto ha scritto per ultimo e aspetta una nostra risposta. */
function awaitingOurReply(lastInboundOn: IsoDate | null, lastOutboundOn: IsoDate | null): boolean {
  return Boolean(lastInboundOn && (!lastOutboundOn || lastInboundOn > lastOutboundOn));
}

export function personFollowup(
  p: PersonFollowupInput,
  s: FollowupSettings = DEFAULT_SETTINGS,
): PersonFollowup {
  // Regola 8: archiviati e modalità Nessuno escono da tutto
  if (p.status !== "attivo" || p.mode === "nessuno") return { state: "non_attivo", nextOn: null };
  // Regola 2: un solo canale, comanda la sequenza del preventivo
  if (p.isReferentOfOpenQuote) return { state: "sospeso_preventivo", nextOn: null };

  const snooze = activeSnooze(p.snoozeUntil, p.lastOutboundOn);
  if (snooze) return { state: "rimanda", nextOn: snooze };

  // Regola 5: se ci ha scritto, la voce va in "Ti hanno scritto"
  if (awaitingOurReply(p.lastInboundOn, p.lastOutboundOn)) {
    return { state: "attesa_risposta", nextOn: null };
  }

  const last = maxDate(p.lastInteractionOn, p.lastInboundOn, p.lastOutboundOn);
  if (!p.mode || !last) return { state: "senza_dati", nextOn: null };

  const cadence = p.mode === "caldo" ? s.warmDays : s.coldDays;
  return { state: "in_cadenza", nextOn: addDays(last, cadence) };
}

export interface OpportunityFollowupInput {
  stage: "lead" | "in_progress" | "vinta" | "persa";
  quoteSentOn: IsoDate | null;
  /** Quanti promemoria sono stati fatti: con "Fatto" o con una nostra email dopo il preventivo */
  step: number;
  lastFollowupOn: IsoDate | null;
  snoozeUntil: IsoDate | null;
  lastInboundOn: IsoDate | null;
  lastOutboundOn: IsoDate | null;
}

export type OpportunityFollowupState =
  | "non_attiva"
  | "senza_data_invio"
  | "rimanda"
  | "attesa_risposta"
  | "in_sequenza"
  | "chiedi_esito";

export interface OpportunityFollowup {
  state: OpportunityFollowupState;
  nextOn: IsoDate | null;
  /** Il promemoria che partirà alla prossima data (1, 2, ...) */
  nextStep: number | null;
}

export function opportunityFollowup(
  o: OpportunityFollowupInput,
  s: FollowupSettings = DEFAULT_SETTINGS,
): OpportunityFollowup {
  if (o.stage !== "in_progress") return { state: "non_attiva", nextOn: null, nextStep: null };
  if (!o.quoteSentOn) return { state: "senza_data_invio", nextOn: null, nextStep: null };

  // Rimanda a: la voce sparisce fino a quella data, poi torna in Oggi
  const snooze = activeSnooze(o.snoozeUntil, o.lastOutboundOn);
  if (snooze) return { state: "rimanda", nextOn: snooze, nextStep: Math.min(o.step + 1, s.quoteMaxReminders) };

  // Il cliente ha risposto al preventivo e noi no: subito in "Ti hanno scritto", finché non rispondiamo
  const repliedAfterQuote = o.lastInboundOn !== null && o.lastInboundOn >= o.quoteSentOn;
  if (repliedAfterQuote && awaitingOurReply(o.lastInboundOn, o.lastOutboundOn)) {
    return { state: "attesa_risposta", nextOn: null, nextStep: null };
  }

  // Troppi promemoria senza risposta: l'app chiede Persa o Rimanda
  if (o.step >= s.quoteMaxReminders) return { state: "chiedi_esito", nextOn: null, nextStep: null };

  // Nessuna risposta: un promemoria N giorni dopo l'ultimo contatto nostro (invio, email, Fatto)
  const ourLast = o.lastOutboundOn && o.lastOutboundOn >= o.quoteSentOn ? o.lastOutboundOn : null;
  const lastTouch = maxDate(o.quoteSentOn, o.lastFollowupOn, ourLast)!;
  return { state: "in_sequenza", nextOn: addDays(lastTouch, s.quoteReminderDays), nextStep: o.step + 1 };
}

/**
 * Regola 3: un follow-up è fatto quando parte un'email in data di follow-up o dopo.
 * Restituisce il nuovo passo e la data dell'ultimo follow-up.
 */
export function applyOutboundEmail(
  o: OpportunityFollowupInput,
  sentOn: IsoDate,
  s: FollowupSettings = DEFAULT_SETTINGS,
): OpportunityFollowupInput {
  const updated = { ...o, lastOutboundOn: maxDate(o.lastOutboundOn, sentOn) };
  const current = opportunityFollowup(o, s);
  if (current.state === "in_sequenza" && current.nextOn && sentOn >= current.nextOn) {
    return { ...updated, step: o.step + 1, lastFollowupOn: sentOn };
  }
  if (current.state === "rimanda" && current.nextOn && sentOn >= current.nextOn) {
    return { ...updated, step: Math.min(o.step + 1, s.quoteMaxReminders), lastFollowupOn: sentOn, snoozeUntil: null };
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Coda di oggi
// ---------------------------------------------------------------------------

export type QueueSection = "ti_hanno_scritto" | "preventivi" | "caldi" | "freddi" | "lead_fermi";

export interface QueueItem {
  section: QueueSection;
  kind: "persona" | "opportunita";
  id: string;
  personId: string | null;
  dueOn: IsoDate | null;
  daysLate: number;
  step: number | null;
  /** Dopo il passo 4: chiedere Persa o Rimanda invece di scrivere */
  askOutcome: boolean;
}

export interface QueuePerson extends PersonFollowupInput {
  id: string;
}

export interface QueueOpportunity extends OpportunityFollowupInput {
  id: string;
  personId: string | null;
  createdOn: IsoDate;
}

export function buildTodayQueue(
  today: IsoDate,
  people: QueuePerson[],
  opportunities: QueueOpportunity[],
  s: FollowupSettings = DEFAULT_SETTINGS,
): QueueItem[] {
  const items: QueueItem[] = [];
  const peopleInRepliedDeals = new Set<string>();

  for (const o of opportunities) {
    if (o.stage === "lead" && !o.quoteSentOn && daysBetween(o.createdOn, today) > s.staleLeadDays) {
      items.push({
        section: "lead_fermi",
        kind: "opportunita",
        id: o.id,
        personId: o.personId,
        dueOn: addDays(o.createdOn, s.staleLeadDays),
        daysLate: daysBetween(o.createdOn, today) - s.staleLeadDays,
        step: null,
        askOutcome: false,
      });
      continue;
    }
    const f = opportunityFollowup(o, s);
    if (f.state === "attesa_risposta") {
      if (o.personId) peopleInRepliedDeals.add(o.personId);
      items.push({
        section: "ti_hanno_scritto",
        kind: "opportunita",
        id: o.id,
        personId: o.personId,
        dueOn: o.lastInboundOn,
        daysLate: o.lastInboundOn ? daysBetween(o.lastInboundOn, today) : 0,
        step: o.step,
        askOutcome: false,
      });
    } else if (f.state === "chiedi_esito") {
      items.push({
        section: "preventivi",
        kind: "opportunita",
        id: o.id,
        personId: o.personId,
        dueOn: o.lastFollowupOn,
        daysLate: o.lastFollowupOn ? daysBetween(o.lastFollowupOn, today) : 0,
        step: o.step,
        askOutcome: true,
      });
    } else if ((f.state === "in_sequenza" || f.state === "rimanda") && f.nextOn && f.nextOn <= today) {
      items.push({
        section: "preventivi",
        kind: "opportunita",
        id: o.id,
        personId: o.personId,
        dueOn: f.nextOn,
        daysLate: daysBetween(f.nextOn, today),
        step: f.nextStep,
        askOutcome: false,
      });
    }
  }

  for (const p of people) {
    const f = personFollowup(p, s);
    if (f.state === "attesa_risposta") {
      if (peopleInRepliedDeals.has(p.id)) continue;
      items.push({
        section: "ti_hanno_scritto",
        kind: "persona",
        id: p.id,
        personId: p.id,
        dueOn: p.lastInboundOn,
        daysLate: p.lastInboundOn ? daysBetween(p.lastInboundOn, today) : 0,
        step: null,
        askOutcome: false,
      });
    } else if ((f.state === "in_cadenza" || f.state === "rimanda") && f.nextOn && f.nextOn <= today) {
      items.push({
        section: p.mode === "caldo" ? "caldi" : "freddi",
        kind: "persona",
        id: p.id,
        personId: p.id,
        dueOn: f.nextOn,
        daysLate: daysBetween(f.nextOn, today),
        step: null,
        askOutcome: false,
      });
    }
  }

  return items.sort((a, b) => b.daysLate - a.daysLate);
}

/** Le voci che ricevono una bozza oggi: massimo N, prima le più in ritardo. */
export function pickDrafts(queue: QueueItem[], s: FollowupSettings = DEFAULT_SETTINGS): QueueItem[] {
  return queue
    .filter((i) => (i.section === "preventivi" && !i.askOutcome) || i.section === "caldi" || i.section === "freddi")
    .sort((a, b) => b.daysLate - a.daysLate)
    .slice(0, s.maxDraftsPerDay);
}

/** Se non c'è nulla da fare, il digest non parte. */
export function shouldSendDigest(queue: QueueItem[], pendingApprovals: number): boolean {
  return queue.length > 0 || pendingApprovals > 0;
}
