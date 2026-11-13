import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const openExternal = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock("@/lib/api", () => ({
  settingsApi: { openExternal: (url: string) => openExternal(url) },
}));

import {
  DEFAULT_LINE,
  WENDING_LINES,
  filterOfficialProviders,
  getWendingLine,
  lineForEndpoint,
} from "@/brand/brand";
import { appsWithoutModels } from "@/brand/wending";
import {
  WendingAuthError,
  authErrorKey,
  loginWithBrowser,
  probeWendingAuth,
} from "@/brand/auth";
import { brandTranslations } from "@/brand/i18n";

describe("lines", () => {
  it("has the main line first and api14 as a sub2api line", () => {
    expect(DEFAULT_LINE.endpoint).toBe("https://api.wending.ai");
    expect(DEFAULT_LINE.oauth).toBe(true);
    const api14 = getWendingLine("api14");
    expect(api14.endpoint).toBe("https://api14.wending.ai");
    expect(api14.gateway).toBe("sub2api");
    expect(api14.oauth).toBe(false);
    expect(api14.sharesMainAccount).toBe(false);
    expect(getWendingLine("nope")).toBe(DEFAULT_LINE);
  });

  it("maps endpoints back to lines", () => {
    expect(lineForEndpoint("https://api14.wending.ai/v1").id).toBe("api14");
    expect(lineForEndpoint("https://API.wending.ai").id).toBe("main");
    expect(lineForEndpoint(undefined).id).toBe("main");
    expect(lineForEndpoint("not a url").id).toBe("main");
  });

  it("has translations for every line in zh and en", () => {
    for (const lang of ["zh", "en"]) {
      const lines = brandTranslations[lang].wending.lines as Record<
        string,
        unknown
      >;
      for (const line of WENDING_LINES) expect(lines[line.id]).toBeTruthy();
    }
  });
});

describe("official cards", () => {
  it("hides unused official cards but keeps the current one", () => {
    const providers = {
      "claude-official": { category: "official" },
      "universal-claude-wendingai": { category: "custom" },
      other: {},
    };
    expect(
      Object.keys(
        filterOfficialProviders(providers, "universal-claude-wendingai"),
      ),
    ).toEqual(["universal-claude-wendingai", "other"]);
    expect(
      Object.keys(filterOfficialProviders(providers, "claude-official")),
    ).toContain("claude-official");
  });
});

describe("appsWithoutModels", () => {
  it("ignores generic model lists", () => {
    expect(appsWithoutModels(["laotalk-quality", "laotalk-fast"])).toEqual([]);
    expect(appsWithoutModels([])).toEqual([]);
  });
  it("detects platform-specific keys", () => {
    expect(
      appsWithoutModels(["claude-sonnet-4-5", "claude-haiku-4-5"]),
    ).toEqual(["codex", "gemini"]);
    expect(appsWithoutModels(["gpt-5.5", "gemini-2.5-pro"])).toEqual([
      "claude",
    ]);
    expect(
      appsWithoutModels(["claude-opus-4-5", "gpt-5.5", "gemini-2.5-pro"]),
    ).toEqual([]);
  });
});

describe("one-click login client", () => {
  beforeEach(() => {
    invoke.mockReset();
    openExternal.mockReset();
  });

  it("probe falls back to unavailable on errors", async () => {
    invoke.mockRejectedValueOnce(new Error("boom"));
    expect(await probeWendingAuth("https://api.wending.ai")).toEqual({
      available: false,
      reason: "network",
    });
  });

  it("opens the browser and resolves with the key", async () => {
    let polls = 0;
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "wending_auth_start")
        return {
          flowId: "f1",
          authUrl: "https://api.wending.ai/oauth/authorize?x",
          expiresIn: 600,
        };
      if (cmd === "wending_auth_poll") {
        polls += 1;
        return polls < 2
          ? { status: "pending" }
          : { status: "done", apiKey: "sk-test" };
      }
      return undefined;
    });
    const key = await loginWithBrowser("https://api.wending.ai");
    expect(key).toBe("sk-test");
    expect(openExternal).toHaveBeenCalledWith(
      "https://api.wending.ai/oauth/authorize?x",
    );
    expect(polls).toBe(2);
  });

  it("reports server-side errors and cancellation", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "wending_auth_start")
        return { flowId: "f2", authUrl: "https://a", expiresIn: 600 };
      if (cmd === "wending_auth_poll")
        return { status: "error", error: "access_denied" };
      return undefined;
    });
    await expect(loginWithBrowser("https://api.wending.ai")).rejects.toEqual(
      new WendingAuthError("access_denied"),
    );

    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "wending_auth_start")
        return { flowId: "f3", authUrl: "https://a", expiresIn: 600 };
      if (cmd === "wending_auth_poll") return { status: "pending" };
      return undefined;
    });
    const controller = new AbortController();
    const pending = loginWithBrowser("https://api.wending.ai", {
      signal: controller.signal,
      onBrowserOpened: () => controller.abort(),
    });
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    expect(invoke).toHaveBeenCalledWith("wending_auth_cancel", {
      flowId: "f3",
    });
  });

  it("maps error codes to messages", () => {
    expect(authErrorKey("access_denied")).toBe("access_denied");
    expect(authErrorKey("token_http_500")).toBe("generic");
  });
});
