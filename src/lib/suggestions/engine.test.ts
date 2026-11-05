import { describe, expect, it } from "vitest";
import { servicesIn, suggestOpportunities, type SuggestionInput } from "./engine";

const SERVICES = ["Brand", "Sito web", "Social e contenuti", "Video e render 3D", "Deck e pitch", "Eventi", "Marketing e lead gen"].map((name, i) => ({
  id: `s${i}`,
  name,
  targetCategories: [] as string[],
  status: "attivo",
}));
const svc = (name: string) => SERVICES.find((s) => s.name === name)!.id;

const TODAY = "2026-11-04";

function input(over: Partial<SuggestionInput> = {}): SuggestionInput {
  return {
    today: TODAY,
    dormantDays: 180,
    companies: [],
    people: [],
    services: SERVICES,
    opportunities: [],
    projects: [],
    facts: [],
    ...over,
  };
}

const company = (id: string, over: Partial<SuggestionInput["companies"][number]> = {}) => ({
  id,
  name: id,
  relationship: "cliente",
  categories: [],
  lastInteractionOn: "2026-10-01",
  ...over,
});
const project = (companyId: string, name: string, over: Partial<SuggestionInput["projects"][number]> = {}) => ({
  id: `${companyId}-${name}`,
  name,
  companyId,
  status: "chiuso",
  startOn: null,
  dueOn: "2026-06-01",
  createdOn: "2026-03-01",
  ...over,
});
const deal = (companyId: string, name: string, over: Partial<SuggestionInput["opportunities"][number]> = {}) => ({
  id: `${companyId}-${name}`,
  name,
  companyId,
  personId: null,
  stage: "persa" as const,
  lostReason: "tempistica",
  closedOn: "2026-03-06",
  createdOn: "2026-01-10",
  ...over,
});

describe("servizi riconosciuti nei nomi", () => {
  it("legge italiano e inglese", () => {
    expect(servicesIn("Brand restyle e Sito web", SERVICES).map((s) => s.name)).toEqual(["Brand", "Sito web"]);
    expect(servicesIn("Website, decks, infographics", SERVICES).map((s) => s.name)).toEqual(["Sito web", "Deck e pitch"]);
    expect(servicesIn("Terrestrial products render", SERVICES).map((s) => s.name)).toEqual(["Video e render 3D"]);
    expect(servicesIn("Sprint Proposal", SERVICES)).toEqual([]);
  });
  it("non confonde parole che contengono la parola chiave", () => {
    expect(servicesIn("Rebranding", SERVICES)).toEqual([]);
  });
});

describe("servizio: il passo dopo quello già comprato", () => {
  it("chi ha fatto il brand riceve il sito web per primo", () => {
    const out = suggestOpportunities(input({ companies: [company("c1")], projects: [project("c1", "Brand restyle")] }));
    const services = out.filter((s) => s.reason === "servizio");
    expect(services[0].serviceId).toBe(svc("Sito web"));
    expect(services[0].rationale).toContain("Brand restyle");
    expect(services).toHaveLength(2);
  });

  it("non propone quello che hanno già comprato", () => {
    const out = suggestOpportunities(input({ companies: [company("c1")], projects: [project("c1", "Brand restyle e Sito web")] }));
    expect(out.some((s) => s.serviceId === svc("Sito web") || s.serviceId === svc("Brand"))).toBe(false);
  });

  it("niente proposte a chi ha una trattativa aperta", () => {
    const out = suggestOpportunities(
      input({
        companies: [company("c1")],
        projects: [project("c1", "Brand restyle")],
        opportunities: [deal("c1", "Sito web", { stage: "in_progress", lostReason: null, closedOn: null })],
      }),
    );
    expect(out).toEqual([]);
  });

  it("senza storia, un prospect non riceve servizi a caso", () => {
    const out = suggestOpportunities(input({ companies: [company("c1", { relationship: "prospect" })] }));
    expect(out).toEqual([]);
  });

  it("l'interesse di una persona basta anche per un prospect", () => {
    const out = suggestOpportunities(
      input({
        companies: [company("c1", { relationship: "prospect" })],
        people: [{ id: "p1", companyId: "c1", name: "Anna Rossi", interests: ["Video e render 3D"], lastInteractionOn: null }],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ reason: "servizio", serviceId: svc("Video e render 3D"), personId: "p1" });
  });

  it("le aziende interne sono escluse", () => {
    const out = suggestOpportunities(input({ companies: [company("c1", { relationship: "interno" })], projects: [project("c1", "Brand")] }));
    expect(out).toEqual([]);
  });
});

describe("cliente dormiente", () => {
  it("cliente fermo oltre la soglia", () => {
    const out = suggestOpportunities(
      input({ companies: [company("c1", { lastInteractionOn: "2025-01-10" })], projects: [project("c1", "Pitch deck", { dueOn: "2025-02-01" })] }),
    );
    const d = out.find((s) => s.reason === "dormiente")!;
    expect(d.rationale).toContain("Pitch deck");
    expect(d.score).toBeGreaterThan(55);
  });

  it("una scheda sola per il dormiente, con il servizio da proporre dentro", () => {
    const out = suggestOpportunities(
      input({ companies: [company("c1", { lastInteractionOn: "2025-01-10" })], projects: [project("c1", "Brand restyle", { dueOn: "2025-02-01" })] }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ reason: "dormiente", serviceId: svc("Sito web") });
    expect(out[0].rationale).toContain("Da proporre: Sito web");
  });

  it("un progetto in corso vuol dire che non è dormiente", () => {
    const out = suggestOpportunities(
      input({ companies: [company("c1", { lastInteractionOn: "2025-01-10" })], projects: [project("c1", "Sito", { status: "attivo" })] }),
    );
    expect(out.some((s) => s.reason === "dormiente")).toBe(false);
  });

  it("sotto la soglia non è dormiente", () => {
    const out = suggestOpportunities(input({ companies: [company("c1", { lastInteractionOn: "2026-08-01" })] }));
    expect(out.some((s) => s.reason === "dormiente")).toBe(false);
  });
});

describe("deal perso da riprendere", () => {
  it("perso per tempistica: dopo 4 mesi torna", () => {
    const out = suggestOpportunities(
      input({ companies: [company("c1", { relationship: "prospect" })], opportunities: [deal("c1", "Website, decks, infographics")] }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ reason: "ripresa", serviceId: svc("Sito web"), score: 75 });
    expect(out[0].rationale).toContain("tempistica");
  });

  it("troppo presto: non torna", () => {
    const out = suggestOpportunities(
      input({ companies: [company("c1", { relationship: "prospect" })], opportunities: [deal("c1", "Website", { closedOn: "2026-09-01" })] }),
    );
    expect(out).toEqual([]);
  });

  it("perso per un concorrente aspetta un anno", () => {
    const early = suggestOpportunities(
      input({ companies: [company("c1", { relationship: "prospect" })], opportunities: [deal("c1", "Brand", { lostReason: "concorrente" })] }),
    );
    expect(early).toEqual([]);
    const late = suggestOpportunities(
      input({
        companies: [company("c1", { relationship: "prospect" })],
        opportunities: [deal("c1", "Brand", { lostReason: "concorrente", closedOn: "2025-09-01" })],
      }),
    );
    expect(late[0].reason).toBe("ripresa");
  });

  it("progetto annullato: non si ripropone", () => {
    const out = suggestOpportunities(
      input({ companies: [company("c1", { relationship: "prospect" })], opportunities: [deal("c1", "Brand", { lostReason: "annullato", closedOn: "2025-01-01" })] }),
    );
    expect(out).toEqual([]);
  });
});

describe("segnale con data", () => {
  it("torna fino a 14 giorni prima della data", () => {
    const facts = [{ id: "f1", text: "Il budget marketing riapre a novembre", companyId: "c1", personId: null, resurfaceOn: "2026-11-10" }];
    const out = suggestOpportunities(input({ companies: [company("c1", { relationship: "prospect" })], facts }));
    expect(out[0]).toMatchObject({ reason: "segnale", factId: "f1", serviceId: svc("Marketing e lead gen") });
  });
  it("troppo lontano: non ancora", () => {
    const facts = [{ id: "f1", text: "Round serie A", companyId: "c1", personId: null, resurfaceOn: "2027-03-01" }];
    expect(suggestOpportunities(input({ companies: [company("c1", { relationship: "prospect" })], facts }))).toEqual([]);
  });
});
