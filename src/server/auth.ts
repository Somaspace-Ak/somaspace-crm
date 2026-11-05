"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { COMPANY_DOMAIN, googleEnabled } from "@/lib/supabase/config";
import { isAllowed, safeNext } from "./session";
import { createSupabaseServer } from "./supabase";

export type LoginState = { error: string } | null;

export async function signInWithPassword(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Inserisci email e password" };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email o password non corrette" };
  // Controllo dopo l'accesso: chi non ha le credenziali non scopre chi è nella lista
  if (!(await isAllowed(email))) {
    await supabase.auth.signOut();
    return { error: "Questo account non è tra gli utenti del CRM" };
  }
  redirect(safeNext(form.get("da")));
}

export async function signInWithGoogle(form: FormData) {
  if (!googleEnabled) redirect("/login?errore=google");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const next = safeNext(form.get("da"));
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?da=${encodeURIComponent(next)}`,
      // Propone solo gli account Google dell'azienda
      queryParams: { hd: COMPANY_DOMAIN, prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?errore=google");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
