import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Con DATABASE_URL (Supabase) usa Postgres vero.
 * Senza, usa PGlite: lo stesso Postgres, in locale su disco, senza account né Docker.
 */
export function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Pooler di Supabase in modalità transaction: niente prepared statement e una query alla volta per connessione.
    // postgres 4 di default ne accoda fino a 100 sulla stessa connessione e il pooler le lascia appese.
    const client = postgres(url, { prepare: false, max_pipeline: 1, max: 5, idle_timeout: 20 });
    return drizzlePostgres({ client, schema }) as unknown as Db;
  }
  const dir = process.env.PGLITE_DIR ?? "./.data/pglite";
  mkdirSync(dirname(dir), { recursive: true });
  return drizzlePglite({ client: new PGlite(dir), schema }) as unknown as Db;
}
