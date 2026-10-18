// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createPageTools, isSecretField, looksIrreversible } from "../../src/content/page";

const demo = (name: string) => readFileSync(resolve(process.cwd(), "demo", name), "utf8");
function load(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  document.documentElement.setAttribute("lang", parsed.documentElement.getAttribute("lang") ?? "");
}
const tools = () => createPageTools(document, window);

describe("snapshot", () => {
  beforeEach(() => load(`<main><h1>Hallo</h1><button>Weiter</button><a href="/x">Mehr</a><input name="q" placeholder="Suche"></main>`));

  it("gives stable short ids stamped on the elements", () => {
    const t = tools();
    const a = t.snapshot();
    const b = t.snapshot();
    expect(a.elements.map((e) => e.id)).toEqual(b.elements.map((e) => e.id));
    expect(a.elements.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(t.element("e2")?.getAttribute("data-tusk-id")).toBe("e2");
    expect(a.elements.find((e) => e.kind === "textbox")?.name).toBe("Suche");
  });

  it("skips Little Tusk's own host", () => {
    document.body.insertAdjacentHTML("beforeend", `<div data-littletusk-host><button>Tusk</button></div>`);
    expect(tools().snapshot().elements.some((e) => e.name === "Tusk")).toBe(false);
  });

  it("never exposes secret values anywhere", () => {
    load(`<form><label for="p">Kennwort</label><input id="p" type="password" value="hunter2-SECRET">
      <input name="user_pin" value="4711SECRET"><input autocomplete="cc-number" value="4111SECRET">
      <input name="iban" value="DE00SECRET"><input name="sms_code" aria-label="SMS Code" value="998877SECRET">
      <input name="city" value="Musterstadt"></form>`);
    const snap = tools().snapshot();
    const json = JSON.stringify(snap);
    expect(json).not.toMatch(/SECRET/);
    const secrets = snap.elements.filter((e) => e.secret);
    expect(secrets).toHaveLength(5);
    expect(secrets.every((e) => e.value === "(filled, hidden)")).toBe(true);
    expect(snap.elements.find((e) => e.name === "city")).toMatchObject({ value: "Musterstadt" });
  });

  it("bounds elements and text", () => {
    load(`<main>${"<p>wort </p>".repeat(2000)}${"<button>b</button>".repeat(300)}</main>`);
    const s = tools().snapshot();
    expect(s.elements.length).toBeLessThanOrEqual(150);
    expect(s.text.length).toBeLessThanOrEqual(3000);
  });
});

describe("safety words", () => {
  it.each([
    "Send", "Submit", "Buy now", "Pay", "Place order", "Checkout", "Confirm", "Delete", "Transfer", "Book",
    "Senden", "Absenden", "Kaufen", "Jetzt kaufen", "Zahlungspflichtig bestellen", "Bestellen", "Bezahlen", "Löschen", "Bestätigen", "Überweisen", "Buchen",
    "Enviar", "Comprar", "Pagar", "Confirmar", "Eliminar", "Borrar", "Reservar",
  ])("%s is irreversible", (w) => expect(looksIrreversible(w)).toBe(true));

  it.each(["Weiter", "Schließen", "Next", "Unsubscribe", "Cerrar", "Nur notwendige", "Bookmark"])("%s is fine", (w) =>
    expect(looksIrreversible(w)).toBe(false),
  );

  it("recognises secret fields", () => {
    const d = (h: string) => (new DOMParser().parseFromString(h, "text/html").body.firstElementChild as Element);
    expect(isSecretField(d(`<input type="password">`))).toBe(true);
    expect(isSecretField(d(`<input name="tan">`))).toBe(true);
    expect(isSecretField(d(`<input autocomplete="one-time-code">`))).toBe(true);
    expect(isSecretField(d(`<input name="vorname">`))).toBe(false);
    expect(isSecretField(d(`<input name="zip-code">`))).toBe(false);
  });
});

describe("run", () => {
  it("click on an irreversible button needs confirmation", async () => {
    load(`<button id="b">Jetzt kaufen</button>`);
    let clicks = 0;
    document.getElementById("b")!.addEventListener("click", () => clicks++);
    const t = tools();
    const id = t.snapshot().elements[0].id;
    const r = await t.run({ op: "click", id }, { confirmed: false });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.error).toMatch(/^NEEDS_CONFIRMATION/);
    expect(clicks).toBe(0);
    const r2 = await t.run({ op: "click", id }, { confirmed: true });
    expect(r2.ok).toBe(true);
    expect(clicks).toBe(1);
  });

  it("clicks harmless things and reports", async () => {
    load(`<main><button id="b">Weiter</button></main>`);
    let clicks = 0;
    document.getElementById("b")!.addEventListener("click", () => clicks++);
    const t = tools();
    const r = await t.run({ op: "click", id: t.snapshot().elements[0].id }, { confirmed: false });
    expect(clicks).toBe(1);
    expect(r.ok && r.text).toMatch(/Clicked \[e1\] "Weiter"/);
  });

  it("refuses to type into a password field and leaves it empty", async () => {
    load(demo("form.html"));
    const t = tools();
    const pw = t.snapshot().elements.find((e) => e.secret)!;
    expect(pw.name).toMatch(/Kundenkennwort/);
    const r = await t.run({ op: "type", id: pw.id, text: "geheim", enter: false }, { confirmed: false });
    expect(r.ok === false && r.error).toMatch(/^SECRET_FIELD/);
    expect((t.element(pw.id) as HTMLInputElement).value).toBe("");
  });

  it("types with input/change events and needs a yes before Enter submits", async () => {
    load(demo("form.html"));
    const t = tools();
    const field = t.snapshot().elements.find((e) => e.name.startsWith("Kundennummer"))!;
    const seen: string[] = [];
    const el = t.element(field.id)!;
    el.addEventListener("input", () => seen.push("input"));
    el.addEventListener("change", () => seen.push("change"));
    const r = await t.run({ op: "type", id: field.id, text: "4711", enter: false }, { confirmed: false });
    expect(r.ok).toBe(true);
    expect((el as HTMLInputElement).value).toBe("4711");
    expect(seen).toEqual(["input", "change"]);
    const r2 = await t.run({ op: "type", id: field.id, text: "4712", enter: true }, { confirmed: false });
    expect(r2.ok === false && r2.error).toMatch(/^NEEDS_CONFIRMATION/);
    expect((el as HTMLInputElement).value).toBe("4711");
  });

  it("flags Absenden as irreversible", () => {
    load(demo("form.html"));
    const send = tools().snapshot().elements.find((e) => e.name === "Absenden");
    expect(send?.irreversible).toBe(true);
  });

  it("refuses downloads and non-web links", async () => {
    load(`<a href="/files/setup.exe">Programm</a><a href="/doc.pdf" download>Datei</a><a href="javascript:alert(1)">JS</a><a href="file:///etc/passwd">Lokal</a><a href="data:text/html,hi">Data</a><a href="/ok">Ok</a>`);
    const t = tools();
    const els = t.snapshot().elements;
    const out: string[] = [];
    for (const e of els) {
      const r = await t.run({ op: "click", id: e.id }, { confirmed: true });
      out.push(r.ok ? "ok" : r.error.split(":")[0]);
    }
    expect(out).toEqual(["DOWNLOAD_BLOCKED", "DOWNLOAD_BLOCKED", "NON_WEB_ADDRESS", "NON_WEB_ADDRESS", "NON_WEB_ADDRESS", "ok"]);
  });

  it("selects an option by text", async () => {
    load(`<select id="s"><option value="a">Eins</option><option value="b">Zwei</option></select>`);
    const t = tools();
    const r = await t.run({ op: "select", id: t.snapshot().elements[0].id, option: "zwei" }, { confirmed: false });
    expect(r.ok).toBe(true);
    expect((document.getElementById("s") as HTMLSelectElement).value).toBe("b");
  });
});

describe("overlays", () => {
  it("finds the newsletter popup in the shop demo and its tiny close button", () => {
    load(demo("shop.html"));
    document.getElementById("nl")!.classList.add("open");
    const t = tools();
    const [o] = t.detectOverlays();
    expect(o.kind).toBe("newsletter");
    const close = t.describe(o.closeId!);
    expect(close).toMatchObject({ kind: "close", name: "✕", inOverlay: true });
    const snap = t.snapshot();
    expect(snap.elements.find((e) => e.name === "Jetzt kaufen")).toMatchObject({ irreversible: true });
    expect(snap.elements.find((e) => e.name === "Jetzt kaufen")?.inOverlay).toBeUndefined();
  });

  it("finds the cookie banner and prefers the privacy-preserving choice", () => {
    load(demo("cookies.html"));
    const t = tools();
    const [o] = t.detectOverlays();
    expect(o.kind).toBe("cookie-banner");
    expect(t.describe(o.closeId!)?.name).toBe("Nur notwendige");
  });

  it("finds nothing on a page without popups", () => {
    load(demo("form.html"));
    expect(tools().detectOverlays()).toEqual([]);
  });

  it("watchOverlays reports each overlay once", async () => {
    load(`<main>Text</main>`);
    const seen: string[] = [];
    const stop = tools().watchOverlays((o) => seen.push(o.kind));
    document.body.insertAdjacentHTML("beforeend", `<div role="dialog" aria-modal="true" style="position:fixed">Bitte Cookies akzeptieren <button>Ablehnen</button></div>`);
    await new Promise((r) => setTimeout(r, 450));
    document.body.insertAdjacentHTML("beforeend", `<p>mehr</p>`);
    await new Promise((r) => setTimeout(r, 450));
    stop();
    expect(seen).toEqual(["cookie-banner"]);
  });
});
