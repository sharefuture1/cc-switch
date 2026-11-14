import { describe, expect, it } from "vitest";
import {
  dshSettings,
  hermesSettings,
  openclawSettings,
  planAgentConfig,
} from "@/brand/agents";

const main = { endpoint: "https://api.wending.ai", gateway: "newapi" as const };
const api14 = {
  endpoint: "https://api14.wending.ai/",
  gateway: "sub2api" as const,
};

describe("planAgentConfig", () => {
  it("uses OpenAI chat completions on the main line", () => {
    const plan = planAgentConfig(
      main,
      ["laotalk-fast", "laotalk-vision", "laotalk-quality"],
      "x",
    );
    expect(plan).toEqual({
      protocol: "openai-completions",
      baseUrl: "https://api.wending.ai/v1",
      model: "laotalk-quality",
      models: ["laotalk-quality", "laotalk-fast"],
    });
  });

  it("uses Anthropic Messages for Claude keys on api14", () => {
    const plan = planAgentConfig(
      api14,
      ["claude-haiku-4-5", "claude-sonnet-4-5"],
      "x",
    );
    expect(plan.protocol).toBe("anthropic-messages");
    expect(plan.baseUrl).toBe("https://api14.wending.ai");
    expect(plan.model).toBe("claude-sonnet-4-5");
  });

  it("uses OpenAI Responses for GPT keys on api14", () => {
    const plan = planAgentConfig(api14, ["gpt-5.5", "gpt-5.4-mini"], "x");
    expect(plan.protocol).toBe("openai-responses");
    expect(plan.baseUrl).toBe("https://api14.wending.ai/v1");
    expect(plan.models[0]).toBe("gpt-5.5");
  });

  it("falls back to the given model without a model list", () => {
    expect(planAgentConfig(main, [], "gpt-5.5").models).toEqual(["gpt-5.5"]);
  });
});

describe("per-app settings", () => {
  const plan = planAgentConfig(main, ["laotalk-quality"], "x");
  const key = "sk-test-not-a-real-key";

  it("matches the upstream Hermes card format", () => {
    expect(hermesSettings(plan, key)).toEqual({
      name: "WendingAI",
      base_url: "https://api.wending.ai/v1",
      api_key: key,
      api_mode: "chat_completions",
      models: [{ id: "laotalk-quality", name: "laotalk-quality" }],
    });
  });

  it("matches the upstream OpenClaw card format", () => {
    expect(openclawSettings(plan, key)).toEqual({
      baseUrl: "https://api.wending.ai/v1",
      apiKey: key,
      api: "openai-completions",
      models: [
        { id: "laotalk-quality", name: "laotalk-quality", input: ["text"] },
      ],
    });
  });

  it("matches the upstream DeepSeek Harness card format", () => {
    const s = dshSettings(plan, key);
    expect(s).toMatchObject({
      kind: "custom",
      enabled: true,
      api: "openai-completions",
      options: { baseURL: "https://api.wending.ai/v1", apiKey: key },
    });
    expect(Object.keys(s.models)).toEqual(["laotalk-quality"]);
  });
});
