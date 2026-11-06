import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { COMPANY_DOMAIN } from "@/lib/supabase/config";
import { authUrl, googleConfigured, STATE_COOKIE } from "@/server/google/client";
import { requireViewer } from "@/server/session";

/** Porta a Google per collegare Gmail e Calendar di chi è entrato nel CRM. */
export async function GET(request: NextRequest) {
  const viewer = await requireViewer();
  if (!googleConfigured) return NextResponse.redirect(new URL("/impostazioni?google=non-configurato", request.url));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(
    authUrl({
      redirectUri: `${request.nextUrl.origin}/api/google/callback`,
      state,
      loginHint: viewer.email,
      domain: COMPANY_DOMAIN,
    }),
  );
  // Il ritorno da Google deve portare lo stesso valore: protegge da richieste falsificate
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/google", maxAge: 600 });
  return res;
}
