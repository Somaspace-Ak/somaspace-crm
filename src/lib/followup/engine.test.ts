import { describe, expect, it } from "vitest";
import { addDays, toRomeDate } from "./dates";
import {
  applyOutboundEmail,
  buildTodayQueue,
  opportunityFollowup,
  personFollowup,
  pickDrafts,
  shouldSendDigest,
  type OpportunityFollowupInput,
  type PersonFollowupInput,
  type QueueOpportunity,
  type QueuePerson,
} from "./engine";

// Test di accettazione della specifica, sezione 12

const person = (over: Partial<PersonFollowupInput> = {}): PersonFollowupInput => ({
  status: "attivo",
  mode: "caldo",
  lastInboundOn: null,
  lastOutboundOn: null,
  lastInteractionOn: null,
  snoozeUntil: null,
  isReferentOfOpenQuote: false,
  ...over,
});

const quote = (over: Partial<OpportunityFollowupInput> = {}): OpportunityFollowupInput => ({
  stage: "in_progress",
  quoteSentOn: "2026-10-01",
  step: 0,
  lastFollowupOn: null,
  snoozeUntil: null,
  lastInboundOn: null,
  lastOutboundOn: "2026-10-01",
  ...over,
});

describe("preventivo inviato il 1 ottobre, nessuna risposta", () => {
  it("bozze il 4, l'8, il 15 e il 31 ottobre, poi chiede Persa o Rimanda", () => {
    let o = quote();
    const dates: string[] = [];
    for (let i = 0; i < 4; i++) {
      const f = opportunityFollowup(o);
      expect(f.state).toBe("in_sequenza");
      expect(f.nextStep).toBe(i + 1);
      dates.push(f.nextOn!);
      // L'utente invia la bozza il giorno stesso
      o = applyOutboundEmail(o, f.nextOn!);
    }
    expect(dates).toEqual(["2026-10-04", "2026-10-08", "2026-10-15", "2026-10-31"]);
    expect(o.step).toBe(4);
    expect(opportunityFollowup(o).state).toBe("chiedi_esito");
  });

  it("dopo il passo 4 la voce resta in coda per chiedere l'esito, senza bozza", () => {
    const o: QueueOpportunity = {
      ...quote({ step: 4, lastFollowupOn: "2026-10-31", lastOutboundOn: "2026-10-31" }),
      id: "deal",
      personId: "p1",
      createdOn: "2026-09-20",
    };
    const queue = buildTodayQueue("2026-11-02", [], [o]);
    expect(queue).toHaveLength(1);
    expect(queue[0].askOutcome).toBe(true);
    expect(pickDrafts(queue)).toHaveLength(0);
  });

  it("un passo in ritardo non parte prima di 3 giorni dall'ultimo follow-up", () => {
    // Passo 1 inviato in ritardo il 7 ottobre: il passo 2 sarebbe l'8, slitta al 10
    const f = opportunityFollowup(quote({ step: 1, lastFollowupOn: "2026-10-07", lastOutboundOn: "2026-10-07" }));
    expect(f.nextOn).toBe("2026-10-10");
  });
});

describe("il cliente risponde dopo il passo 2", () => {
  const afterStep2 = quote({ step: 2, lastFollowupOn: "2026-10-08", lastOutboundOn: "2026-10-08" });

  it("la voce esce dai follow-up ed entra in Ti hanno scritto", () => {
    const replied = { ...afterStep2, lastInboundOn: "2026-10-10" };
    expect(opportunityFollowup(replied).state).toBe("attesa_risposta");

    const queue = buildTodayQueue(
      "2026-10-15",
      [],
      [{ ...replied, id: "deal", personId: "p1", createdOn: "2026-09-25" }],
    );
    expect(queue.map((i) => i.section)).toEqual(["ti_hanno_scritto"]);
  });

  it("se nessuno scrive più, torna in coda 7 giorni dopo l'ultima email, al passo 3", () => {
    let o: OpportunityFollowupInput = { ...afterStep2, lastInboundOn: "2026-10-10" };
    // Rispondiamo l'11: non è un passo della sequenza
    o = applyOutboundEmail(o, "2026-10-11");
    expect(o.step).toBe(2);
    const f = opportunityFollowup(o);
    expect(f).toEqual({ state: "in_sequenza", nextOn: "2026-10-18", nextStep: 3 });
  });
});

describe("relazioni calde e fredde", () => {
  it("persona Caldo, ultima email il 1 settembre: in coda il 1 ottobre", () => {
    const f = personFollowup(person({ mode: "caldo", lastOutboundOn: "2026-09-01" }));
    expect(f.nextOn).toBe("2026-10-01");
  });

  it("persona Freddo, ultima email il 1 luglio: in coda il 29 settembre", () => {
    const f = personFollowup(person({ mode: "freddo", lastOutboundOn: "2026-07-01" }));
    expect(f.nextOn).toBe("2026-09-29");
  });

  it("finisce nella sezione giusta della coda, con i giorni di ritardo", () => {
    const people: QueuePerson[] = [
      { ...person({ mode: "caldo", lastOutboundOn: "2026-09-01" }), id: "caldo" },
      { ...person({ mode: "freddo", lastOutboundOn: "2026-07-01" }), id: "freddo" },
    ];
    const queue = buildTodayQueue("2026-10-01", people, []);
    expect(queue.find((i) => i.id === "caldo")).toMatchObject({ section: "caldi", daysLate: 0 });
    expect(queue.find((i) => i.id === "freddo")).toMatchObject({ section: "freddi", daysLate: 2 });
  });

  it("persona Caldo referente di un deal In progress riceve solo le bozze del preventivo", () => {
    const p: QueuePerson = {
      ...person({ mode: "caldo", lastOutboundOn: "2026-08-01", isReferentOfOpenQuote: true }),
      id: "p1",
    };
    expect(personFollowup(p).state).toBe("sospeso_preventivo");
    const queue = buildTodayQueue("2026-10-05", [p], [{ ...quote(), id: "deal", personId: "p1", createdOn: "2026-09-20" }]);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ kind: "opportunita", section: "preventivi", step: 1 });
  });

  it("modalità Nessuno o persona archiviata: nessun follow-up", () => {
    expect(personFollowup(person({ mode: "nessuno", lastOutboundOn: "2026-01-01" })).nextOn).toBeNull();
    expect(personFollowup(person({ status: "archiviato", lastOutboundOn: "2026-01-01" })).nextOn).toBeNull();
  });
});

describe("Rimanda a", () => {
  it("con Rimanda a 15 gennaio non c'è nessun follow-up prima del 15 gennaio", () => {
    const p: QueuePerson = {
      ...person({ mode: "caldo", lastOutboundOn: "2026-09-01", snoozeUntil: "2027-01-15" }),
      id: "p1",
    };
    expect(personFollowup(p).nextOn).toBe("2027-01-15");
    expect(buildTodayQueue("2027-01-14", [p], [])).toHaveLength(0);
    expect(buildTodayQueue("2027-01-15", [p], [])).toHaveLength(1);
  });

  it("vince anche sulla sequenza del preventivo", () => {
    const f = opportunityFollowup(quote({ snoozeUntil: "2027-01-15" }));
    expect(f.nextOn).toBe("2027-01-15");
  });
});

describe("l'utente invia la bozza", () => {
  it("sulla persona la data successiva riparte dall'ultima email", () => {
    const before = person({ mode: "caldo", lastOutboundOn: "2026-09-01" });
    const after = personFollowup({ ...before, lastOutboundOn: "2026-10-01" });
    expect(after.nextOn).toBe("2026-10-31");
  });

  it("sull'opportunità il passo sale di uno e si calcola la data successiva", () => {
    const o = applyOutboundEmail(quote(), "2026-10-04");
    expect(o).toMatchObject({ step: 1, lastFollowupOn: "2026-10-04" });
    expect(opportunityFollowup(o).nextOn).toBe("2026-10-08");
  });
});

describe("lead fermi", () => {
  it("un'opportunità in Lead da più di 7 giorni senza preventivo diventa un promemoria senza bozza", () => {
    const lead: QueueOpportunity = {
      ...quote({ stage: "lead", quoteSentOn: null }),
      id: "lead",
      personId: null,
      createdOn: "2026-10-01",
    };
    expect(buildTodayQueue("2026-10-08", [], [lead])).toHaveLength(0);
    const queue = buildTodayQueue("2026-10-10", [], [lead]);
    expect(queue[0]).toMatchObject({ section: "lead_fermi", daysLate: 2 });
    expect(pickDrafts(queue)).toHaveLength(0);
  });
});

describe("bozze e digest", () => {
  it("massimo 15 bozze al giorno, prima le più in ritardo", () => {
    const people: QueuePerson[] = Array.from({ length: 20 }, (_, i) => ({
      ...person({ mode: "caldo", lastOutboundOn: addDays("2026-08-01", i) }),
      id: `p${i}`,
    }));
    const drafts = pickDrafts(buildTodayQueue("2026-10-31", people, []));
    expect(drafts).toHaveLength(15);
    expect(drafts[0].id).toBe("p0");
  });

  it("se non c'è nessuna voce in coda il digest non parte", () => {
    expect(shouldSendDigest([], 0)).toBe(false);
    expect(shouldSendDigest([], 2)).toBe(true);
  });
});

describe("date a Roma", () => {
  it("un'email delle 23:30 UTC del 31 ottobre è del 1 novembre a Roma", () => {
    expect(toRomeDate(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
  });
});
