import { describe, expect, it } from "vitest";
import { type ScribeWord, speakerTurns } from "./transcript";

const w = (text: string, speaker_id?: string): ScribeWord => ({ text, type: "word", speaker_id });
const sp = (speaker_id?: string): ScribeWord => ({ text: " ", type: "spacing", speaker_id });

describe("speakerTurns", () => {
  it("raggruppa le parole per voce, nell'ordine in cui parlano", () => {
    const words = [
      w("Ciao,", "speaker_0"),
      sp("speaker_0"),
      w("sono", "speaker_0"),
      sp("speaker_0"),
      w("Marco.", "speaker_0"),
      sp(),
      w("Piacere!", "speaker_1"),
      sp("speaker_1"),
      { text: "(risata)", type: "audio_event" as const, speaker_id: "speaker_1" },
      sp(),
      w("Bene.", "speaker_0"),
    ];
    expect(speakerTurns({ text: "x", words })).toBe("Voce 1: Ciao, sono Marco.\n\nVoce 2: Piacere!\n\nVoce 1: Bene.");
  });

  it("con una sola voce usa il testo", () => {
    expect(speakerTurns({ text: " Solo io. ", words: [w("Solo", "speaker_0"), sp("speaker_0"), w("io.", "speaker_0")] })).toBe("Solo io.");
  });

  it("senza parole né testo torna vuoto", () => {
    expect(speakerTurns({})).toBe("");
  });
});
