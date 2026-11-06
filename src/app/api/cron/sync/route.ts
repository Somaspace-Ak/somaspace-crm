import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { syncAllGoogleAccounts } from "@/server/google/sync";
import { runSuggestionRules } from "@/server/suggestions";

/** Fino a 5 minuti: la prima lettura delle caselle può essere lunga. */
export const maxDuration = 300;

/**
 * Chiamata da Vercel Cron (vercel.json): legge Gmail e Calendar di tutti e ricalcola i suggerimenti.
 * Vercel manda "Authorization: Bearer <CRON_SECRET>": senza, la richiesta viene rifiutata.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }
  const google = await syncAllGoogleAccounts(db);
  const suggestions = await runSuggestionRules(db);
  return NextResponse.json({ google: google.map((g) => ({ userId: g.userId, ok: g.ok })), suggestions });
}
