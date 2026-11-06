# Somaspace CRM

Il CRM interno di Somaspace: relazioni, progetti e task, follow-up e opportunità proposte da un agente AI.
Il disegno completo è in [docs/schema-funzionale.html](docs/schema-funzionale.html), la specifica originale in `CRM Somaspace specifica tecnica.pdf`.

## Avvio in locale

Serve Node 22 o più recente e pnpm.

```bash
pnpm install
pnpm db:seed   # crea il database locale e carica i dati demo
pnpm dev       # http://localhost:3000
```

In locale il database è **PGlite**: lo stesso PostgreSQL, salvato in `.data/pglite`, senza account né Docker.
Con la variabile `DATABASE_URL` (Supabase) l'app usa Postgres vero, con lo stesso schema.

PGlite accetta un solo processo alla volta: ferma `pnpm dev` prima di lanciare `pnpm db:seed`.

## Comandi

| Comando | Cosa fa |
|---|---|
| `pnpm dev` | Avvia l'app |
| `pnpm test` | Test del motore follow-up e della forza relazione (i test di accettazione della specifica) |
| `pnpm db:seed` | Ricrea i dati demo, con date relative a oggi |
| `pnpm db:import-notion` | Sostituisce i dati con quelli veri esportati da Notion in `.data/notion-export` (fuori da Git). In Notion non modifica niente |
| `pnpm db:generate` | Genera una migrazione SQL dopo una modifica a `src/db/schema.ts` |
| `pnpm db:migrate` | Applica le migrazioni al database locale |
| `pnpm db:remote:migrate` | Applica le migrazioni su Supabase (chiavi in `.env.supabase`) |
| `pnpm db:remote:copy` | Copia il database locale su Supabase. Si rifiuta se online ci sono già dati; `--sostituisci` li cancella prima |

## Struttura

| Percorso | Contenuto |
|---|---|
| `src/db/schema.ts` | Tutte le tabelle: relazioni, progetti e task, memoria, opportunità proattive, ruoli |
| `src/lib/followup/` | Motore dei follow-up (regole della sezione 8), funzioni pure con test |
| `src/lib/strength.ts` | Forza della relazione (sezione 7) |
| `src/server/queries.ts` | Letture, con la privacy tra caselle applicata |
| `src/server/actions.ts` | Azioni di flusso (follow-up, pipeline, approvazioni), ognuna verifica l'utente |
| `src/server/mutations.ts` | Creazione e modifica dei record, con validazione e controllo delle email doppie |
| `src/app/(app)/` | Le schermate |
| `scripts/seed.ts` | Dati demo: aziende e persone inventate, mai clienti reali |

## Messa online (Vercel + Supabase)

Online l'app usa Supabase (Postgres a Londra, `eu-west-2`) e chiede il login. In locale, senza variabili, resta tutto come sopra.

1. **Supabase**: nuovo progetto, regione *West EU (London)*. Salva la password del database. Il Regno Unito è fuori dall'UE ma ha la decisione di adeguatezza: va citato nell'informativa privacy.
2. **Variabili**: copia `.env.example` in `.env.supabase` e compila `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Non in `.env.local`: `pnpm dev` lo leggerebbe e l'app in locale passerebbe al database online.
3. **Database**, con `pnpm dev` fermo:
   ```bash
   pnpm db:remote:migrate     # crea le tabelle su Supabase e le chiude all'API pubblica
   pnpm db:remote:copy        # copia i dati locali (quelli veri importati da Notion)
   ```
   La migrazione `0003_lock_tables` chiude tutte le tabelle all'API REST di Supabase: l'app le legge solo dal server. Ogni tabella nuova va chiusa allo stesso modo.
4. **Utenti**: in Supabase → Authentication → Users, *Add user → Create new user* per ogni fondatore, con *Auto Confirm User*. Entra solo chi è anche nella tabella `users` del CRM con `active = true`.
5. **Google** (facoltativo, consigliato): attiva il provider Google in Supabase con un client OAuth di Google Cloud, aggiungi `https://<dominio>/auth/callback` tra gli URL di redirect in Supabase → Authentication → URL Configuration, poi `NEXT_PUBLIC_AUTH_GOOGLE=1`. Lo stesso progetto Google Cloud servirà per Gmail e Calendar.
6. **Vercel**: importa il repository GitHub, incolla le stesse variabili in Settings → Environment Variables, deploy. Le funzioni girano a Londra (`vercel.json`, `lhr1`), nella stessa città del database: se il database cambia regione, va cambiata anche questa.

### Google (Gmail, Calendar, login)

- **Google Cloud**: progetto `somaspace-crm-513914` nell'organizzazione somaspaceagency.com, schermata di consenso *Interno*, client OAuth "Somaspace CRM web" con questi URI di reindirizzamento: `https://<progetto>.supabase.co/auth/v1/callback` (login), `https://somaspace-crm.vercel.app/api/google/callback` e `http://localhost:3000/api/google/callback` (Gmail e Calendar). API attive: Gmail e Google Calendar.
- **Supabase**: Authentication → Providers → Google con lo stesso Client ID e Secret; URL Configuration con Site URL dell'app e redirect `https://somaspace-crm.vercel.app/auth/callback**`.
- **Vercel**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET` (tipo Secret) e `NEXT_PUBLIC_AUTH_GOOGLE=1` (tipo Config: le `NEXT_PUBLIC_` finiscono nel browser). Le variabili `NEXT_PUBLIC_` entrano nell'app solo a una nuova build.
- **Sincronizzazione**: Vercel Cron chiama `/api/cron/sync` ogni 30 minuti (`vercel.json`).

## Stato del prototipo

Funziona con i dati demo oppure con i dati veri importati da Notion: Oggi, Da approvare, I miei task, Companies, People, Pipeline con drag and drop, Progetti con task e sotto-task, meeting, opportunità suggerite, impostazioni e log, ricerca Cmd+K, privacy tra caselle. Si creano aziende, persone, opportunità, progetti, task e interazioni (pulsante + in alto a sinistra, Cmd+K o dalle schede) e ogni campo delle schede si modifica al clic.

Le modifiche restano nel database dell'app: lo specchio verso Notion arriva con la fase 1.

Login: online con Supabase Auth (email e password, Google facoltativo); in locale si sceglie l'utente dal menu in basso a sinistra. Non ancora collegato: Gmail e Calendar, Claude API, specchio verso Notion, digest via email. Arrivano con le fasi 0, 3, 4 e 5.
