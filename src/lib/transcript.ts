/** Trascrizioni di ElevenLabs (Scribe): le parole con chi le dice → turni leggibili. Puro, testabile. */

export type ScribeWord = { text: string; type: "word" | "spacing" | "audio_event"; speaker_id?: string | null };
export type ScribeResponse = { text?: string; language_code?: string; words?: ScribeWord[] };

/** "Voce 1: …\n\nVoce 2: …". Con una sola voce, o senza etichette, il testo così com'è. */
export function speakerTurns(res: ScribeResponse): string {
  const words = (res.words ?? []).filter((w) => w.type !== "audio_event");
  const speakers = new Set(words.filter((w) => w.type === "word" && w.speaker_id).map((w) => w.speaker_id));
  if (speakers.size < 2) return (res.text ?? words.map((w) => w.text).join("")).trim();

  const names = new Map<string, string>();
  const turns: { who: string; text: string }[] = [];
  let current: string | null = null;
  for (const w of words) {
    if (w.type === "word" && w.speaker_id && w.speaker_id !== current) {
      current = w.speaker_id;
      const who = names.get(current) ?? `Voce ${names.size + 1}`;
      names.set(current, who);
      turns.push({ who, text: "" });
    }
    const last = turns.at(-1);
    if (last) last.text += w.text;
  }
  return turns
    .map((t) => ({ ...t, text: t.text.replace(/\s+/g, " ").trim() }))
    .filter((t) => t.text)
    .map((t) => `${t.who}: ${t.text}`)
    .join("\n\n");
}
