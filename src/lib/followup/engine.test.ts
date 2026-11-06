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
  it("un promemoria ogni 5 giorni dall'ultimo contatto, poi chiede Persa o Rimanda", () => {
    let o = quote();
    const dates: string[] = [];
    for (let i = 0; i < 6; i++) {
      const f = opportunityFollowup(o);
      expect(f.state).toBe("in_sequenza");
      expect(f.nextStep).toBe(i + 1);
      dates.push(f.nextOn!);
      // L'utente scrive al cliente il giorno stesso
      o = applyOutboundEmail(o, f.nextOn!);
    }
    expect(dates).toEqual(["2026-10-06", "2026-10-11", "2026-10-16", "2026-10-21", "2026-10-26", "2026-10-31"]);
    expect(o.step).toBe(6);
    expect(opportunityFollowup(o).state).toBe("chiedi_esito");
  });

  it("dopo l'ultimo promemoria la voce resta in coda per chiedere l'esito, senza bozza", () => {
    const o: QueueOpportunity = {
      ...quote({ step: 6, lastFollowupOn: "2026-10-31", lastOutboundOn: "2026-10-31" }),
      id: "deal",
      personId: "p1",
      createdOn: "2026-09-20",
    };
    const queue = buildTodayQueue("2026-11-02", [], [o]);
    expect(queue).toHaveLength(1);
    expect(queue[0].askOutcome).toBe(true);
    expect(pickDrafts(queue)).toHaveLength(0);
  });

  it("un promemoria fatto in ritardo sposta il successivo a 5 giorni da quel giorno", () => {
    const f = opportunityFollowup(quote({ step: 1, lastFollowupOn: "2026-10-09", lastOutboundOn: "2026-10-09" }));
    expect(f.nextOn).toBe("2026-10-14");
  });

  it("una nostra email al cliente fa ripartire il conto", () => {
    expect(opportunityFollowup(quote({ lastOutboundOn: "2026-10-04" })).nextOn).toBe("2026-10-09");
  });
});

describe("il cliente risponde dopo il secondo promemoria", () => {
  const afterStep2 = quote({ step: 2, lastFollowupOn: "2026-10-11", lastOutboundOn: "2026-10-11" });

  it("la voce esce dai promemoria ed entra subito in Ti hanno scritto", () => {
    const replied = { ...afterStep2, lastInboundOn: "2026-10-12" };
    expect(opportunityFollowup(replied).state).toBe("attesa_risposta");

    const queue = buildTodayQueue(
      "2026-10-15",
      [],
      [{ ...replied, id: "deal", personId: "p1", createdOn: "2026-09-25" }],
    );
    expect(queue.map((i) => i.section)).toEqual(["ti_hanno_scritto"]);
  });

  it("rimandata, sparisce fino alla data e poi torna", () => {
    const replied = { ...afterStep2, lastInboundOn: "2026-10-12", snoozeUntil: "2026-10-20" };
    const deal = { ...replied, id: "deal", personId: "p1", createdOn: "2026-09-25" };
    expect(buildTodayQueue("2026-10-15", [], [deal])).toHaveLength(0);
    expect(buildTodayQueue("2026-10-20", [], [deal])).toHaveLength(1);
  });

  it("quando rispondiamo, il promemoria successivo è 5 giorni dopo la nostra risposta", () => {
    let o: OpportunityFollowupInput = { ...afterStep2, lastInboundOn: "2026-10-12" };
    o = applyOutboundEmail(o, "2026-10-13");
    expect(o.step).toBe(2);
    expect(opportunityFollowup(o)).toEqual({ state: "in_sequenza", nextOn: "2026-10-18", nextStep: 3 });
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
    const queue = buildTodayQueue("2026-10-06", [p], [{ ...quote(), id: "deal", personId: "p1", createdOn: "2026-09-20" }]);
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

  it("vince anche sui promemoria del preventivo", () => {
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

  it("sull'opportunità il promemoria sale di uno e il prossimo è 5 giorni dopo", () => {
    const o = applyOutboundEmail(quote(), "2026-10-06");
    expect(o).toMatchObject({ step: 1, lastFollowupOn: "2026-10-06" });
    expect(opportunityFollowup(o).nextOn).toBe("2026-10-11");
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
