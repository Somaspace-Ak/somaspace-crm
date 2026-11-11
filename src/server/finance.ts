import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, notInArray, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bankBalances, cashCategoryEnum, cashMovements, companies, opportunities, projects, settings, users } from "@/db/schema";
import { addDays, todayInRome } from "@/lib/followup/dates";
import { buildForecast, type Scenario } from "@/lib/finance/forecast";
import { CASH_CATEGORY } from "@/lib/labels";
import type { User } from "./session";

/**
 * Finanza: il previsionale di cassa, le voci di entrata e uscita, i contratti e i fornitori.
 * La vedono solo i fondatori: i collaboratori non hanno l'area né le cifre nelle schede.
 */

export const canSeeFinance = (viewer: Pick<User, "role">) => viewer.role === "fondatore";

export type FinanceSettings = { reserve: number; months: number };
const DEFAULT_SETTINGS: FinanceSettings = { reserve: 0, months: 4 };

export async function loadFinanceSettings(): Promise<FinanceSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "finance"));
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<FinanceSettings>) ?? {}) };
}

export async function getLatestBalance() {
  const [row] = await db.select().from(bankBalances).orderBy(desc(bankBalances.on), desc(bankBalances.createdAt)).limit(1);
  return row ?? null;
}

const movementRow = {
  m: cashMovements,
  company: { id: companies.id, name: companies.name },
  project: { id: projects.id, name: projects.name },
  person: { id: users.id, name: users.name, initials: users.initials },
};

function baseMovements() {
  return db
    .select(movementRow)
    .from(cashMovements)
    .leftJoin(companies, eq(companies.id, cashMovements.companyId))
    .leftJoin(projects, eq(projects.id, cashMovements.projectId))
    .leftJoin(users, eq(users.id, cashMovements.userId))
    .$dynamic();
}

export type MovementRow = Awaited<ReturnType<typeof listMovements>>[number];

export async function listMovements(f: {
  direction?: "entrata" | "uscita";
  open?: boolean;
  paid?: boolean;
  companyId?: string;
  projectId?: string;
  opportunityId?: string;
  counterparty?: string;
  category?: (typeof cashCategoryEnum.enumValues)[number];
  q?: string;
}) {
  const where: (SQL | undefined)[] = [];
  if (f.direction) where.push(eq(cashMovements.direction, f.direction));
  if (f.open) where.push(ne(cashMovements.status, "pagato"));
  if (f.paid) where.push(eq(cashMovements.status, "pagato"));
  if (f.companyId) where.push(eq(cashMovements.companyId, f.companyId));
  if (f.projectId) where.push(eq(cashMovements.projectId, f.projectId));
  if (f.opportunityId) where.push(eq(cashMovements.opportunityId, f.opportunityId));
  if (f.counterparty) where.push(and(isNull(cashMovements.companyId), ilike(cashMovements.counterparty, f.counterparty)));
  if (f.category) where.push(eq(cashMovements.category, f.category));
  if (f.q) where.push(or(ilike(cashMovements.title, `%${f.q}%`), ilike(cashMovements.counterparty, `%${f.q}%`), ilike(companies.name, `%${f.q}%`)));
  return baseMovements()
    .where(and(...where))
    .orderBy(asc(cashMovements.dueOn), asc(cashMovements.title));
}

export async function getMovement(id: string) {
  const [row] = await baseMovements().where(eq(cashMovements.id, id));
  if (!row) return null;
  const [opp] = row.m.opportunityId
    ? await db.select({ id: opportunities.id, name: opportunities.name, finalValue: opportunities.finalValue }).from(opportunities).where(eq(opportunities.id, row.m.opportunityId))
    : [];
  return { ...row, opportunity: opp ?? null };
}

/** Il previsionale e quello che gli sta intorno: scadenze, contratti da pianificare, potenziale in trattativa. */
export async function getFinanceOverview(opts: { scenario: Scenario; months?: number }) {
  const today = todayInRome();
  const [cfg, balance, rows, open] = await Promise.all([
    loadFinanceSettings(),
    getLatestBalance(),
    baseMovements().orderBy(asc(cashMovements.dueOn)),
    db
      .select({ o: opportunities, company: { id: companies.id, name: companies.name } })
      .from(opportunities)
      .innerJoin(companies, eq(companies.id, opportunities.companyId))
      .where(inArray(opportunities.stage, ["lead", "in_progress"]))
      .orderBy(desc(opportunities.initialValue)),
  ]);
  const months = opts.months ?? cfg.months;
  const paidPeople = new Set(rows.filter((r) => r.m.category === "compensi" && r.m.userId).map((r) => r.m.userId)).size;
  const forecast = buildForecast({
    movements: rows.map((r) => r.m),
    balance: balance ? { on: balance.on, amount: balance.amount } : null,
    today,
    months,
    scenario: opts.scenario,
    reserve: cfg.reserve,
    paidPeople,
  });

  const byId = new Map(rows.map((r) => [r.m.id, r]));
  const horizon = addDays(today, 14);
  const upcoming = rows.filter((r) => r.m.status !== "pagato" && r.m.dueOn && r.m.dueOn <= horizon);
  const unplanned = forecast.unplanned.map((m) => byId.get(m.id)!).filter(Boolean);
  const contracts = await getContracts();

  return {
    today,
    settings: { ...cfg, months },
    balance,
    forecast,
    byId,
    upcoming,
    unplanned,
    toPlan: contracts.signed.filter((c) => c.toPlan > 0.5),
    pipeline: {
      rows: open,
      lead: open.filter((r) => r.o.stage === "lead").reduce((s, r) => s + (r.o.initialValue ?? 0), 0),
      quoted: open.filter((r) => r.o.stage === "in_progress").reduce((s, r) => s + (r.o.initialValue ?? 0), 0),
    },
  };
}

/**
 * I contratti: i deal vinti e gli incassi da contratto senza deal (contratti firmati fuori dalla pipeline),
 * con quanto è pianificato e quanto è incassato. Più le trattative aperte, il guadagno potenziale.
 */
export async function getContracts() {
  const [won, incomes, open, [first]] = await Promise.all([
    db
      .select({ o: opportunities, company: { id: companies.id, name: companies.name }, project: { id: projects.id, name: projects.name } })
      .from(opportunities)
      .innerJoin(companies, eq(companies.id, opportunities.companyId))
      .leftJoin(projects, eq(projects.opportunityId, opportunities.id))
      .where(eq(opportunities.stage, "vinta"))
      .orderBy(desc(opportunities.closedOn)),
    baseMovements().where(eq(cashMovements.direction, "entrata")),
    db
      .select({ o: opportunities, company: { id: companies.id, name: companies.name } })
      .from(opportunities)
      .innerJoin(companies, eq(companies.id, opportunities.companyId))
      .where(inArray(opportunities.stage, ["lead", "in_progress"]))
      .orderBy(desc(opportunities.quoteSentOn), desc(opportunities.createdAt)),
    db.select({ on: bankBalances.on }).from(bankBalances).orderBy(asc(bankBalances.on)).limit(1),
  ]);
  // I deal vinti prima che si cominciasse a tenere la cassa qui sono storia: niente da pianificare
  const since = first?.on ?? null;

  const sums = (list: typeof incomes) => ({
    planned: list.reduce((s, r) => s + r.m.amount, 0),
    paid: list.filter((r) => r.m.status === "pagato").reduce((s, r) => s + r.m.amount, 0),
    nextDue: list.filter((r) => r.m.status !== "pagato" && r.m.dueOn).map((r) => r.m.dueOn!).sort()[0] ?? null,
  });

  const signed = won.map(({ o, company, project }) => {
    const list = incomes.filter((r) => r.m.opportunityId === o.id);
    const s = sums(list);
    const value = o.finalValue ?? o.initialValue ?? 0;
    const historic = !list.length && (!since || !o.closedOn || o.closedOn < since);
    return {
      key: o.id,
      name: o.name,
      opportunityId: o.id as string | null,
      company: company as { id: string; name: string } | null,
      counterparty: null as string | null,
      project: project?.id ? project : null,
      closedOn: o.closedOn,
      value,
      ...s,
      toPlan: historic ? 0 : Math.max(0, value - s.planned),
      historic,
      movements: list,
    };
  });

  // Incassi da contratto senza deal: un contratto per cliente e progetto
  const loose = new Map<string, typeof incomes>();
  for (const r of incomes) {
    if (r.m.opportunityId || r.m.category !== "contratto") continue;
    const key = `${r.m.companyId ?? r.m.counterparty ?? "?"}|${r.m.projectId ?? ""}`;
    loose.set(key, [...(loose.get(key) ?? []), r]);
  }
  for (const [key, list] of loose) {
    const first = list[0]!;
    const s = sums(list);
    signed.push({
      key,
      name: first.project?.name ?? first.company?.name ?? first.m.counterparty ?? "Contratto",
      opportunityId: null,
      company: first.company?.id ? first.company : null,
      counterparty: first.m.counterparty,
      project: first.project?.id ? first.project : null,
      closedOn: null,
      value: s.planned,
      ...s,
      toPlan: 0,
      historic: false,
      movements: list,
    });
  }

  return { signed, open };
}

export type ContractRow = Awaited<ReturnType<typeof getContracts>>["signed"][number];

/** Fornitori e collaboratori: a chi paghiamo, quanto è pagato, quanto resta e quando. */
export async function getSuppliers() {
  // Compensi e margine per imprevisti non sono fornitori
  const rows = await baseMovements().where(and(eq(cashMovements.direction, "uscita"), notInArray(cashMovements.category, ["compensi", "imprevisti"])));
  const groups = new Map<string, { key: string; name: string; company: { id: string; name: string } | null; counterparty: string | null; category: string | null; categories: Set<string>; paid: number; due: number; nextDue: string | null; count: number }>();
  for (const r of rows) {
    // Senza un nome (costi fissi, trasferte) si raggruppa per categoria
    const name = r.company?.name ?? (r.m.counterparty?.trim() || CASH_CATEGORY[r.m.category].label);
    const key = r.company?.id ?? `n:${name.toLowerCase()}`;
    const g = groups.get(key) ?? { key, name, company: r.company?.id ? r.company : null, counterparty: r.company?.id ? null : (r.m.counterparty?.trim() || null), category: r.m.category, categories: new Set<string>(), paid: 0, due: 0, nextDue: null, count: 0 };
    g.categories.add(r.m.category);
    g.count++;
    if (r.m.status === "pagato") g.paid += r.m.amount;
    else {
      g.due += r.m.amount;
      if (r.m.dueOn && (!g.nextDue || r.m.dueOn < g.nextDue)) g.nextDue = r.m.dueOn;
    }
    groups.set(key, g);
  }
  // Anche i fornitori registrati nel CRM senza voci ancora
  const known = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.relationship, "fornitore"));
  for (const c of known) if (!groups.has(c.id)) groups.set(c.id, { key: c.id, name: c.name, company: c, counterparty: null, category: null, categories: new Set(), paid: 0, due: 0, nextDue: null, count: 0 });
  return [...groups.values()].map((g) => ({ ...g, categories: [...g.categories] })).sort((a, b) => b.due - a.due || b.paid - a.paid || a.name.localeCompare(b.name));
}

/** Le cifre di un cliente, di un progetto o di un deal, per le loro schede. */
export async function getEntityFinance(f: { companyId?: string; projectId?: string; opportunityId?: string }) {
  const rows = await listMovements(f);
  const sum = (dir: "entrata" | "uscita", paid: boolean) =>
    rows.filter((r) => r.m.direction === dir && (r.m.status === "pagato") === paid).reduce((s, r) => s + r.m.amount, 0);
  return {
    rows,
    incassato: sum("entrata", true),
    daIncassare: sum("entrata", false),
    pagato: sum("uscita", true),
    daPagare: sum("uscita", false),
  };
}

export async function getBalances() {
  return db
    .select({ b: bankBalances, by: { name: users.name } })
    .from(bankBalances)
    .leftJoin(users, eq(users.id, bankBalances.createdBy))
    .orderBy(desc(bankBalances.on), desc(bankBalances.createdAt));
}
