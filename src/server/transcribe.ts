import "server-only";

/**
 * Trascrizione delle note vocali con ElevenLabs (Scribe), con chi dice cosa.
 * La chiave resta sul server: il telefono riceve un gettone monouso (scade dopo 15 minuti)
 * e manda l'audio direttamente a ElevenLabs. L'audio non passa da Vercel e non resta da noi.
 */

export const transcriptionEnabled = Boolean(process.env.ELEVENLABS_API_KEY);

export async function createScribeToken(): Promise<string> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Manca ELEVENLABS_API_KEY");
  const res = await fetch("https://api.elevenlabs.io/v1/single-use-token/batch_scribe", {
    method: "POST",
    headers: { "xi-api-key": key },
  });
  const json = (await res.json().catch(() => ({}))) as { token?: string };
  if (!res.ok || !json.token) throw new Error(`Gettone ElevenLabs non creato (${res.status})`);
  return json.token;
}
