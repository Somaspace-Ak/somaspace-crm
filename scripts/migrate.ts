import type { Db } from "../src/db/client";

/** Applica le migrazioni SQL in ./drizzle, su PGlite in locale o su Postgres con DATABASE_URL. */
export async function migrateDb(db: Db) {
  const migrationsFolder = "./drizzle";
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(db as never, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder });
  }
}
