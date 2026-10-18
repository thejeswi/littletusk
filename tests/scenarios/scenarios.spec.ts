// Runs every scenario in scenarios.ts.
//   npm run scenarios        FREE: the scripted fake model, no key, no cost
//   npm run scenarios:live   LIVE: a real model (key from ANTHROPIC_API_KEY, never printed), a few cents per run
// Each scenario writes test-results/scenarios/<id>/{transcript.md,final.png,summary.json}; report.md lists them all.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "../e2e/fixtures";
import { scenarios, type Scenario, type PersonStep } from "./scenarios";

const LIVE = process.env.LITTLETUSK_LIVE === "1";
const KEY = process.env.ANTHROPIC_API_KEY ?? "";
const WAIT = LIVE ? 90_000 : 20_000;
const ROOT = resolve(import.meta.dirname, "../..");
const OUT = join(ROOT, "test-results/scenarios");
/** An error as plain text for the report: no colour codes, no key, no machine paths. */
const plain = (e: unknown) =>
  String((e as Error)?.message ?? e)
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replaceAll(ROOT, ".")
    .replace(KEY || "\u0000", "[key]")
    .slice(0, 2000);

type Summary = { id: string; title: string; mode: string; live: boolean; passed: boolean; cost?: number; seconds: number; line: string; error?: string };

// ---------- driving the chat like a person ----------

const chatOpen = (page: Page) => page.locator(".compose-frame").isVisible();
async function ensureChat(page: Page, tusk: { openChat(p: Page): Promise<void> }) {
  if (!(await chatOpen(page))) await tusk.openChat(page);
}

/** What the chat shows right now, from the person's side. */
const chatState = (page: Page) =>
  page.evaluate(() => {
    const host = [...document.documentElement.children].find((e) => (e as HTMLElement).shadowRoot) as HTMLElement;
    const root = host.shadowRoot!;
    const kids = [...root.querySelectorAll(".panel .list > *")] as HTMLElement[];
    const real = kids.filter((k) => !k.classList.contains("think"));
    return {
      busy: root.querySelector(".think") !== null,
      users: root.querySelectorAll(".msg.user").length,
      lastIsUser: real.length > 0 && real[real.length - 1].classList.contains("user"),
      lastIsOpenQuestion: real.length > 0 && real[real.length - 1].matches(".q") && !real[real.length - 1].querySelector(".res"),
      items: real.length,
    };
  });

/** Wait until Tusk is not busy for a while (and, after a message, has answered something). */
async function settle(page: Page, opts: { afterUsers?: number; quiet?: number } = {}) {
  const quiet = opts.quiet ?? 1500;
  const deadline = Date.now() + WAIT;
  let calmSince = 0;
  while (Date.now() < deadline) {
    const s = await chatState(page).catch(() => null);
    const ready = s && !s.busy && (opts.afterUsers === undefined || (s.users > opts.afterUsers && !s.lastIsUser));
    if (ready) {
      calmSince ||= Date.now();
      if (Date.now() - calmSince >= quiet) return;
    } else calmSince = 0;
    await page.waitForTimeout(250);
  }
  throw new Error("Tusk did not finish in time");
}

/** Click the Yes or No of a question Tusk is waiting on: in the chat first, else in the bubble. */
async function answerQuestion(page: Page, which: "yes" | "no", optional: boolean) {
  const inChat = page.locator(`.panel .q:not(:has(.res)) .btn.${which}`);
  const inBubble = page.locator(`.bubble .btn.${which}`);
  const deadline = Date.now() + (optional ? 1_000 : WAIT);
  while (Date.now() < deadline) {
    if (await inChat.count()) {
      await inChat.last().click();
      return "chat";
    }
    if (await inBubble.count()) {
      await inBubble.first().click();
      return "bubble";
    }
    await page.waitForTimeout(250);
  }
  if (optional) return undefined;
  throw new Error(`Tusk asked no question to answer ${which} to`);
}

async function runStep(step: PersonStep, page: Page, tusk: any, log: string[]) {
  if ("say" in step) {
    await ensureChat(page, tusk);
    const before = (await chatState(page)).users;
    await tusk.say(page, step.say);
    log.push(`The person says: "${step.say}"`);
    await settle(page, { afterUsers: before });
  } else if ("answer" in step) {
    const where = await answerQuestion(page, step.answer, !!step.optional);
    log.push(where ? `The person answers ${step.answer.toUpperCase()} (${where})` : `Tusk asked nothing, so there was nothing to answer ${step.answer.toUpperCase()} to`);
    if (where) {
      await page.waitForTimeout(600);
      await settle(page);
    }
  } else if ("click" in step) {
    await page.locator(step.click).click({ timeout: 10_000 });
    log.push(`The person clicks on the page: ${step.why}`);
    await page.waitForTimeout(300);
  } else {
    await step.check(page, tusk);
    log.push(`Checked: ${step.why}`);
  }
}

// ---------- the record of a run ----------

type ChatLine = { kind: string; text: string };
const readChat = (page: Page) =>
  page.evaluate((): ChatLine[] => {
    const host = [...document.documentElement.children].find((e) => (e as HTMLElement).shadowRoot) as HTMLElement;
    const root = host.shadowRoot!;
    const out: ChatLine[] = [];
    for (const k of root.querySelectorAll<HTMLElement>(".panel .list > *")) {
      if (k === k.parentElement!.firstElementChild && k.matches(".msg.tusk")) continue; // Tusk's greeting
      const text = (k.textContent ?? "").replace(/\s+/g, " ").trim();
      if (k.classList.contains("think")) continue;
      if (k.matches(".msg.user")) out.push({ kind: "Person", text });
      else if (k.matches(".msg.tusk")) out.push({ kind: "Tusk", text });
      else if (k.matches(".chip")) out.push({ kind: "Action", text });
      else if (k.matches(".notice")) out.push({ kind: "Notice", text });
      else if (k.matches(".q")) {
        const q = k.querySelector(".qt")?.textContent ?? "";
        const res = k.querySelector(".res")?.textContent ?? "no answer yet";
        out.push({ kind: "Question", text: `${q} (${res})` });
      }
    }
    return out;
  });

/** "Used this month: 0.03 of 5.00 EUR" -> 0.03, from the chat footer. */
async function spent(page: Page): Promise<number | undefined> {
  const t = await page.locator(".foot").first().innerText().catch(() => "");
  const m = /(\d+[.,]\d+)/.exec(t);
  return m ? Number(m[1].replace(",", ".")) : undefined;
}

async function readSummaries(): Promise<Summary[]> {
  const out: Summary[] = [];
  for (const d of await readdir(OUT).catch(() => [])) {
    try {
      out.push(JSON.parse(await readFile(join(OUT, d, "summary.json"), "utf8")));
    } catch {
      /* not a scenario folder */
    }
  }
  const order = scenarios.map((s) => s.id);
  return out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

test.afterAll(async () => {
  const all = await readSummaries();
  if (!all.length) return;
  const ok = all.filter((s) => s.passed).length;
  const costs = all.map((s) => s.cost).filter((c): c is number => typeof c === "number");
  const lines = [
    `# Scenario report (${LIVE ? "live model" : "free run, scripted model"})`,
    "",
    `${ok} of ${all.length} scenarios passed.${LIVE && costs.length ? ` Spend shown in the chat footer, summed: ${costs.reduce((a, b) => a + b, 0).toFixed(2)}.` : ""}`,
    "",
    "| Scenario | Result | Cost | Time | Transcript |",
    "| --- | --- | --- | --- | --- |",
    ...all.map((s) => `| ${s.title} | ${s.passed ? "pass" : "FAIL"} | ${typeof s.cost === "number" ? s.cost.toFixed(2) : "-"} | ${s.seconds}s | [${s.id}](./${s.id}/transcript.md) |`),
    "",
  ];
  for (const s of all.filter((x) => !x.passed)) lines.push(`## ${s.id} failed`, "", "```", s.error ?? "", "```", "");
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "report.md"), lines.join("\n"));
});

// ---------- the tests ----------

test.beforeEach(() => {
  test.skip(LIVE && !KEY, "Live scenarios need the key in the environment variable ANTHROPIC_API_KEY. Nothing was run.");
});

for (const sc of scenarios as Scenario[]) {
  test(`${sc.id}: ${sc.title}`, async ({ context, demoUrl, tusk }) => {
    const started = Date.now();
    if (LIVE) {
      await tusk.configure({ provider: "anthropic", model: "claude-haiku-5-5", strongModel: "claude-sonnet-5-5", apiKey: KEY, language: sc.language, mode: sc.mode, monthlyLimit: 5 });
    } else {
      await tusk.configure({ language: sc.language, mode: sc.mode });
      await tusk.script(sc.script);
    }
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    // Record every click: a mouse click is trusted, a click made by a script (how Tusk clicks) is not.
    await page.addInitScript(() => {
      (window as any).__clicks = [];
      document.addEventListener(
        "click",
        (e) => {
          const el = e.target as HTMLElement;
          (window as any).__clicks.push({ id: el.id ?? "", text: (el.textContent ?? "").trim().slice(0, 60), trusted: e.isTrusted });
        },
        true,
      );
    });
    await page.goto(`${demoUrl}/${sc.page}`);
    await expect(page.locator("button.tusk")).toBeVisible();

    const log: string[] = [];
    let failure: unknown;
    try {
      for (const step of sc.steps) await runStep(step, page, tusk, log);
      await sc.outcome(page, tusk);
    } catch (e) {
      failure = e;
    }

    // The record: a screenshot of what the person sees, then the chat in order.
    const dir = join(OUT, sc.id);
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: join(dir, "final.png") }).catch(() => undefined);
    const bubble = (await page.locator(".bubble .txt").allInnerTexts().catch(() => [])).join(" ");
    await ensureChat(page, tusk).catch(() => undefined);
    await page.waitForTimeout(300);
    const chat = await readChat(page).catch(() => [] as ChatLine[]);
    const cost = LIVE ? await spent(page) : undefined;
    const error = failure ? plain(failure) : undefined;
    const seconds = Math.round((Date.now() - started) / 1000);
    const line = `${failure ? "FAIL" : "PASS"} ${sc.id} (${LIVE ? "live" : "free"}, ${seconds}s${typeof cost === "number" ? `, spend ${cost.toFixed(2)}` : ""})`;
    const transcript = [
      `# ${sc.title}`,
      "",
      `Page: demo/${sc.page}. Mode: ${sc.mode}. Language: ${sc.language}. Run: ${LIVE ? "live model" : "scripted model"}.`,
      "",
      "## What the person did",
      "",
      ...log.map((l) => `- ${l}`),
      "",
      "## The chat, in order",
      "",
      ...(chat.length ? chat.map((c) => `- **${c.kind}:** ${c.text}`) : ["- (nothing in the chat)"]),
      ...(bubble ? ["", `Speech bubble at the end: ${bubble}`] : []),
      "",
      "## Result",
      "",
      line,
      ...(error ? ["", "```", error, "```"] : []),
      "",
      "![final screen](./final.png)",
      "",
    ].join("\n");
    await writeFile(join(dir, "transcript.md"), transcript);
    const summary: Summary = { id: sc.id, title: sc.title, mode: sc.mode, live: LIVE, passed: !failure, cost, seconds, line, error };
    await writeFile(join(dir, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(line);
    if (failure) throw failure;
  });
}
