import { type NextRequest, NextResponse } from "next/server";
import { isAllowed, safeNext } from "@/server/session";
import { createSupabaseServer } from "@/server/supabase";

/** Ritorno da Google: crea la sessione, poi controlla che l'utente sia nella lista del CRM. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const login = (errore: string) => NextResponse.redirect(new URL(`/login?errore=${errore}`, url.origin));
  if (!code) return login("google");

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) return login("google");
  if (!(await isAllowed(data.user.email))) {
    await supabase.auth.signOut();
    return login("non-autorizzato");
  }
  return NextResponse.redirect(new URL(safeNext(url.searchParams.get("da")), url.origin));
}
