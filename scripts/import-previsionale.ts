/**
 * Porta nel CRM il previsionale di cassa nov 26 – feb 27 (v7): saldo della banca, riserva minima,
 * ogni incasso, uscita e compenso, legati a clienti, progetti e fondatori quando si trovano.
 *
 *   npx tsx --conditions=react-server scripts/import-previsionale.ts          importa (una volta sola)
 *   npx tsx --conditions=react-server scripts/import-previsionale.ts --prova  mostra cosa farebbe
 *
 * Online: anteporre --env-file=.env.supabase.
 */
import { eq, ilike } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { bankBalances, cashMovements, companies, projects, settings, users } from "../src/db/schema";
import { SHEET_BALANCE, SHEET_ITEMS, SHEET_RESERVE } from "../src/lib/finance/previsionale-nov26";

const FLAG = "finance_import_previsionale_nov26";

async function main() {
  const dryRun = process.argv.includes("--prova");
  const db = createDb();
  const [done] = await db.select().from(settings).where(eq(settings.key, FLAG));
  if (done && !dryRun) {
    console.log("Previsionale già importato: niente da fare.");
    process.exit(0);
  }

  const [projectRows, userRows] = await Promise.all([db.select({ id: projects.id, name: projects.name, companyId: projects.companyId }).from(projects), db.select().from(users)]);
  const companyCache = new Map<string, { id: string } | null>();
  const findCompany = async (name: string) => {
    if (!companyCache.has(name)) {
      const [c] = await db.select({ id: companies.id }).from(companies).where(ilike(companies.name, name));
      companyCache.set(name, c ?? null);
    }
    return companyCache.get(name)!;
  };
  const michele = userRows.find((u) => u.name === "Michele Rosari");

  const values: (typeof cashMovements.$inferInsert)[] = [];
  const missing = new Set<string>();
  for (const it of SHEET_ITEMS) {
    const company = it.company ? await findCompany(it.company) : null;
    if (it.company && !company) missing.add(`azienda ${it.company}`);
    const project = it.project ? projectRows.find((p) => p.name === it.project) : null;
    if (it.project && !project) missing.add(`progetto ${it.project}`);
    const user = it.user ? userRows.find((u) => u.name === it.user) : null;
    if (it.user && !user) missing.add(`utente ${it.user}`);
    values.push({
      direction: it.direction,
      category: it.category,
      title: it.title,
      amount: it.amount,
      dueOn: it.dueOn,
      certainty: it.certainty ?? "sicuro",
      companyId: company?.id ?? null,
      counterparty: company ? null : (it.counterparty ?? it.company ?? null),
      projectId: project?.id ?? null,
      userId: user?.id ?? null,
      notes: it.notes ? `${it.notes}\n(Dal previsionale v7 dell'8/11/2026)` : "Dal previsionale v7 dell'8/11/2026",
      createdBy: michele?.id ?? null,
    });
  }

  console.log(`${values.length} voci, saldo ${SHEET_BALANCE.amount} al ${SHEET_BALANCE.on}, riserva ${SHEET_RESERVE}.`);
  if (missing.size) console.log(`Non trovati nel CRM (resta il nome scritto): ${[...missing].join(", ")}`);
  if (dryRun) process.exit(0);

  await db.transaction(async (tx) => {
    await tx.insert(cashMovements).values(values);
    await tx.insert(bankBalances).values({ on: SHEET_BALANCE.on, amount: SHEET_BALANCE.amount, note: SHEET_BALANCE.note, createdBy: michele?.id ?? null });
    await tx
      .insert(settings)
      .values({ key: "finance", value: { reserve: SHEET_RESERVE, months: 4 } })
      .onConflictDoNothing();
    await tx.insert(settings).values({ key: FLAG, value: { at: new Date().toISOString(), count: values.length } });
  });
  console.log("Importato.");
  process.exit(0);
}

void main();
