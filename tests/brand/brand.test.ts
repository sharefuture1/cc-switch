import { describe, expect, it } from "vitest";
import {
  BRAND,
  PURE_EDITION,
  isBrandAppEnabled,
  isBrandPageHidden,
  isWendingEndpoint,
  maskApiKey,
} from "@/brand/brand";
import {
  wendingClaudePresets,
  wendingCodexPresets,
  wendingGeminiPresets,
} from "@/brand/presets";
import { brandTranslations } from "@/brand/i18n";

describe("brand config", () => {
  it("uses WendingAI identity only", () => {
    expect(BRAND.productName).toBe("WendingAI Switch");
    expect(BRAND.defaultEndpoint).toBe("https://api.wending.ai");
    expect(BRAND.deeplinkScheme).toBe("wendingai");
    expect(BRAND.dataDirName).toBe(".wendingai");
    expect(BRAND.updatesEnabled).toBe(false);
    expect(JSON.stringify(BRAND)).not.toMatch(/有限公司|Co\.,? Ltd/i);
  });

  it("keeps upstream attribution", () => {
    expect(BRAND.upstream.author).toBe("Jason Young");
    expect(BRAND.upstream.license).toBe("MIT License");
  });

  it("enables only Claude Code, Codex and Gemini CLI in the pure edition", () => {
    expect([...BRAND.enabledApps]).toEqual(["claude", "codex", "gemini"]);
    expect([...BRAND.hiddenPages]).toContain("auth");
    // 单元测试跑在上游模式（__WENDING_PURE__ = false）：开关全部放行，上游用例不受影响
    expect(PURE_EDITION).toBe(false);
    expect(isBrandAppEnabled("opencode")).toBe(true);
    expect(isBrandPageHidden("auth")).toBe(false);
  });

  it("recognises WendingAI endpoints", () => {
    expect(isWendingEndpoint("https://api.wending.ai")).toBe(true);
    expect(isWendingEndpoint("https://api.wending.ai/v1/")).toBe(true);
    expect(isWendingEndpoint(" https://x.wending.ai ")).toBe(true);
    expect(isWendingEndpoint("https://wending.ai.evil.com")).toBe(false);
    expect(isWendingEndpoint("https://evilwending.ai")).toBe(false);
    expect(isWendingEndpoint("not a url")).toBe(false);
    expect(isWendingEndpoint(undefined)).toBe(false);
  });

  it("masks api keys without leaking them", () => {
    expect(maskApiKey("")).toBe("");
    expect(maskApiKey("short")).toBe("****");
    const fake = "sk-" + "x".repeat(40) + "WXYZ";
    const masked = maskApiKey(fake);
    expect(masked).toBe("sk-****WXYZ");
    expect(masked).not.toContain("xxxx");
  });
});

describe("brand presets", () => {
  it("each CLI ships exactly one WendingAI preset", () => {
    for (const list of [
      wendingClaudePresets,
      wendingCodexPresets,
      wendingGeminiPresets,
    ]) {
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe("WendingAI");
      expect(JSON.stringify(list[0])).toContain("https://api.wending.ai");
      expect(JSON.stringify(list[0])).not.toMatch(/aff=|isPartner":true/);
    }
  });
});

describe("brand translations", () => {
  it("zh and en provide the same keys", () => {
    const keys = (o: unknown, p = ""): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`],
      );
    expect(keys(brandTranslations.zh).sort()).toEqual(
      keys(brandTranslations.en).sort(),
    );
    expect(JSON.stringify(brandTranslations)).not.toMatch(/CC Switch/);
  });
});
