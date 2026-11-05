import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authEnabled } from "@/lib/supabase/config";
import { sessionEmail } from "./supabase";

export const VIEWER_COOKIE = "crm_viewer";
const DEFAULT_VIEWER = "giordano@somaspaceagency.com";

export type User = typeof users.$inferSelect;

/**
 * Chi sta usando l'app.
 * Online: l'utente entrato con Supabase Auth, se è nella tabella utenti ed è attivo.
 * In locale senza chiavi Supabase: si sceglie dal menu utente, per provare la privacy tra caselle.
 */
export async function getViewer(): Promise<{ viewer: User; team: User[] }> {
  // Dati sempre freschi: niente prerendering per le pagine del CRM
  await connection();
  const team = await db.select().from(users).orderBy(asc(users.name));

  if (authEnabled) {
    const email = await sessionEmail();
    if (!email) redirect("/login");
    const viewer = team.find((u) => u.email === email && u.active);
    if (!viewer) redirect("/login?errore=non-autorizzato");
    return { viewer, team };
  }

  const jar = await cookies();
  const email = jar.get(VIEWER_COOKIE)?.value ?? DEFAULT_VIEWER;
  const viewer = team.find((u) => u.email === email) ?? team[0];
  if (!viewer) throw new Error("Nessun utente nel database: esegui pnpm db:seed");
  return { viewer, team };
}

/** Per le Server Actions: raggiungibili con una POST diretta, quindi verificano sempre l'utente. */
export async function requireViewer(): Promise<User> {
  const { viewer } = await getViewer();
  if (!viewer.active) throw new Error("Utente non autorizzato");
  return viewer;
}

/** Entra solo chi è nella tabella utenti ed è attivo: un account Supabase da solo non basta. */
export async function isAllowed(email: string) {
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email.toLowerCase()), eq(users.active, true)));
  return Boolean(u);
}

/** Dopo il login si torna dove si era, ma solo dentro l'app. */
export function safeNext(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
