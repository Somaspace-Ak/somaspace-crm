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
export async function googleGet<T>(token: string, url: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) u.searchParams.set(k, String(v));
  // Google ogni tanto risponde con errori temporanei (429, 5xx): si riprova con attese crescenti
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(u, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
    if (res?.ok) return res.json() as Promise<T>;
    const transient = !res || res.status === 429 || res.status >= 500;
    if (!transient || attempt >= 3) {
      const body = res ? await res.json().catch(() => ({})) : {};
      throw new GoogleError(body?.error?.message ?? `${u.pathname}: ${res?.status ?? "rete"}`, String(res?.status ?? "rete"));
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
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
