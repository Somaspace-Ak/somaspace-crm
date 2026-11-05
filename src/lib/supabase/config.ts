/**
 * Login con Supabase Auth. Si accende da solo quando ci sono le chiavi del progetto:
 * in locale, senza chiavi, si entra come prima scegliendo il fondatore dal menu utente.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfig = url && key ? { url, key } : null;

export const authEnabled = supabaseConfig !== null;

/** Il pulsante "Entra con Google" si mostra solo quando il provider è attivo in Supabase. */
export const googleEnabled = process.env.NEXT_PUBLIC_AUTH_GOOGLE === "1";

/** Solo account di questo dominio con Google (il controllo vero è la lista utenti nel database). */
export const COMPANY_DOMAIN = "somaspaceagency.com";
