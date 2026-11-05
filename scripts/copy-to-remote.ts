/**
 * Copia il database locale (PGlite) su Postgres online (Supabase), tabella per tabella.
 *
 *   pnpm db:remote:copy                   database online vuoto (dopo pnpm db:remote:migrate)
 *   pnpm db:remote:copy --sostituisci     svuota prima il database online: cancella i dati che ci sono
 *
 * Legge DATABASE_URL da .env.supabase.
 *
 * Alla fine confronta il numero di righe di ogni tabella.
 */
import { PGlite } from "@electric-sql/pglite";
import { sql, type Table } from "drizzle-orm";
import { getTableName } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "../src/db/schema";

// In ordine di dipendenza: prima chi è richiamato dagli altri
const TABLES: Table[] = [
  s.users,
  s.companies,
  s.events,
  s.people,
  s.opportunities,
  s.projects,
  s.projectMembers,
  s.meetings,
  s.meetingParticipants,
  s.tasks,
  s.taskAssignees,
  s.interactions,
  s.interactionPeople,
  s.facts,
  s.services,
  s.grants,
  s.suggestions,
  s.settings,
  s.agentLog,
  s.excludedAddresses,
];

const BATCH = 200;

/** I task con un genitore vanno dopo il genitore. */
function parentsFirst<T extends { id: string; parentId: string | null }>(rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const depth = (r: T): number => (r.parentId && byId.has(r.parentId) ? 1 + depth(byId.get(r.parentId)!) : 0);
  return [...rows].sort((a, b) => depth(a) - depth(b));
}

async function count(db: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }, table: Table) {
  const res = (await db.execute(sql`select count(*)::int as n from ${table}`)) as { rows?: { n: number }[] } | { n: number }[];
  return Array.isArray(res) ? res[0].n : res.rows![0].n;
}

/** Il database di destinazione. PROVA_PGLITE_DIR: una seconda copia locale, per provare lo script senza Supabase. */
async function target() {
  const dir = process.env.PROVA_PGLITE_DIR;
  if (dir) {
    const db = drizzlePglite({ client: new PGlite(dir), schema: s });
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db, { migrationsFolder: "./drizzle" });
    return { db, end: () => Promise.resolve() };
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Manca DATABASE_URL: è la stringa di connessione del database online");
  const client = postgres(url, { prepare: false, max: 1 });
  return { db: drizzlePostgres({ client, schema: s }), end: () => client.end() };
}

async function main() {
  const replace = process.argv.includes("--sostituisci");
  const local = drizzlePglite({ client: new PGlite(process.env.PGLITE_DIR ?? "./.data/pglite"), schema: s });
  const { db: remote, end } = await target();

  const existing = await count(remote, s.users);
  if (existing && !replace) {
    throw new Error(`Il database online ha già ${existing} utenti. Per sostituire tutto rilancia con --sostituisci`);
  }
  if (replace) {
    console.log("Svuoto il database online…");
    const names = TABLES.map((t) => `"${getTableName(t)}"`).join(", ");
    await remote.execute(sql.raw(`truncate ${names} cascade`));
  }

  for (const table of TABLES) {
    let rows = (await local.select().from(table)) as Record<string, unknown>[];
    if (table === s.tasks) rows = parentsFirst(rows as { id: string; parentId: string | null }[]);
    for (let i = 0; i < rows.length; i += BATCH) {
      await remote.insert(table).values(rows.slice(i, i + BATCH) as never);
    }
    console.log(`${getTableName(table).padEnd(22)} ${rows.length}`);
  }

  console.log("\nControllo…");
  let ok = true;
  for (const table of TABLES) {
    const [a, b] = [await count(local, table), await count(remote, table)];
    if (a !== b) {
      ok = false;
      console.log(`  ${getTableName(table)}: locale ${a}, online ${b}`);
    }
  }
  await end();
  if (!ok) throw new Error("Le righe non tornano: guarda le tabelle sopra");
  console.log("Tutto copiato: le righe tornano in ogni tabella.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
