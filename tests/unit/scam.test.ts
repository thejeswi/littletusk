// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { detectScams, looksLikeScam } from "../../src/content/page/scam";

const ids = new Map<Element, string>();
const idFor = (el: Element) => { if (!ids.has(el)) ids.set(el, "e" + (ids.size + 1)); return ids.get(el)!; };
const detect = (html: string) => { document.body.innerHTML = html; ids.clear(); return detectScams(document, idFor, () => true); };

describe("scam detector", () => {
  it("flags the gift-card pressure email and marks the sentence that carries it", () => {
    const w = detect(`<article><h1>Ihr Konto wird gesperrt!</h1>
      <p class="warn">Dringend: Ihr Konto wird heute um 18:00 Uhr gesperrt!</p>
      <p id="demand">Kaufen Sie noch heute <b>Geschenkkarten im Wert von 500 €</b> und senden Sie uns die Codes per Antwort.</p>
      <p>Sprechen Sie mit niemandem darüber.</p>
      <a href="#">Jetzt Geschenkkarten kaufen</a><button>Als Spam melden</button></article>`);
    expect(w.length).toBe(1);
    expect(w[0].kind).toBe("scam");
    expect(document.querySelector("#demand") === [...ids.keys()].find((k) => ids.get(k) === w[0].id)).toBe(true);
    expect(w[0].summary).toContain("Geschenkkarten");
  });
  it("flags English and Spanish pressure too", () => {
    expect(looksLikeScam("Your account will be suspended today. Buy gift cards and send us the codes. Don't tell anyone.")).toBe(true);
    expect(looksLikeScam("Su cuenta será bloqueada hoy. Compre tarjetas de regalo y envíenos los códigos. No se lo diga a nadie.")).toBe(true);
    expect(looksLikeScam("Call us now and install AnyDesk so we can fix this immediately.")).toBe(true);
  });
  it("leaves ordinary pages alone", () => {
    expect(detect(`<p>Geschenkkarten kaufen: ab 10 € in unserem Shop, per Post oder als Download.</p>`)).toEqual([]);
    expect(detect(`<p>Ihr Konto wurde erfolgreich erstellt. Willkommen bei Beispiel-Mail, wir freuen uns auf Sie.</p>`)).toEqual([]);
    expect(detect(`<p>Dringend gesucht: Gartenhelfer für den Herbst. Melden Sie sich noch heute bei uns, wir zahlen fair.</p>`)).toEqual([]);
    expect(detect(`<p>Please do not share your password with anyone. Our staff will never ask for it, this keeps your account safe.</p>`)).toEqual([]);
  });
  it("ignores hidden text", () => {
    document.body.innerHTML = `<p>Dringend: Konto gesperrt! Kaufen Sie Geschenkkarten und senden Sie die Codes. Mit niemandem sprechen.</p>`;
    expect(detectScams(document, idFor, () => false)).toEqual([]);
  });
});
