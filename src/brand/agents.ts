/**
 * 一键配置 Hermes / OpenClaw / DeepSeek Harness（累加式应用）。
 *
 * 和 Claude Code / Codex 不同，这三个应用不走统一供应商，而是各自写一张固定 ID 的
 * “WendingAI” 供应商卡（格式与上游预设一致），写入它们自己的配置文件，并设为默认模型：
 *  - Hermes：`~/.hermes/config.yaml` 的 custom_providers + 顶层 `model:`（切换时由后端设置）
 *  - OpenClaw：`~/.openclaw/openclaw.json` 的 models.providers + agents.defaults.model / models
 *  - DeepSeek Harness：`$DSH_HOME/profiles/<web|desktop|…>/cordis.patch.yml` 的 provider
 *
 * 协议：主线路（new-api）所有模型都走 OpenAI Chat Completions；线路 14（sub2api）按 Key
 * 的模型族选择 Anthropic Messages（claude-*）或 OpenAI Responses（gpt-* 等）。
 */
import { openclawApi, providersApi } from "@/lib/api";
import type { AppId } from "@/lib/api/types";
import type { Provider } from "@/types";
import { BRAND, type WendingLine } from "./brand";

export const AGENT_APPS = ["hermes", "openclaw", "dsh"] as const;
export type AgentApp = (typeof AGENT_APPS)[number];

/** 写入各应用的供应商 ID（OpenClaw / Hermes 里也是 provider key） */
export const AGENT_PROVIDER_ID = BRAND.universalProviderId;

export type AgentProtocol =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages";

const CLAUDE_MODEL = /claude|sonnet|opus|haiku/i;
const GPT_MODEL = /^(gpt|o\d|codex)/i;
const NON_CHAT_MODEL =
  /vision|embed|image|dall-?e|tts|whisper|audio|speech|rerank|moderation|sora|video/i;
const MAIN_HINT = /quality|pro|max|plus|large|ultra|sonnet/i;
/** 写进各应用模型列表的最大数量（列表太长时界面难选） */
const MAX_MODELS = 20;

export interface AgentPlan {
  protocol: AgentProtocol;
  /** 不含末尾斜杠；OpenAI 协议带 /v1，Anthropic 协议不带 */
  baseUrl: string;
  /** 默认模型，排在 models 第一位 */
  model: string;
  models: string[];
}

/**
 * 根据线路和 Key 的模型列表决定协议、地址和模型。
 * `fallbackModel` 用于拿不到模型列表时（例如网络错误）。
 */
export function planAgentConfig(
  line: Pick<WendingLine, "endpoint" | "gateway">,
  modelIds: string[],
  fallbackModel: string,
): AgentPlan {
  const root = line.endpoint.trim().replace(/\/+$/, "");
  const ids = modelIds.map((m) => m.trim()).filter(Boolean);
  const chat = ids.filter((id) => !NON_CHAT_MODEL.test(id));
  const pool = chat.length > 0 ? chat : ids;

  let protocol: AgentProtocol = "openai-completions";
  let candidates = pool;
  if (line.gateway === "sub2api") {
    const claude = pool.filter((id) => CLAUDE_MODEL.test(id));
    const gpt = pool.filter((id) => GPT_MODEL.test(id));
    if (claude.length > 0 && claude.length >= gpt.length) {
      protocol = "anthropic-messages";
      candidates = claude;
    } else {
      protocol = "openai-responses";
      candidates = gpt.length > 0 ? gpt : pool;
    }
  }

  const model =
    candidates.find((id) => MAIN_HINT.test(id)) ??
    candidates[0] ??
    fallbackModel;
  const models = [model, ...candidates.filter((id) => id !== model)].slice(
    0,
    MAX_MODELS,
  );
  return {
    protocol,
    baseUrl: protocol === "anthropic-messages" ? root : `${root}/v1`,
    model,
    models,
  };
}

const HERMES_API_MODE: Record<AgentProtocol, string> = {
  "openai-completions": "chat_completions",
  "openai-responses": "codex_responses",
  "anthropic-messages": "anthropic_messages",
};

/** Hermes 供应商卡（`HermesProviderSettingsConfig`） */
export function hermesSettings(plan: AgentPlan, apiKey: string) {
  return {
    name: BRAND.shortName,
    base_url: plan.baseUrl,
    api_key: apiKey,
    api_mode: HERMES_API_MODE[plan.protocol],
    models: plan.models.map((id) => ({ id, name: id })),
  };
}

/** OpenClaw 供应商卡（`OpenClawProviderConfig`） */
export function openclawSettings(plan: AgentPlan, apiKey: string) {
  return {
    baseUrl: plan.baseUrl,
    apiKey,
    api: plan.protocol,
    models: plan.models.map((id) => ({ id, name: id, input: ["text"] })),
  };
}

/** DeepSeek Harness 供应商卡（与上游 dshProviderPresets 同结构） */
export function dshSettings(plan: AgentPlan, apiKey: string) {
  return {
    name: BRAND.shortName,
    kind: "custom",
    enabled: true,
    api: plan.protocol,
    options: { baseURL: plan.baseUrl, apiKey },
    models: Object.fromEntries(
      plan.models.map((id) => [
        id,
        {
          name: id,
          modalities: { input: ["text"], output: ["text"] },
          reasoningEfforts: false,
        },
      ]),
    ),
  };
}

function settingsFor(app: AgentApp, plan: AgentPlan, apiKey: string) {
  switch (app) {
    case "hermes":
      return hermesSettings(plan, apiKey);
    case "openclaw":
      return openclawSettings(plan, apiKey);
    case "dsh":
      return dshSettings(plan, apiKey);
  }
}

function buildProvider(
  app: AgentApp,
  plan: AgentPlan,
  apiKey: string,
  websiteUrl: string,
  existing?: Provider,
): Provider {
  return {
    ...(existing ?? {}),
    id: AGENT_PROVIDER_ID,
    name: BRAND.shortName,
    settingsConfig: settingsFor(app, plan, apiKey),
    websiteUrl,
    category: "custom",
    icon: "wendingai",
    iconColor: BRAND.iconColor,
    createdAt: existing?.createdAt ?? Date.now(),
  };
}

/** 写入一个应用并设为默认模型；失败抛出异常 */
async function configureApp(
  app: AgentApp,
  plan: AgentPlan,
  apiKey: string,
  websiteUrl: string,
): Promise<void> {
  const appId = app as AppId;
  const all = await providersApi.getAll(appId);
  const existing = all[AGENT_PROVIDER_ID];
  const provider = buildProvider(app, plan, apiKey, websiteUrl, existing);
  if (existing) {
    await providersApi.update(provider, appId);
    await providersApi.addToLiveConfig(AGENT_PROVIDER_ID, appId);
  } else {
    await providersApi.add(provider, appId, true);
  }

  if (app === "hermes") {
    // 切换会把顶层 model.default / model.provider 指向这张卡的第一个模型
    await providersApi.switch(AGENT_PROVIDER_ID, appId);
  } else if (app === "openclaw") {
    const ref = `${AGENT_PROVIDER_ID}/${plan.model}`;
    const catalog = (await openclawApi.getModelCatalog()) ?? {};
    await openclawApi.setModelCatalog({
      ...catalog,
      [ref]: { alias: BRAND.shortName },
    });
    await openclawApi.setDefaultModel({ primary: ref });
  }
}

export interface AgentSetupFailure {
  app: AgentApp;
  error: string;
}

/** 依次配置三个应用；单个失败不影响其他应用 */
export async function configureAgentApps(
  apiKey: string,
  line: WendingLine,
  modelIds: string[],
  fallbackModel: string,
  apps: readonly AgentApp[] = AGENT_APPS,
): Promise<AgentSetupFailure[]> {
  const plan = planAgentConfig(line, modelIds, fallbackModel);
  const failures: AgentSetupFailure[] = [];
  for (const app of apps) {
    try {
      await configureApp(app, plan, apiKey.trim(), line.endpoint);
    } catch (error) {
      console.warn(`[wending] configure ${app} failed`, error);
      failures.push({
        app,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return failures;
}
