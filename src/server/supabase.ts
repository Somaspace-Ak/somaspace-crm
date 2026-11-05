import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "@/lib/supabase/config";

/** Client Supabase lato server: legge e rinnova la sessione nei cookie. */
export async function createSupabaseServer() {
  if (!supabaseConfig) throw new Error("Supabase non configurato: mancano NEXT_PUBLIC_SUPABASE_URL e la chiave pubblica");
  const jar = await cookies();
  return createServerClient(supabaseConfig.url, supabaseConfig.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Durante il rendering i cookie non si possono scrivere: li rinnova il proxy
        }
      },
    },
  });
}

/** L'email di chi è entrato, o null. Verifica il token senza chiamare Supabase a ogni pagina. */
export async function sessionEmail(): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  return typeof email === "string" ? email.toLowerCase() : null;
}
