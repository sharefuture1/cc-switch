import { beforeEach, describe, expect, it, vi } from "vitest";

const getBalance = vi.fn();
const fetchModels = vi.fn();
const upsert = vi.fn();
const sync = vi.fn();
const get = vi.fn();
const switchProvider = vi.fn();
const getAll = vi.fn();
const addProvider = vi.fn();
const updateProvider = vi.fn();
const addToLive = vi.fn();
const getCatalog = vi.fn();
const setCatalog = vi.fn();
const setDefaultModel = vi.fn();

vi.mock("@/lib/api/subscription", () => ({
  subscriptionApi: { getBalance: (...a: unknown[]) => getBalance(...a) },
}));
vi.mock("@/lib/api/model-fetch", () => ({
  fetchModelsForConfig: (...a: unknown[]) => fetchModels(...a),
}));
vi.mock("@/lib/api", () => ({
  universalProvidersApi: {
    upsert: (...a: unknown[]) => upsert(...a),
    sync: (...a: unknown[]) => sync(...a),
    get: (...a: unknown[]) => get(...a),
  },
  providersApi: {
    switch: (...a: unknown[]) => switchProvider(...a),
    getAll: (...a: unknown[]) => getAll(...a),
    add: (...a: unknown[]) => addProvider(...a),
    update: (...a: unknown[]) => updateProvider(...a),
    addToLiveConfig: (...a: unknown[]) => addToLive(...a),
  },
  openclawApi: {
    getModelCatalog: (...a: unknown[]) => getCatalog(...a),
    setModelCatalog: (...a: unknown[]) => setCatalog(...a),
    setDefaultModel: (...a: unknown[]) => setDefaultModel(...a),
  },
}));

import {
  buildWendingProvider,
  childProviderId,
  formatAmount,
  normalizeQuota,
  pickModels,
  queryWendingQuota,
  setupWendingKey,
  WendingSetupError,
} from "@/brand/wending";

const FAKE_KEY = "sk-test-not-a-real-key-000000000000";

const okBalance = {
  success: true,
  data: [
    { planName: "account", remaining: 12.5, used: 2.5, total: 15, unit: "USD" },
    {
      planName: "key",
      remaining: 3,
      used: 1,
      total: 4,
      unit: "USD",
      extra: '{"unlimited":false}',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("normalizeQuota", () => {
  it("maps account and key lines", () => {
    const q = normalizeQuota(okBalance, 1);
    expect(q).toEqual({
      status: "ok",
      checkedAt: 1,
      account: {
        remaining: 12.5,
        used: 2.5,
        total: 15,
        unit: "USD",
        unlimited: false,
      },
      key: { remaining: 3, used: 1, total: 4, unit: "USD", unlimited: false },
    });
  });

  it("reports invalid keys", () => {
    const q = normalizeQuota(
      {
        success: false,
        error: "Invalid token",
        data: [
          { planName: "key", isValid: false, invalidMessage: "Invalid token" },
        ],
      },
      1,
    );
    expect(q).toEqual({
      status: "invalid",
      message: "Invalid token",
      checkedAt: 1,
    });
  });

  it("reports generic errors", () => {
    expect(normalizeQuota({ success: false, error: "boom" }, 1)).toEqual({
      status: "error",
      message: "boom",
      checkedAt: 1,
    });
  });

  it("reads the unlimited flag", () => {
    const q = normalizeQuota({
      success: true,
      data: [{ planName: "key", unit: "USD", extra: '{"unlimited":true}' }],
    });
    expect(q.status === "ok" && q.key.unlimited).toBe(true);
  });
});

describe("queryWendingQuota", () => {
  it("turns thrown errors into an error state", async () => {
    getBalance.mockRejectedValueOnce(new Error("network down"));
    const q = await queryWendingQuota(FAKE_KEY);
    expect(q.status).toBe("error");
    expect(getBalance).toHaveBeenCalledWith("https://api.wending.ai", FAKE_KEY);
  });
});

describe("formatAmount", () => {
  it("formats currencies", () => {
    expect(formatAmount(1.234, "USD")).toBe("$1.23");
    expect(formatAmount(5, "CNY")).toBe("¥5.00");
    expect(formatAmount(undefined, "USD")).toBe("—");
  });
});

describe("pickModels", () => {
  it("falls back to defaults on an empty list", () => {
    const m = pickModels([]);
    expect(m.codex?.model).toBe("gpt-5.5");
    expect(m.claude?.model).toBeTruthy();
    expect(m.gemini?.model).toBeTruthy();
  });

  it("picks the closest available models", () => {
    const m = pickModels([
      "claude-sonnet-4-6",
      "claude-opus-4-1",
      "claude-haiku-4-5-20251001",
      "gpt-5.2",
      "gemini-3-pro-preview",
    ]);
    expect(m.claude?.sonnetModel).toBe("claude-sonnet-4-6");
    expect(m.claude?.opusModel).toBe("claude-opus-4-1");
    expect(m.claude?.haikuModel).toBe("claude-haiku-4-5-20251001");
    expect(m.codex?.model).toBe("gpt-5.2");
    expect(m.gemini?.model).toBe("gemini-3-pro-preview");
  });
});

describe("pickModels with WendingAI-only models", () => {
  it("uses models the key can access instead of inaccessible defaults", () => {
    const m = pickModels(["laotalk-fast", "laotalk-quality", "laotalk-vision"]);
    expect(m.claude?.model).toBe("laotalk-quality");
    expect(m.claude?.sonnetModel).toBe("laotalk-quality");
    expect(m.claude?.opusModel).toBe("laotalk-quality");
    expect(m.claude?.haikuModel).toBe("laotalk-fast");
    expect(m.codex?.model).toBe("laotalk-quality");
    expect(m.gemini?.model).toBe("laotalk-quality");
  });

  it("never picks a vision-only model when a chat model exists", () => {
    const m = pickModels(["x-vision", "x-chat"]);
    expect(m.claude?.model).toBe("x-chat");
    expect(m.claude?.haikuModel).toBe("x-chat");
  });
});

describe("buildWendingProvider", () => {
  it("builds a universal provider for Claude Code and Codex (no Gemini)", () => {
    const p = buildWendingProvider(
      ` ${FAKE_KEY} `,
      "https://api.wending.ai/",
      pickModels([]),
    );
    expect(p.id).toBe("wendingai");
    expect(p.apiKey).toBe(FAKE_KEY);
    expect(p.baseUrl).toBe("https://api.wending.ai");
    expect(p.apps).toEqual({ claude: true, codex: true, gemini: false });
    expect(p.meta?.usage_script?.templateType).toBe("balance");
  });
});

describe("setupWendingKey", () => {
  it("rejects an empty key without calling the backend", async () => {
    await expect(setupWendingKey("  ")).rejects.toMatchObject({
      kind: "empty",
    });
    expect(getBalance).not.toHaveBeenCalled();
  });

  it("stops on an invalid key and writes nothing", async () => {
    getBalance.mockResolvedValueOnce({
      success: false,
      error: "Invalid token",
      data: [
        { planName: "key", isValid: false, invalidMessage: "Invalid token" },
      ],
    });
    const err = await setupWendingKey(FAKE_KEY).catch((e) => e);
    expect(err).toBeInstanceOf(WendingSetupError);
    expect(err.kind).toBe("invalid");
    expect(upsert).not.toHaveBeenCalled();
    expect(switchProvider).not.toHaveBeenCalled();
  });

  it("configures Claude Code, Codex, Hermes, OpenClaw and DSH", async () => {
    getBalance.mockResolvedValueOnce(okBalance);
    fetchModels.mockResolvedValueOnce([{ id: "gpt-5.5" }]);
    get.mockRejectedValueOnce(new Error("not found"));
    switchProvider.mockImplementation(async (id: string) => id);
    getAll.mockImplementation(async (app: string) =>
      app === "hermes" ? { wendingai: { id: "wendingai", createdAt: 1 } } : {},
    );
    addProvider.mockImplementation(async (_p: unknown, app: string) => {
      if (app === "dsh") throw new Error("dsh not installed");
      return true;
    });
    getCatalog.mockResolvedValueOnce({ "other/model": {} });
    const stages: string[] = [];
    const res = await setupWendingKey(FAKE_KEY, undefined, (s) =>
      stages.push(s),
    );
    expect(stages).toEqual(["verifying", "configuring"]);
    expect(fetchModels).toHaveBeenCalledWith(
      "https://api.wending.ai/v1",
      FAKE_KEY,
    );
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith("wendingai");
    expect(switchProvider).toHaveBeenCalledWith(
      childProviderId("claude"),
      "claude",
    );
    expect(switchProvider).toHaveBeenCalledWith(
      childProviderId("codex"),
      "codex",
    );
    expect(switchProvider).not.toHaveBeenCalledWith(
      expect.anything(),
      "gemini",
    );
    // Hermes 已有 WendingAI 卡：更新 + 写回 live + 切换（设置 model.default）
    expect(updateProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "wendingai",
        createdAt: 1,
        settingsConfig: expect.objectContaining({
          base_url: "https://api.wending.ai/v1",
          api_key: FAKE_KEY,
          api_mode: "chat_completions",
          models: [{ id: "gpt-5.5", name: "gpt-5.5" }],
        }),
      }),
      "hermes",
    );
    expect(addToLive).toHaveBeenCalledWith("wendingai", "hermes");
    expect(switchProvider).toHaveBeenCalledWith("wendingai", "hermes");
    // OpenClaw：新增卡片 + 模型目录 + 默认模型
    expect(addProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsConfig: expect.objectContaining({
          baseUrl: "https://api.wending.ai/v1",
          api: "openai-completions",
        }),
      }),
      "openclaw",
      true,
    );
    expect(setCatalog).toHaveBeenCalledWith({
      "other/model": {},
      "wendingai/gpt-5.5": { alias: "WendingAI" },
    });
    expect(setDefaultModel).toHaveBeenCalledWith({
      primary: "wendingai/gpt-5.5",
    });
    expect(res.failedApps).toEqual([
      { app: "dsh", error: "dsh not installed" },
    ]);
  });
});
