import { describe, expect, it } from "vitest";
import { decodeEntities, isAutomated, isExcluded, isFreeMail, parseAddressList, splitName } from "./email";

describe("intestazioni degli indirizzi", () => {
  it("legge nomi, virgolette e indirizzi semplici", () => {
    expect(parseAddressList('Mario Rossi <Mario@Acme.com>, "Rossi, Anna" <anna@acme.com>, luca@acme.com')).toEqual([
      { name: "Mario Rossi", email: "mario@acme.com" },
      { name: "Rossi, Anna", email: "anna@acme.com" },
      { name: null, email: "luca@acme.com" },
    ]);
  });
  it("ignora quello che non è un indirizzo", () => {
    expect(parseAddressList("undisclosed-recipients:;")).toEqual([]);
    expect(parseAddressList(null)).toEqual([]);
  });
});

describe("chi è un contatto", () => {
  it("riconosce i mittenti automatici", () => {
    expect(isAutomated("no-reply@stripe.com")).toBe(true);
    expect(isAutomated("noreply+abc@github.com")).toBe(true);
    expect(isAutomated("mario@acme.com", { listUnsubscribe: "<mailto:x@y>" })).toBe(true);
    expect(isAutomated("mario@acme.com", { precedence: "bulk" })).toBe(true);
    expect(isAutomated("mario@acme.com")).toBe(false);
  });
  it("esclude domini interni, indirizzi e domini nella lista", () => {
    const internal = ["somaspaceagency.com"];
    expect(isExcluded("michele@somaspaceagency.com", internal, [])).toBe(true);
    expect(isExcluded("fatture@fornitore.it", internal, ["fatture@fornitore.it"])).toBe(true);
    expect(isExcluded("chiunque@spam.io", internal, ["spam.io"])).toBe(true);
    expect(isExcluded("chiunque@spam.io", internal, ["@spam.io"])).toBe(true);
    expect(isExcluded("mario@acme.com", internal, ["spam.io"])).toBe(false);
  });
  it("la posta personale non dice l'azienda", () => {
    expect(isFreeMail("mario.rossi@gmail.com")).toBe(true);
    expect(isFreeMail("mario@acme.com")).toBe(false);
  });
});

describe("nomi", () => {
  it("dal nome visualizzato o dall'indirizzo", () => {
    expect(splitName({ name: "Mario De Rossi", email: "x@y.com" })).toEqual({ firstName: "Mario", lastName: "De Rossi" });
    expect(splitName({ name: "Rossi, Anna", email: "x@y.com" })).toEqual({ firstName: "Anna", lastName: "Rossi" });
    expect(splitName({ name: null, email: "giulia.ferri@acme.com" })).toEqual({ firstName: "Giulia", lastName: "Ferri" });
  });
  it("decodifica lo snippet", () => {
    expect(decodeEntities("Ciao, ecco l&#39;offerta &amp; il deck")).toBe("Ciao, ecco l'offerta & il deck");
  });
});
