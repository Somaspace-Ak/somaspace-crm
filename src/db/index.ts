import "server-only";
import { createDb, type Db } from "./client";

// In sviluppo Next ricarica i moduli: un solo client per processo.
const globalForDb = globalThis as unknown as { db?: Db };

/**
 * Il client nasce alla prima query, non all'import del modulo:
 * così la connessione si apre solo durante una richiesta vera, mai durante il prerendering.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = (globalForDb.db ??= createDb());
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export * as schema from "./schema";
