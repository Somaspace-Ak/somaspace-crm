import "server-only";

/**
 * Le poche chiamate a Google che servono, con fetch: niente librerie pesanti.
 * Solo lettura: Gmail e Calendar non vengono mai modificati dal CRM.
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

/** Cookie con lo stato della richiesta a Google, per riconoscere il ritorno. */
export const STATE_COOKIE = "crm_google_state";

export const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

function credentials() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Mancano GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET");
  return { id, secret };
}

export function authUrl(opts: { redirectUri: string; state: string; loginHint: string; domain: string }) {
  const p = new URLSearchParams({
    client_id: credentials().id,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    // Refresh token per sincronizzare anche quando l'utente non è nell'app
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    login_hint: opts.loginHint,
    hd: opts.domain,
    state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; scope: string; id_token?: string; expires_in: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok) throw new GoogleError(json.error_description ?? json.error ?? `token ${res.status}`, json.error);
  return json;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const { id, secret } = credentials();
  const t = await tokenRequest({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri, grant_type: "authorization_code" });
  // L'id_token arriva direttamente da Google su TLS: basta leggerne l'email
  const email = t.id_token ? (JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()).email as string) : null;
  return { ...t, email: email?.toLowerCase() ?? null };
}

export async function accessToken(refreshToken: string) {
  const { id, secret } = credentials();
  const t = await tokenRequest({ refresh_token: refreshToken, client_id: id, client_secret: secret, grant_type: "refresh_token" });
  return t.access_token;
}

export async function revoke(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}

export class GoogleError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** GET su un'API Google con il token di accesso. */
/**
 * Gmail concede 15.000 unità al minuto per utente e ogni lettura ne costa 5: oltre 50 richieste al secondo
 * risponde "Quota exceeded". Qui si resta a 15 al secondo per account, lasciando margine a Gmail stesso.
 */
const MIN_INTERVAL_MS = 1000 / 15;
const nextSlot = new Map<string, number>();

async function throttle(token: string) {
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(token) ?? 0);
  nextSlot.set(token, slot + MIN_INTERVAL_MS);
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Quota superata: Google risponde 429, oppure 403 con "rate limit" o "quota" nel messaggio. */
function isQuotaError(status: number, message: string) {
  return status === 429 || (status === 403 && /rate ?limit|quota/i.test(message));
}

export async function googleGet<T>(token: string, url: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) u.searchParams.set(k, String(v));
  for (let attempt = 0; ; attempt++) {
    await throttle(token);
    const res = await fetch(u, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
    if (res?.ok) return res.json() as Promise<T>;
    const body = res ? await res.json().catch(() => ({})) : {};
    const message: string = body?.error?.message ?? `${u.pathname}: ${res?.status ?? "rete"}`;
    const quota = res ? isQuotaError(res.status, message) : false;
    // Errori temporanei (rete, 5xx) e quota: si riprova con attese crescenti.
    // La quota è al minuto: dopo il primo stop si aspetta abbastanza perché la finestra si svuoti.
    const transient = !res || res.status >= 500 || quota;
    if (!transient || attempt >= (quota ? 4 : 3)) throw new GoogleError(message, quota ? "quota" : String(res?.status ?? "rete"));
    await sleep(quota ? 5_000 * 2 ** attempt : 500 * 2 ** attempt);
  }
}

/** Esegue `fn` su tutti gli elementi, al massimo `limit` alla volta. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
