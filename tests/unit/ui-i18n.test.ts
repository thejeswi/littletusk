import { describe, expect, it } from "vitest";
import { TABLES, t } from "../../src/shared/i18n";

describe("i18n", () => {
  const keys = Object.keys(TABLES.en);
  for (const lang of ["de", "es", "en-IN"] as const) {
    it(`${lang} has every key, non-empty`, () => {
      expect(Object.keys(TABLES[lang]).sort()).toEqual([...keys].sort());
      for (const k of keys) expect((TABLES[lang] as Record<string, string>)[k].length).toBeGreaterThan(0);
    });
    it(`${lang} keeps placeholders`, () => {
      for (const k of keys) {
        const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
        expect(ph((TABLES[lang] as Record<string, string>)[k])).toBe(ph((TABLES.en as Record<string, string>)[k]));
      }
    });
  }
  it("fills variables", () => {
    expect(t("en", "actPointed", { name: "the button" })).toBe("Pointed at the button");
  });
});
