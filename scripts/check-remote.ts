/** Prova la connessione al database online (.env.supabase) senza mostrare password o indirizzo. */
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1, connect_timeout: 15 });
  try {
    const r = await sql`select current_setting('server_version') as v, (select count(*)::int from pg_tables where schemaname = 'public') as tabelle`;
    console.log("connesso:", r[0]);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.log("connessione fallita:", err.code ?? "", String(err.message).replace(/postgres(ql)?:\/\/\S+/g, "<url>"));
  } finally {
    await sql.end();
  }
}
main();
