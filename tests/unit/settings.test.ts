import { describe, expect, it } from "vitest";
import { decodeSetupConfig, encodeSetupConfig, publicSettings, type SetupConfig } from "../../src/shared/settings";
import { DEFAULT_SETTINGS } from "../../src/shared/protocol";
import { PROVIDERS, modelsFor } from "../../src/shared/providers";

const cfg: SetupConfig = { v: 1, provider: "anthropic", apiKey: "sk-ant-abcdef1234", language: "de", mode: "look-after", monthlyLimit: 10, currency: "EUR", name: "Ayşe" };
const enc = (o: unknown) => "#lt=" + Buffer.from(JSON.stringify(o)).toString("base64url");

describe("setup link", () => {
  it("round trips, including non-ASCII names", () => {
    const f = encodeSetupConfig(cfg);
    expect(f.startsWith("#lt=")).toBe(true);
    expect(decodeSetupConfig(f)).toEqual(cfg);
  });
  it("keeps optional models", () => {
    expect(decodeSetupConfig(encodeSetupConfig({ ...cfg, model: "a", strongModel: "b" }))).toMatchObject({ model: "a", strongModel: "b" });
  });
  it("rejects garbage", () => {
    for (const g of ["", "#lt=", "#lt=!!!", "#lt=bm90IGpzb24", "#lt=" + "A".repeat(5000), enc([]), enc(null), enc("x")]) expect(decodeSetupConfig(g)).toBeNull();
  });
  it("rejects bad fields", () => {
    expect(decodeSetupConfig(enc({ ...cfg, language: "fr" }))).toBeNull();
    expect(decodeSetupConfig(enc({ ...cfg, mode: "x" }))).toBeNull();
    expect(decodeSetupConfig(enc({ ...cfg, monthlyLimit: 1001 }))).toBeNull();
    expect(decodeSetupConfig(enc({ ...cfg, monthlyLimit: -1 }))).toBeNull();
    expect(decodeSetupConfig(enc({ ...cfg, monthlyLimit: "5" }))).toBeNull();
    expect(decodeSetupConfig(enc({ ...cfg, apiKey: "short" }))).toBeNull();
    expect(decodeSetupConfig(enc({ ...cfg, apiKey: "k".repeat(401) }))).toBeNull();
    expect(decodeSetupConfig(enc({ ...cfg, v: 2 }))).toBeNull();
    expect(decodeSetupConfig(enc({ ...cfg, currency: "GBP" }))).toBeNull();
  });
});

describe("settings", () => {
  it("publicSettings strips the key", () => {
    const p = publicSettings({ ...DEFAULT_SETTINGS, apiKey: "secret-key-123" });
    expect("apiKey" in p).toBe(false);
    expect(JSON.stringify(p)).not.toContain("secret-key-123");
  });
});

describe("providers", () => {
  it("default models exist in the catalog", () => {
    for (const p of PROVIDERS) {
      const ids = modelsFor(p.id).map((m) => m.id);
      expect(ids, p.id).toContain(p.model);
      expect(ids, p.id).toContain(p.strongModel);
    }
  });
});
