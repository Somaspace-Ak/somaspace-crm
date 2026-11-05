import "server-only";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  agentLog,
  companies,
  facts,
  opportunities,
  people,
  projects,
  services,
  settings as settingsTable,
  suggestions,
} from "@/db/schema";
import { addDays, todayInRome, toRomeDate } from "@/lib/followup/dates";
import { fullName } from "@/lib/format";
import { suggestOpportunities } from "@/lib/suggestions/engine";

export const DEFAULT_SUGGESTION_SETTINGS = { dormantDays: 180 };
export type SuggestionSettings = typeof DEFAULT_SUGGESTION_SETTINGS;

/** Dopo una decisione (accettato o scartato), la stessa regola tace per questi giorni. */
const COOLDOWN_DAYS = 180;
const RUN_ACTION = "opportunita_regole";

export async function loadSuggestionSettings(db: Db): Promise<SuggestionSettings> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "suggestions"));
  const saved = (row?.value ?? {}) as Partial<SuggestionSettings>;
  const d = saved.dormantDays;
  return { dormantDays: typeof d === "number" && d > 0 ? Math.round(d) : DEFAULT_SUGGESTION_SETTINGS.dormantDays };
}

/**
 * Ricalcola i suggerimenti a regole: aggiunge i nuovi, aggiorna quelli ancora da valutare,
 * toglie quelli da valutare che non valgono più. Quelli decisi restano e la regola tace per un po'.
 */
export async function runSuggestionRules(db: Db, onBehalfOf?: string) {
  const today = todayInRome();
  const [cfg, cs, ps, svc, opps, prjs, fs, existing] = await Promise.all([
    loadSuggestionSettings(db),
    db.select().from(companies),
    db.select().from(people).where(eq(people.status, "attivo")),
    db.select().from(services),
    db.select().from(opportunities),
    db.select().from(projects),
    db.select().from(facts).where(isNull(facts.retractedAt)),
    db.select().from(suggestions).where(isNotNull(suggestions.ruleKey)),
  ]);

  const found = suggestOpportunities({
    today,
    dormantDays: cfg.dormantDays,
    companies: cs.map((c) => ({
      id: c.id,
      name: c.name,
      relationship: c.relationship,
      categories: c.categories,
      lastInteractionOn: c.lastInteractionAt ? toRomeDate(c.lastInteractionAt) : null,
    })),
    people: ps.map((p) => ({
      id: p.id,
      companyId: p.companyId,
      name: fullName(p),
      interests: p.interests,
      lastInteractionOn: p.lastInteractionAt ? toRomeDate(p.lastInteractionAt) : null,
    })),
    services: svc.map((s) => ({ id: s.id, name: s.name, targetCategories: s.targetCategories, status: s.status })),
    opportunities: opps.map((o) => ({
      id: o.id,
      name: o.name,
      companyId: o.companyId,
      personId: o.personId,
      stage: o.stage,
      lostReason: o.lostReason,
      closedOn: o.closedOn,
      createdOn: toRomeDate(o.createdAt),
    })),
    projects: prjs.map((p) => ({
      id: p.id,
      name: p.name,
      companyId: p.companyId,
      status: p.status,
      startOn: p.startOn,
      dueOn: p.dueOn,
      createdOn: toRomeDate(p.createdAt),
    })),
    facts: fs.map((f) => ({ id: f.id, text: f.text, companyId: f.companyId, personId: f.personId, resurfaceOn: f.resurfaceOn })),
  });

  const byKey = new Map<string, (typeof existing)[number][]>();
  for (const s of existing) byKey.set(s.ruleKey!, [...(byKey.get(s.ruleKey!) ?? []), s]);
  const cooldownFrom = addDays(today, -COOLDOWN_DAYS);

  let created = 0;
  let updated = 0;
  for (const f of found) {
    const prev = byKey.get(f.ruleKey) ?? [];
    const open = prev.find((s) => s.status === "nuovo");
    const values = {
      companyId: f.companyId,
      personId: f.personId,
      reason: f.reason,
      serviceId: f.serviceId,
      factId: f.factId,
      sourceOpportunityId: f.sourceOpportunityId,
      rationale: f.rationale,
      score: f.score,
    };
    if (open) {
      if (open.score !== f.score || open.rationale !== f.rationale || open.personId !== f.personId) {
        await db.update(suggestions).set(values).where(eq(suggestions.id, open.id));
        updated++;
      }
      continue;
    }
    // Deciso di recente: non lo riproponiamo
    if (prev.some((s) => s.decidedAt && toRomeDate(s.decidedAt) > cooldownFrom)) continue;
    await db.insert(suggestions).values({ ...values, ruleKey: f.ruleKey });
    created++;
  }

  const stillValid = new Set(found.map((f) => f.ruleKey));
  const stale = existing.filter((s) => s.status === "nuovo" && !stillValid.has(s.ruleKey!));
  for (const s of stale) await db.delete(suggestions).where(eq(suggestions.id, s.id));

  await db.insert(agentLog).values({
    action: RUN_ACTION,
    outcome: "ok",
    detail: `${created} nuove, ${updated} aggiornate, ${stale.length} tolte perché non valgono più`,
    onBehalfOf: onBehalfOf ?? null,
  });
  return { created, updated, removed: stale.length };
}

let running: Promise<unknown> | null = null;

/** Le regole girano al massimo una volta al giorno da sole, quando si apre la pagina o Oggi. */
export async function ensureFreshSuggestions(db: Db) {
  // Due pagine aperte insieme non devono lanciare due giri
  running ??= checkAndRun(db).finally(() => (running = null));
  await running;
}

async function checkAndRun(db: Db) {
  const [last] = await db
    .select({ at: agentLog.at })
    .from(agentLog)
    .where(and(eq(agentLog.action, RUN_ACTION), eq(agentLog.outcome, "ok")))
    .orderBy(desc(agentLog.at))
    .limit(1);
  if (last && toRomeDate(last.at) === todayInRome()) return;
  await runSuggestionRules(db);
}
