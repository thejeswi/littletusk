import { test, expect } from "./fixtures";

// Fake keys, assembled at runtime so secret scanners do not mistake them for real ones.
const claudeKey = "sk-" + "ant-" + "fake-claude-key-for-tests-0001";
const deepseekKey = "sk-" + "0123456789abcdef".repeat(2);

test("each provider keeps its own key; switching provider shows and uses that provider's key", async ({ context, extensionId, tusk }) => {
  await tusk.configure({ provider: "anthropic", apiKey: claudeKey });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pages/setup.html`);
  const key = page.locator("#key");
  const provider = page.locator("#provider");
  await expect(key).toHaveValue(claudeKey);

  // Pick DeepSeek: the box is empty (no DeepSeek key yet). Paste one and save.
  await provider.selectOption("deepseek");
  await expect(key).toHaveValue("");
  await key.fill(deepseekKey);
  await page.locator("#save").click();
  await expect(page.locator("#saveMsg")).toContainText("Saved");

  // Back to Claude: the Claude key is still there. DeepSeek's is kept too.
  await provider.selectOption("anthropic");
  await expect(key).toHaveValue(claudeKey);
  await provider.selectOption("deepseek");
  await expect(key).toHaveValue(deepseekKey);

  // The provider in use decides which key Tusk gets.
  const active = async () => page.evaluate(async () => { const s = (await chrome.storage.local.get("settings")).settings as { provider: string; apiKey: string }; return { provider: s.provider, key: s.apiKey }; });
  expect(await active()).toEqual({ provider: "deepseek", key: deepseekKey });
  await provider.selectOption("anthropic");
  await page.locator("#save").click();
  expect(await active()).toEqual({ provider: "anthropic", key: claudeKey });

  // A reload shows both saved, marked in the list.
  await page.reload();
  await expect(provider.locator("option", { hasText: "DeepSeek" })).toContainText("key saved");
  await expect(provider.locator("option", { hasText: "Anthropic" })).toContainText("key saved");
  await expect(key).toHaveValue(claudeKey);
  await provider.selectOption("deepseek");
  await expect(key).toHaveValue(deepseekKey);
});

test("a key typed for one provider is not lost when switching before saving", async ({ context, extensionId, tusk }) => {
  await tusk.configure({ provider: "anthropic", apiKey: claudeKey });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pages/setup.html`);
  await page.locator("#provider").selectOption("deepseek");
  await page.locator("#key").fill(deepseekKey); // typed, not saved
  await page.locator("#provider").selectOption("anthropic");
  await expect(page.locator("#key")).toHaveValue(claudeKey);
  await page.locator("#provider").selectOption("deepseek");
  await expect(page.locator("#key")).toHaveValue(deepseekKey); // still there
});
