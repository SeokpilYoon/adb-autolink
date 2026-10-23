import { describe, expect, it } from "vitest";
import { CATALOGS, LOCALES, type MessageKey, currentLocale, detectLocale, format, normalizeLocale, t, withLang } from "../src/i18n.js";

const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]))].sort();
const enKeys = Object.keys(CATALOGS.en).sort();

describe("i18n catalogs", () => {
  it.each(LOCALES)("%s has exactly the en keys", (loc) => {
    expect(Object.keys(CATALOGS[loc]).sort()).toEqual(enKeys);
  });

  it.each(LOCALES)("%s has the same placeholders as en and no empty strings", (loc) => {
    for (const k of enKeys as MessageKey[]) {
      const msg = CATALOGS[loc][k];
      expect(msg.trim().length, `${loc}:${k}`).toBeGreaterThan(0);
      expect(placeholders(msg), `${loc}:${k}`).toEqual(placeholders(CATALOGS.en[k]));
    }
  });

  it("uses the localized Android setting names", () => {
    expect(CATALOGS.ko["hint.troubleshoot"]).toContain("개발자 옵션 > 무선 디버깅");
    expect(CATALOGS.ja["hint.troubleshoot"]).toContain("開発者向けオプション > ワイヤレス デバッグ");
    expect(CATALOGS["zh-Hans"]["hint.troubleshoot"]).toContain("开发者选项 > 无线调试");
    expect(CATALOGS.es["hint.troubleshoot"]).toContain("Opciones para desarrolladores > Depuración inalámbrica");
    expect(CATALOGS.fr["hint.troubleshoot"]).toContain("Options pour les développeurs > Débogage sans fil");
  });
});

describe("locale detection", () => {
  it("normalizes BCP 47 and POSIX tags", () => {
    expect(normalizeLocale("ko-KR")).toBe("ko");
    expect(normalizeLocale("ja_JP.UTF-8")).toBe("ja");
    expect(normalizeLocale("zh-CN")).toBe("zh-Hans");
    expect(normalizeLocale("zh_TW")).toBe("zh-Hans");
    expect(normalizeLocale("es-419")).toBe("es");
    expect(normalizeLocale("fr_CA@euro")).toBe("fr");
    expect(normalizeLocale("de-DE")).toBe("en");
    expect(normalizeLocale("C")).toBeUndefined();
    expect(normalizeLocale("C.UTF-8")).toBeUndefined();
    expect(normalizeLocale("")).toBeUndefined();
  });

  it("prefers ADB_AUTOLINK_LANG, then LC_ALL, LC_MESSAGES, LANG, then the OS locale", () => {
    const os = () => "fr-FR";
    expect(detectLocale({ ADB_AUTOLINK_LANG: "ja", LC_ALL: "ko_KR.UTF-8", LANG: "es_ES" }, os)).toBe("ja");
    expect(detectLocale({ LC_ALL: "ko_KR.UTF-8", LANG: "es_ES" }, os)).toBe("ko");
    expect(detectLocale({ LC_MESSAGES: "zh_CN.UTF-8", LANG: "es_ES" }, os)).toBe("zh-Hans");
    expect(detectLocale({ LANG: "es_ES.UTF-8" }, os)).toBe("es");
    expect(detectLocale({ LANG: "C" }, os)).toBe("fr");
    expect(detectLocale({}, () => "pt-BR")).toBe("en");
    expect(detectLocale({}, () => {
      throw new Error("no Intl");
    })).toBe("en");
  });

  it("withLang overrides the locale for async work and restores it", async () => {
    expect(currentLocale()).toBe("en"); // vitest.config.ts pins ADB_AUTOLINK_LANG=en
    const msg = await withLang("ko-KR", async () => {
      await new Promise((r) => setTimeout(r, 1));
      return t("connected", "S21");
    });
    expect(msg).toBe("연결됨: S21");
    expect(withLang("xx-unknown", () => t("connected", "x"))).toBe("Connected: x");
    expect(withLang(undefined, () => currentLocale())).toBe("en");
  });

  it("formats positional placeholders", () => {
    expect(format("{1}-{0}-{2}", ["a", 2])).toBe("2-a-{2}");
  });
});

describe("guide links", () => {
  it("points each locale at an existing guide page", async () => {
    const { existsSync } = await import("node:fs");
    const { guideUrl } = await import("../src/i18n.js");
    for (const loc of LOCALES) {
      const url = guideUrl(loc);
      const rel = url.split("/blob/main/")[1];
      expect(existsSync(new URL(`../../${rel}`, import.meta.url)), `${loc}: ${rel}`).toBe(true);
    }
    expect(guideUrl("en")).toMatch(/wireless-debugging\.md$/);
    expect(guideUrl("ko")).toMatch(/wireless-debugging\.ko\.md$/);
  });
});
