/**
 * WendingAI 账户逻辑：粘贴 Key → 验证 → 写统一供应商 → 同步并切换 Claude / Codex / Gemini；额度查询。
 */
import { providersApi, universalProvidersApi } from "@/lib/api";
import { subscriptionApi } from "@/lib/api/subscription";
import { fetchModelsForConfig } from "@/lib/api/model-fetch";
import type {
  UniversalProvider,
  UniversalProviderModels,
  UsageData,
  UsageResult,
} from "@/types";
import { BRAND, WENDING_DEFAULT_MODELS, lineForEndpoint } from "./brand";

export const WENDING_APPS = ["claude", "codex", "gemini"] as const;
export type WendingApp = (typeof WENDING_APPS)[number];

export function childProviderId(app: WendingApp): string {
  return `universal-${app}-${BRAND.universalProviderId}`;
}

export interface QuotaLine {
  remaining?: number;
  used?: number;
  total?: number;
  unit: string;
  unlimited?: boolean;
}

export type WendingQuota =
  | { status: "ok"; account?: QuotaLine; key: QuotaLine; checkedAt: number }
  | { status: "invalid"; message: string; checkedAt: number }
  | { status: "error"; message: string; checkedAt: number };

function toLine(d: UsageData | undefined): QuotaLine | undefined {
  if (!d) return undefined;
  let unlimited = false;
  if (d.extra) {
    try {
      unlimited = Boolean(JSON.parse(d.extra)?.unlimited);
    } catch {
      // extra 不是 JSON 时忽略
    }
  }
  return {
    remaining: d.remaining ?? undefined,
    used: d.used ?? undefined,
    total: d.total ?? undefined,
    unit: d.unit || "USD",
    unlimited,
  };
}

/** 把后端 get_balance 的结果整理成界面需要的结构 */
export function normalizeQuota(
  result: UsageResult,
  now = Date.now(),
): WendingQuota {
  const data = result.data ?? [];
  const keyData =
    data.find((d) => d.planName === "key") ?? data[data.length - 1];
  if (!result.success) {
    if (keyData && keyData.isValid === false) {
      return {
        status: "invalid",
        message: keyData.invalidMessage || result.error || "Invalid key",
        checkedAt: now,
      };
    }
    return {
      status: "error",
      message: result.error || "Unknown error",
      checkedAt: now,
    };
  }
  if (keyData && keyData.isValid === false) {
    return {
      status: "invalid",
      message: keyData.invalidMessage || "Invalid key",
      checkedAt: now,
    };
  }
  const key = toLine(keyData) ?? { unit: "USD" };
  const account = toLine(data.find((d) => d.planName === "account"));
  return { status: "ok", account, key, checkedAt: now };
}

/** 查询额度。网络等瞬时错误也整理成 status: "error"，不抛异常 */
export async function queryWendingQuota(
  apiKey: string,
  baseUrl: string = BRAND.defaultEndpoint,
): Promise<WendingQuota> {
  try {
    const result = await subscriptionApi.getBalance(baseUrl, apiKey.trim());
    return normalizeQuota(result);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      checkedAt: Date.now(),
    };
  }
}

/** 格式化金额 */
export function formatAmount(value: number | undefined, unit: string): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  if (unit === "tokens") return `${Math.round(value).toLocaleString()} tokens`;
  const symbol = unit === "CNY" ? "¥" : "$";
  return `${symbol}${value.toFixed(2)}`;
}

const MODEL_RULES: Record<string, RegExp[]> = {
  claudeSonnet: [/^claude-sonnet-4-5/, /^claude-sonnet/, /sonnet/],
  claudeOpus: [/^claude-opus-4-5/, /^claude-opus/, /opus/],
  claudeHaiku: [/^claude-haiku-4-5/, /^claude-haiku/, /haiku/],
  codex: [/^gpt-5\.5$/, /^gpt-5\.\d+-codex$/, /^gpt-5\.\d+$/, /^gpt-5/],
  gemini: [/^gemini-2\.5-pro$/, /^gemini-.*-pro/, /^gemini/],
};

/** 不适合做对话默认模型的（视觉专用、向量、图片、语音等） */
const NON_CHAT_MODEL =
  /vision|embed|image|dall-?e|tts|whisper|audio|speech|rerank|moderation|sora|video/i;
/** 通用“主力”模型关键词（WendingAI 自有模型名，例如 laotalk-quality） */
const MAIN_HINT = /quality|pro|max|plus|large|ultra/i;
/** 通用“快速”模型关键词（例如 laotalk-fast），用于 Claude Code 的 haiku 档 */
const FAST_HINT = /fast|mini|lite|flash|small|turbo|haiku/i;

function pickByRules(ids: string[], rules: RegExp[], preferred: string) {
  if (ids.includes(preferred)) return preferred;
  for (const rule of rules) {
    const hit = ids.find((id) => rule.test(id));
    if (hit) return hit;
  }
  return undefined;
}

function pickGeneric(ids: string[], hint: RegExp): string | undefined {
  const chat = ids.filter((id) => !NON_CHAT_MODEL.test(id));
  const pool = chat.length > 0 ? chat : ids;
  return pool.find((id) => hint.test(id)) ?? pool[0];
}

/**
 * 根据 Key 可用的模型列表（/v1/models）挑选各 CLI 的默认模型。
 * 顺序：已知模型族（claude-* / gpt-5* / gemini-*）→ 通用主力 / 快速关键词 → 列表第一个对话模型。
 * 只有拿不到模型列表时才使用内置默认值，保证写入的模型一定是这个 Key 能访问的。
 */
export function pickModels(modelIds: string[]): UniversalProviderModels {
  const ids = modelIds.map((m) => m.trim()).filter(Boolean);
  const d = WENDING_DEFAULT_MODELS;
  if (ids.length === 0) {
    return {
      claude: { ...d.claude },
      codex: { ...d.codex },
      gemini: { ...d.gemini },
    };
  }
  const main = pickGeneric(ids, MAIN_HINT) as string;
  const fast = pickGeneric(ids, FAST_HINT) ?? main;
  const sonnet =
    pickByRules(ids, MODEL_RULES.claudeSonnet, d.claude.sonnetModel) ?? main;
  return {
    claude: {
      model: sonnet,
      sonnetModel: sonnet,
      opusModel:
        pickByRules(ids, MODEL_RULES.claudeOpus, d.claude.opusModel) ?? main,
      haikuModel:
        pickByRules(ids, MODEL_RULES.claudeHaiku, d.claude.haikuModel) ?? fast,
    },
    codex: {
      model: pickByRules(ids, MODEL_RULES.codex, d.codex.model) ?? main,
      reasoningEffort: d.codex.reasoningEffort,
    },
    gemini: {
      model: pickByRules(ids, MODEL_RULES.gemini, d.gemini.model) ?? main,
    },
  };
}

export function buildWendingProvider(
  apiKey: string,
  baseUrl: string,
  models: UniversalProviderModels,
  existing?: UniversalProvider | null,
): UniversalProvider {
  return {
    id: BRAND.universalProviderId,
    name: BRAND.shortName,
    providerType: BRAND.providerType,
    apps: { claude: true, codex: true, gemini: true },
    baseUrl: baseUrl.trim().replace(/\/+$/, ""),
    apiKey: apiKey.trim(),
    models,
    websiteUrl: lineForEndpoint(baseUrl).endpoint,
    icon: "wendingai",
    iconColor: BRAND.iconColor,
    notes: existing?.notes,
    meta: {
      ...(existing?.meta ?? {}),
      usage_script: {
        enabled: true,
        language: "javascript",
        code: "",
        templateType: "balance",
        autoQueryInterval: 10,
      },
    },
    createdAt: existing?.createdAt ?? Date.now(),
    sortIndex: existing?.sortIndex ?? 0,
  };
}

export async function getWendingProvider(): Promise<UniversalProvider | null> {
  try {
    return await universalProvidersApi.get(BRAND.universalProviderId);
  } catch {
    return null;
  }
}

export type SetupStage = "verifying" | "configuring";

export class WendingSetupError extends Error {
  constructor(
    public readonly kind: "empty" | "invalid" | "network",
    message: string,
  ) {
    super(message);
  }
}

export interface SetupResult {
  quota: WendingQuota;
  failedApps: Array<{ app: WendingApp; error: string }>;
  /** Key 的模型列表里没有对应模型族的应用（多见于按平台分组的线路 Key），可能无法使用 */
  appsWithoutModels: WendingApp[];
}

const APP_MODEL_FAMILY: Record<WendingApp, RegExp> = {
  claude: /claude|sonnet|opus|haiku/i,
  codex: /^(gpt|o\d|codex)/i,
  gemini: /gemini/i,
};

/**
 * 按平台分组的 Key（例如线路 14 上只开通了 Claude 的 Key）只能用对应协议。
 * 模型列表里一个已知模型族都没有时（例如主站的 laotalk-* 通用模型）不做判断。
 */
export function appsWithoutModels(modelIds: string[]): WendingApp[] {
  const ids = modelIds.filter(Boolean);
  const supported = WENDING_APPS.filter((app) =>
    ids.some((id) => APP_MODEL_FAMILY[app].test(id)),
  );
  if (ids.length === 0 || supported.length === 0) return [];
  return WENDING_APPS.filter((app) => !supported.includes(app));
}

/**
 * 一步配置：验证 Key → 选模型 → 保存统一供应商 → 同步到三个 CLI → 切换为当前供应商。
 */
export async function setupWendingKey(
  apiKey: string,
  baseUrl: string = BRAND.defaultEndpoint,
  onStage?: (stage: SetupStage) => void,
): Promise<SetupResult> {
  const key = apiKey.trim();
  if (!key) throw new WendingSetupError("empty", "API key is empty");

  onStage?.("verifying");
  const quota = await queryWendingQuota(key, baseUrl);
  if (quota.status === "invalid") {
    throw new WendingSetupError("invalid", quota.message);
  }
  if (quota.status === "error") {
    throw new WendingSetupError("network", quota.message);
  }

  onStage?.("configuring");
  let modelIds: string[] = [];
  try {
    const models = await fetchModelsForConfig(`${baseUrl}/v1`, key);
    modelIds = models.map((m) => m.id);
  } catch {
    // 拿不到模型列表时使用默认模型
  }

  const existing = await getWendingProvider();
  const provider = buildWendingProvider(
    key,
    baseUrl,
    pickModels(modelIds),
    existing,
  );
  await universalProvidersApi.upsert(provider);

  const failedApps: SetupResult["failedApps"] = [];
  try {
    await universalProvidersApi.sync(provider.id);
  } catch (error) {
    // 同步会逐个应用写入，个别应用失败时继续尝试切换
    console.warn("[wending] sync failed", error);
  }
  for (const app of WENDING_APPS) {
    try {
      await providersApi.switch(childProviderId(app), app);
    } catch (error) {
      failedApps.push({
        app,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { quota, failedApps, appsWithoutModels: appsWithoutModels(modelIds) };
}
