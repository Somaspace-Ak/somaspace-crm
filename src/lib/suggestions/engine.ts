import { daysBetween } from "../followup/dates";

/**
 * Opportunità suggerite a regole: niente AI, solo quello che il CRM sa già.
 *
 * - servizio: un cliente ha comprato X, il passo naturale dopo X è Y (o una persona ha Y tra gli interessi)
 * - dormiente: un cliente che non sentiamo da troppo, senza progetti in corso
 * - ripresa: un deal perso, riproposto quando è passato il tempo giusto per il motivo della perdita
 * - segnale: un fatto con una data ("il budget riapre a gennaio") che sta arrivando
 *
 * La parte che legge il testo (email, meeting, bandi) arriva con l'agente.
 */

export type SuggestionReason = "servizio" | "dormiente" | "ripresa" | "segnale";

export interface SuggestionInput {
  today: string;
  /** Un cliente è dormiente dopo questi giorni senza contatti né progetti */
  dormantDays: number;
  companies: { id: string; name: string; relationship: string; categories: string[]; lastInteractionOn: string | null }[];
  people: { id: string; companyId: string | null; name: string; interests: string[]; lastInteractionOn: string | null }[];
  services: { id: string; name: string; targetCategories: string[]; status: string }[];
  opportunities: {
    id: string;
    name: string;
    companyId: string;
    personId: string | null;
    stage: "lead" | "in_progress" | "vinta" | "persa";
    lostReason: string | null;
    closedOn: string | null;
    createdOn: string;
  }[];
  projects: { id: string; name: string; companyId: string | null; status: string; startOn: string | null; dueOn: string | null; createdOn: string }[];
  facts: { id: string; text: string; companyId: string | null; personId: string | null; resurfaceOn: string | null }[];
}

export interface RuleSuggestion {
  ruleKey: string;
  reason: SuggestionReason;
  companyId: string;
  personId: string | null;
  serviceId: string | null;
  factId: string | null;
  sourceOpportunityId: string | null;
  rationale: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Servizi: riconoscerli nei nomi di progetti e deal, e cosa viene dopo cosa
// ---------------------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();

/** Parole che indicano un servizio nei nomi (italiano e inglese, come nei progetti veri). */
const KEYWORDS: Record<string, string[]> = {
  brand: ["brand", "restyle", "logo", "identity", "identità", "naming"],
  "sito web": ["sito", "website", "landing", "webflow"],
  "social e contenuti": ["social", "content", "contenuti", "channel update", "comunicazione", "newsletter"],
  "video e render 3d": ["video", "render", "3d", "animazion", "animation", "motion"],
  "deck e pitch": ["deck", "pitch", "brochure", "infographic", "infografic", "presentazion", "commercial material", "materiale commerciale"],
  eventi: ["evento", "eventi", "event", "workshop", "fiera", "stand"],
  "marketing e lead gen": ["marketing", "lead gen", "sales", "market analysis", "campagna", "campaign", "go-to-market"],
};

/** Il passo naturale dopo un servizio, con quanto pesa (punti aggiunti al punteggio). */
const NEXT: Record<string, Record<string, number>> = {
  brand: { "sito web": 25, "deck e pitch": 20, "social e contenuti": 15, "video e render 3d": 10 },
  "sito web": { "social e contenuti": 20, "marketing e lead gen": 20, "video e render 3d": 10 },
  "deck e pitch": { "video e render 3d": 15, brand: 10, eventi: 10 },
  "social e contenuti": { "marketing e lead gen": 15, "video e render 3d": 15 },
  "video e render 3d": { "social e contenuti": 15, eventi: 10 },
  "marketing e lead gen": { "social e contenuti": 15, "sito web": 10 },
  eventi: { "video e render 3d": 15, "social e contenuti": 10 },
};

function keywordsFor(serviceName: string) {
  return KEYWORDS[norm(serviceName)] ?? [norm(serviceName)];
}

/** I servizi nominati in un testo: "Brand restyle e Sito web" → Brand, Sito web. */
export function servicesIn<T extends { name: string }>(text: string, services: T[]): T[] {
  const t = ` ${norm(text)}`;
  return services.filter((s) => keywordsFor(s.name).some((k) => new RegExp(`[^\\p{L}\\p{N}]${escape(k)}`, "u").test(t)));
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Formati per le motivazioni
// ---------------------------------------------------------------------------

const monthYear = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "Europe/Rome" });
const when = (iso: string) => monthYear.format(new Date(`${iso}T12:00:00Z`));

function ago(days: number) {
  if (days < 45) return `${days} giorni`;
  const months = Math.round(days / 30);
  if (months < 18) return `${months} mesi`;
  const years = Math.round((days / 365) * 2) / 2;
  return `${String(years).replace(".", ",")} anni`;
}

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs.at(-1)}`);
const clamp = (n: number) => Math.max(1, Math.min(99, Math.round(n)));
const maxDate = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;

/** Quanti giorni aspettare dopo un deal perso, per motivo, e quanto vale riprovarci. */
const RETRY: Record<string, { days: number; score: number; text: (deal: string, at: string, since: string, svc: string | null) => string }> = {
  tempistica: {
    days: 120,
    score: 75,
    text: (d, at, since) => `"${d}" perso a ${at} per tempistica. Sono passati ${since}: buon momento per risentirli.`,
  },
  nessuna_risposta: {
    days: 120,
    score: 55,
    text: (d, at, since) => `"${d}" a ${at} non ha avuto risposta. Dopo ${since} vale un nuovo contatto con qualcosa di concreto.`,
  },
  prezzo: {
    days: 180,
    score: 60,
    text: (d, at, _s, svc) => `"${d}" perso a ${at} per prezzo. Proporre un pacchetto più piccolo${svc ? `, partendo da ${svc}` : ""}.`,
  },
  concorrente: {
    days: 365,
    score: 45,
    text: (d, at) => `A ${at} hanno scelto un concorrente per "${d}". È passato un anno: vale chiedere com'è andata.`,
  },
  altro: {
    days: 180,
    score: 45,
    text: (d, at, since) => `"${d}" perso a ${at}. Dopo ${since} vale un nuovo contatto.`,
  },
};

// ---------------------------------------------------------------------------
// Motore
// ---------------------------------------------------------------------------

/** Quanti suggerimenti di servizio al massimo per azienda: i più forti. */
const SERVICES_PER_COMPANY = 2;

export function suggestOpportunities(input: SuggestionInput): RuleSuggestion[] {
  const { today } = input;
  const out: RuleSuggestion[] = [];
  const peopleOf = groupBy(input.people, (p) => p.companyId);
  const dealsOf = groupBy(input.opportunities, (o) => o.companyId);
  const projectsOf = groupBy(input.projects, (p) => p.companyId);
  const activeServices = input.services.filter((s) => s.status !== "ritirato");

  /** La persona da contattare: quella sentita più di recente. */
  const contactOf = (companyId: string) =>
    [...(peopleOf.get(companyId) ?? [])].sort((a, b) => (b.lastInteractionOn ?? "").localeCompare(a.lastInteractionOn ?? ""))[0] ?? null;

  for (const c of input.companies) {
    if (c.relationship === "interno" || c.relationship === "fornitore") continue;
    const deals = dealsOf.get(c.id) ?? [];
    const projects = projectsOf.get(c.id) ?? [];
    const won = deals.filter((d) => d.stage === "vinta");
    const lost = deals.filter((d) => d.stage === "persa");
    const openDeal = deals.some((d) => d.stage === "lead" || d.stage === "in_progress");
    const activeProject = projects.some((p) => p.status === "attivo" || p.status === "da_avviare" || p.status === "in_pausa");
    const isClient = c.relationship === "cliente" || won.length > 0;

    // Ultima attività: contatti, progetti finiti, deal vinti
    const lastActivity = maxDate([
      c.lastInteractionOn,
      ...projects.map((p) => [p.dueOn, p.startOn, p.createdOn].filter((d) => d && d <= today).sort().at(-1)),
      ...won.map((d) => d.closedOn),
    ]);
    const idle = lastActivity ? daysBetween(lastActivity, today) : null;
    const contact = contactOf(c.id);

    // In trattativa: niente proposte, se ne sta già parlando
    if (openDeal) continue;

    // --- Servizi: cosa viene dopo quello che hanno già comprato -----------------------------------
    const boughtFrom = [...won.map((d) => d.name), ...projects.map((p) => p.name)];
    const bought = new Map<string, string>(); // servizio → nome del progetto o deal dove l'abbiamo visto
    for (const name of boughtFrom) for (const s of servicesIn(name, activeServices)) if (!bought.has(s.id)) bought.set(s.id, name);
    const lostServices = new Set(lost.flatMap((d) => servicesIn(d.name, activeServices).map((s) => s.id)));
    const facts = input.facts.filter((f) => f.companyId === c.id);

    const candidates: RuleSuggestion[] = [];
    for (const s of activeServices) {
      if (bought.has(s.id) || lostServices.has(s.id)) continue;
      // Il passo dopo il servizio più vicino tra quelli comprati
      let affinity = 0;
      let after: string | null = null;
      for (const b of activeServices.filter((x) => bought.has(x.id))) {
        const w = NEXT[norm(b.name)]?.[norm(s.name)] ?? 0;
        if (w > affinity) [affinity, after] = [w, b.name];
      }
      const interested = (peopleOf.get(c.id) ?? []).find((p) => p.interests.some((i) => norm(i) === norm(s.name)));
      const fact = facts.find((f) => servicesIn(f.text, [s]).length);
      const categoryFit = s.targetCategories.some((t) => c.categories.some((x) => norm(x) === norm(t)));
      const warm = idle != null && idle <= 180;
      // La sola categoria non basta per chi non conosciamo
      if (!affinity && !interested && !fact && !(categoryFit && (isClient || warm))) continue;

      const reasons: string[] = [];
      if (after) reasons.push(`Hanno già fatto ${after} con noi ("${bought.get(activeServices.find((x) => x.name === after)!.id)}"): di solito il passo dopo è ${s.name}.`);
      if (interested) reasons.push(`${interested.name} ha ${s.name} tra gli interessi.`);
      if (fact) reasons.push(`Dalle conversazioni: ${fact.text}`);
      if (categoryFit && !after) reasons.push(`${s.name} è pensato per aziende ${c.categories.join(", ")}.`);
      if (s.status === "nuovo") reasons.push(`${s.name} è un servizio nuovo.`);
      if (warm) reasons.push(`Ultimo contatto ${ago(idle!)} fa.`);

      candidates.push({
        ruleKey: `servizio:${c.id}:${s.id}`,
        reason: "servizio",
        companyId: c.id,
        personId: interested?.id ?? contact?.id ?? null,
        serviceId: s.id,
        factId: fact?.id ?? null,
        sourceOpportunityId: null,
        rationale: reasons.join(" "),
        score: clamp(
          40 + affinity + (interested ? 30 : 0) + (fact ? 20 : 0) + (categoryFit ? 10 : 0) + (isClient ? 10 : 0) + (warm ? 10 : 0) + (s.status === "nuovo" ? 10 : 0),
        ),
      });
    }
    candidates.sort((a, b) => b.score - a.score);

    // --- Cliente dormiente: una scheda sola, con dentro il servizio da proporre ------------------
    if (isClient && !activeProject && (idle == null || idle >= input.dormantDays)) {
      const names = projects.map((p) => p.name).slice(0, 3);
      const history = names.length ? `Con noi: ${list(names.map((n) => `"${n}"`))}.` : won.length ? `Deal vinto: "${won[0].name}".` : "";
      const pitch = candidates[0];
      const pitchName = pitch ? activeServices.find((x) => x.id === pitch.serviceId)!.name : null;
      out.push({
        ruleKey: `dormiente:${c.id}`,
        reason: "dormiente",
        companyId: c.id,
        personId: pitch?.personId ?? contact?.id ?? null,
        serviceId: pitch?.serviceId ?? null,
        factId: pitch?.factId ?? null,
        sourceOpportunityId: null,
        rationale: [
          idle == null ? "Cliente senza contatti né date registrate nel CRM." : `Cliente fermo da ${ago(idle)} (ultima attività a ${when(lastActivity!)}).`,
          history || (idle == null ? "Nessun progetto collegato: da verificare." : ""),
          pitchName ? `Da proporre: ${pitchName}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        score: clamp(
          (idle == null ? (names.length ? 45 : 35) : 55 + Math.min(25, ((idle - input.dormantDays) / 30) * 3) + Math.min(10, projects.length * 5)) +
            (pitch ? 5 : 0),
        ),
      });
    } else {
      out.push(...candidates.slice(0, SERVICES_PER_COMPANY));
    }

    // --- Deal perso da riprendere: solo l'ultimo, e solo se non è successo altro dopo --------------
    const lastLost = [...lost].sort((a, b) => (b.closedOn ?? b.createdOn).localeCompare(a.closedOn ?? a.createdOn))[0];
    if (lastLost && lastLost.lostReason !== "annullato") {
      const closed = lastLost.closedOn ?? lastLost.createdOn;
      const rule = RETRY[lastLost.lostReason ?? "altro"] ?? RETRY.altro;
      const since = daysBetween(closed, today);
      const wonLater = won.some((d) => (d.closedOn ?? d.createdOn) > closed);
      if (!wonLater && since >= rule.days) {
        const svc = servicesIn(lastLost.name, activeServices)[0] ?? null;
        // Più è vecchio, meno vale: dopo 2 anni dall'attesa giusta non lo proponiamo più
        const stale = since - rule.days;
        if (stale <= 730) {
          out.push({
            ruleKey: `ripresa:${lastLost.id}`,
            reason: "ripresa",
            companyId: c.id,
            personId: lastLost.personId ?? contact?.id ?? null,
            serviceId: svc?.id ?? null,
            factId: null,
            sourceOpportunityId: lastLost.id,
            rationale: rule.text(lastLost.name, when(closed), ago(since), svc?.name ?? null),
            score: clamp(rule.score - (stale > 365 ? 15 : 0)),
          });
        }
      }
    }
  }

  // --- Segnali con data: tornano quando arriva il momento (fino a 14 giorni prima) --------------
  const companyIds = new Set(input.companies.filter((c) => c.relationship !== "interno").map((c) => c.id));
  for (const f of input.facts) {
    if (!f.resurfaceOn || !f.companyId || !companyIds.has(f.companyId)) continue;
    const until = daysBetween(today, f.resurfaceOn);
    if (until > 14 || until < -60) continue;
    out.push({
      ruleKey: `segnale:${f.id}`,
      reason: "segnale",
      companyId: f.companyId,
      personId: f.personId ?? contactOf(f.companyId)?.id ?? null,
      serviceId: servicesIn(f.text, activeServices)[0]?.id ?? null,
      factId: f.id,
      sourceOpportunityId: null,
      rationale: until > 0 ? `Tra ${until} giorni: ${f.text}` : `${f.text}`,
      score: clamp(80 - Math.max(0, until)),
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

function groupBy<T>(xs: T[], key: (x: T) => string | null) {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (k == null) continue;
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
}
