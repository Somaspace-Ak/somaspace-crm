import { after, type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { googleAccounts } from "@/db/schema";
import { encrypt } from "@/server/crypto";
import { exchangeCode, GOOGLE_SCOPES, revoke, STATE_COOKIE } from "@/server/google/client";
import { syncGoogleAccount } from "@/server/google/sync";
import { requireViewer } from "@/server/session";

/** La prima sincronizzazione parte dopo la risposta e può durare qualche minuto. */
export const maxDuration = 300;

/** Ritorno da Google: salva il refresh token cifrato e avvia la prima sincronizzazione. */
export async function GET(request: NextRequest) {
  const viewer = await requireViewer();
  const url = request.nextUrl;
  const back = (esito: string) => {
    const res = NextResponse.redirect(new URL(`/impostazioni?google=${esito}#google`, url.origin));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/google" });
    return res;
  };

  if (url.searchParams.get("error")) return back("annullato");
  const state = url.searchParams.get("state");
  if (!state || state !== request.cookies.get(STATE_COOKIE)?.value) return back("errore");
  const code = url.searchParams.get("code");
  if (!code) return back("errore");

  let tokens;
  try {
    tokens = await exchangeCode(code, `${url.origin}/api/google/callback`);
  } catch {
    return back("errore");
  }
  // Ognuno collega solo la propria casella: la privacy tra caselle si basa su questo
  if (tokens.email !== viewer.email) {
    await revoke(tokens.refresh_token ?? tokens.access_token);
    return back("account-diverso");
  }
  const granted = tokens.scope.split(" ");
  if (!GOOGLE_SCOPES.slice(2).every((s) => granted.includes(s))) return back("permessi-mancanti");
  if (!tokens.refresh_token) return back("errore");

  const values = { email: tokens.email, refreshToken: encrypt(tokens.refresh_token), scopes: granted, lastError: null };
  await db
    .insert(googleAccounts)
    .values({ userId: viewer.id, ...values })
    .onConflictDoUpdate({ target: googleAccounts.userId, set: values });

  // La prima lettura può richiedere un minuto: parte dopo la risposta
  after(() => syncGoogleAccount(db, viewer.id));
  return back("collegato");
}
