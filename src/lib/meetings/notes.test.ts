import { describe, expect, it } from "vitest";
import { docKind, fileIdOf, guessProject, parseGeminiNotes } from "./notes";

describe("allegati di Meet", () => {
  it("riconosce registrazione, trascrizione e note di Gemini", () => {
    expect(docKind({ title: "Kickoff Aperio - 2026/11/03 10:00 CET - Recording", mimeType: "video/mp4" })).toBe("registrazione");
    expect(docKind({ title: "Kickoff Aperio - Trascrizione", mimeType: "application/vnd.google-apps.document" })).toBe("trascrizione");
    expect(docKind({ title: "Note di Gemini", mimeType: "application/vnd.google-apps.document" })).toBe("note");
    expect(docKind({ title: "Notes by Gemini", mimeType: "application/vnd.google-apps.document" })).toBe("note");
    expect(docKind({ title: "Brief.pdf", mimeType: "application/pdf" })).toBe("altro");
  });

  it("prende l'id del file dal link di Drive", () => {
    expect(fileIdOf({ url: "https://docs.google.com/document/d/1AbC_def-GHIjklmnop/edit" })).toBe("1AbC_def-GHIjklmnop");
    expect(fileIdOf({ fileId: "xyz1234567890", url: "" })).toBe("xyz1234567890");
  });
});

describe("note di Gemini", () => {
  it("legge riepilogo e prossimi passi in italiano", () => {
    const text = [
      "Riunione iniziata alle 10:00 CET",
      "Note",
      "Riepilogo",
      "Mehrsa ha confermato il budget per il sito.",
      "Il lancio è previsto a marzo.",
      "Dettagli",
      "* Budget: confermato entro fine mese.",
      "Passaggi successivi suggeriti",
      "* [ ] Giordano invierà il preventivo aggiornato.",
      "* [ ] Mehrsa condividerà il brand book.",
    ].join("\n");
    expect(parseGeminiNotes(text)).toEqual({
      summary: "Mehrsa ha confermato il budget per il sito.\nIl lancio è previsto a marzo.",
      nextSteps: ["Giordano invierà il preventivo aggiornato.", "Mehrsa condividerà il brand book."],
    });
  });

  it("legge anche le note in inglese", () => {
    const text = "Summary\nThe client wants a new site.\nDetails\n- stuff\nSuggested next steps\n- [ ] Michele will send the deck.";
    expect(parseGeminiNotes(text)).toEqual({ summary: "The client wants a new site.", nextSteps: ["Michele will send the deck."] });
  });

  it("senza intestazioni usa le prime righe", () => {
    expect(parseGeminiNotes("Abbiamo parlato del sito.\nServe una proposta.").summary).toBe("Abbiamo parlato del sito.\nServe una proposta.");
  });
});

describe("progetto del meeting", () => {
  const projects = [
    { id: "a", name: "Sito Aperio", companyId: "aperio", status: "attivo" },
    { id: "b", name: "Brand Aperio", companyId: "aperio", status: "chiuso" },
    { id: "c", name: "Campagna Orbit", companyId: "orbit", status: "attivo" },
    { id: "d", name: "Social Orbit", companyId: "orbit", status: "attivo" },
  ];
  it("l'unico progetto in corso del cliente", () => {
    expect(guessProject(projects, "aperio", "Call settimanale")?.id).toBe("a");
  });
  it("con più progetti in corso serve il nome nel titolo", () => {
    expect(guessProject(projects, "orbit", "Call settimanale")).toBeNull();
    expect(guessProject(projects, "orbit", "Allineamento Social Orbit")?.id).toBe("d");
  });
  it("una riunione interna con il nome del progetto", () => {
    expect(guessProject(projects, null, "Interno: Campagna Orbit, revisione")?.id).toBe("c");
    expect(guessProject(projects, null, "Pranzo")).toBeNull();
  });
});
