/**
 * 本地端到端用：把一键配置为 Hermes / OpenClaw / DeepSeek Harness 生成的供应商卡
 * （与应用内完全相同的对象）写到 $WENDING_AGENTS_DUMP，供
 * `src-tauri/tests/wending_agents_live.rs` 交给真实的后端配置写入代码。
 * 不设环境变量时跳过。
 */
import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";

const calls: Array<{ fn: string; args: unknown[] }> = [];
vi.mock("@/lib/api", () => {
  const rec =
    (fn: string, ret: unknown = true) =>
    async (...args: unknown[]) => {
      calls.push({ fn, args });
      return ret;
    };
  return {
    providersApi: {
      getAll: rec("getAll", {}),
      add: rec("add"),
      update: rec("update"),
      addToLiveConfig: rec("addToLiveConfig"),
      switch: rec("switch", {}),
    },
    openclawApi: {
      getModelCatalog: rec("getModelCatalog", {}),
      setModelCatalog: rec("setModelCatalog"),
      setDefaultModel: rec("setDefaultModel"),
    },
  };
});

import { configureAgentApps } from "@/brand/agents";

const out = process.env.WENDING_AGENTS_DUMP;

describe.runIf(Boolean(out))("dump agent provider cards", () => {
  it("writes the calls the app would make", async () => {
    const endpoint =
      process.env.WENDING_AGENTS_ENDPOINT ?? "http://127.0.0.1:18080";
    const gateway =
      (process.env.WENDING_AGENTS_GATEWAY as "newapi" | "sub2api") ?? "newapi";
    const models = (
      process.env.WENDING_AGENTS_MODELS ?? "laotalk-quality,laotalk-fast"
    )
      .split(",")
      .filter(Boolean);
    const failures = await configureAgentApps(
      process.env.WENDING_AGENTS_KEY ?? "sk-wending-mock-key",
      {
        id: "main",
        label: "test",
        description: "",
        endpoint,
        gateway,
        oauth: false,
        consoleTokenUrl: "",
        consoleTopupUrl: "",
        sharesMainAccount: true,
      },
      models,
      models[0] ?? "x",
    );
    expect(failures).toEqual([]);
    fs.writeFileSync(out as string, JSON.stringify(calls, null, 2));
  });
});
