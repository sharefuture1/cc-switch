/**
 * WendingAI 品牌层（前端）。
 *
 * 所有品牌相关的常量集中在这里，上游代码只通过少量钩子引用它，
 * 方便和上游 CC Switch 合并。对应的 Rust 侧常量在 `src-tauri/src/brand.rs`。
 */
import type { AppId } from "@/lib/api/types";

/**
 * 纯净版开关：true 时只保留 WendingAI 预设、隐藏合作推广、第三方登录和其他应用。
 * 由构建时 define 注入（正式构建为 true；单元测试为 false，以便上游测试继续有效）。
 */
export const PURE_EDITION: boolean = __WENDING_PURE__;

export const BRAND = {
  /** 产品名（窗口标题、关于页、托盘） */
  productName: "WendingAI Switch",
  /** 品牌名（只显示 WendingAI，不显示公司全称） */
  shortName: "WendingAI",
  /** 统一供应商类型 / 预设标识 */
  providerType: "wendingai",
  /** 统一供应商的固定 ID：生成的子供应商为 universal-<app>-wendingai */
  universalProviderId: "wendingai",
  /** 默认 API 地址（各 CLI 的具体路径由统一供应商逻辑自动补全） */
  defaultEndpoint: "https://api.wending.ai",
  websiteUrl: "https://api.wending.ai",
  /** 控制台：创建 / 查看 API Key */
  consoleTokenUrl: "https://api.wending.ai/keys",
  /** 控制台：充值 */
  consoleTopupUrl: "https://api.wending.ai/wallet",
  /** 一键授权登录：服务端注册的桌面端公共客户端 ID（见 docs/HANDOFF.md） */
  oauthClientId: "wd_wendingai_switch",
  /** 深链接协议 */
  deeplinkScheme: "wendingai",
  /** 数据目录名（位于用户主目录下） */
  dataDirName: ".wendingai",
  /** 图标颜色 */
  iconColor: "#111111",
  /** v1 只开放这三个应用 */
  enabledApps: ["claude", "codex", "gemini"] as readonly AppId[],
  /** 纯净版隐藏的全局页面：授权中心（第三方官方账号 OAuth 登录） */
  hiddenPages: ["auth"] as readonly string[],
  /** 自动更新：在自有更新服务和签名密钥就绪前保持关闭 */
  updatesEnabled: false,
  /** 新版本说明 / 新布局公告等上游弹窗 */
  upstreamNoticesEnabled: false,
  /** 上游开源项目署名（MIT 许可要求保留版权声明） */
  upstream: {
    name: "CC Switch",
    author: "Jason Young",
    license: "MIT License",
    copyright: "Copyright (c) 2025 Jason Young",
    repo: "https://github.com/farion1231/cc-switch",
  },
} as const;

/** 线路使用的网关类型：new-api（主站，支持一键登录）/ sub2api（独立账户的加速线路） */
export type WendingGateway = "newapi" | "sub2api";

export interface WendingLine {
  id: string;
  /** 界面名称 */
  label: string;
  /** 一句话说明 */
  description: string;
  endpoint: string;
  gateway: WendingGateway;
  /** 是否支持浏览器一键授权登录 */
  oauth: boolean;
  /** 控制台：创建 Key / 充值 */
  consoleTokenUrl: string;
  consoleTopupUrl: string;
  /** Key 是否与主线路通用（不通用时需要在该线路控制台单独创建 Key） */
  sharesMainAccount: boolean;
}

/**
 * 可选线路。主线路 api.wending.ai 是 new-api；api14.wending.ai 是独立部署的 sub2api 网关
 * （独立账户和 Key，额度接口为 /v1/usage，支持 Anthropic / OpenAI Responses / Gemini 三种协议）。
 */
export const WENDING_LINES: readonly WendingLine[] = [
  {
    id: "main",
    label: "主线路",
    description: "api.wending.ai · 支持一键登录",
    endpoint: "https://api.wending.ai",
    gateway: "newapi",
    oauth: true,
    consoleTokenUrl: "https://api.wending.ai/keys",
    consoleTopupUrl: "https://api.wending.ai/wallet",
    sharesMainAccount: true,
  },
  {
    id: "api14",
    label: "线路 14",
    description: "api14.wending.ai · 独立账户，需单独创建 Key",
    endpoint: "https://api14.wending.ai",
    gateway: "sub2api",
    oauth: false,
    consoleTokenUrl: "https://api14.wending.ai/keys",
    consoleTopupUrl: "https://api14.wending.ai/purchase",
    sharesMainAccount: false,
  },
] as const;

export const DEFAULT_LINE = WENDING_LINES[0];

export function getWendingLine(id: string | undefined | null): WendingLine {
  return WENDING_LINES.find((l) => l.id === id) ?? DEFAULT_LINE;
}

/** 根据地址找到对应线路（找不到时视为主线路） */
export function lineForEndpoint(url: string | undefined | null): WendingLine {
  if (!url) return DEFAULT_LINE;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return (
      WENDING_LINES.find((l) => new URL(l.endpoint).hostname === host) ??
      DEFAULT_LINE
    );
  } catch {
    return DEFAULT_LINE;
  }
}

/**
 * 默认模型。授权/粘贴 Key 后会尝试用 `/v1/models` 自动挑选当前账号可用的模型，
 * 拿不到列表时回落到这里。
 */
export const WENDING_DEFAULT_MODELS = {
  claude: {
    model: "claude-sonnet-4-5",
    haikuModel: "claude-haiku-4-5",
    sonnetModel: "claude-sonnet-4-5",
    opusModel: "claude-opus-4-5",
  },
  codex: {
    model: "gpt-5.5",
    reasoningEffort: "high",
  },
  gemini: {
    model: "gemini-2.5-pro",
  },
};

/** 是否在当前版本里显示这个应用 */
export function isBrandAppEnabled(app: AppId): boolean {
  if (!PURE_EDITION) return true;
  return (BRAND.enabledApps as readonly string[]).includes(app);
}

/** 纯净版里是否隐藏这个全局页面 */
export function isBrandPageHidden(page: string): boolean {
  return PURE_EDITION && BRAND.hiddenPages.includes(page);
}

/** 是否为 WendingAI 的地址 */
export function isWendingEndpoint(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host === "api.wending.ai" || host.endsWith(".wending.ai");
  } catch {
    return false;
  }
}

/** 把 API Key 打码显示：sk-****abcd */
export function maskApiKey(key: string | undefined | null): string {
  const k = (key ?? "").trim();
  if (!k) return "";
  // 太短的 Key 不显示任何字符，避免露出整串
  if (k.length <= 12) return "****";
  const tail = k.slice(-4);
  const prefix = k.startsWith("sk-") ? "sk-" : "";
  return `${prefix}****${tail}`;
}

/**
 * 纯净版隐藏上游内置的官方入口卡片（Claude Official / OpenAI Official / Google Official…）。
 * 正在使用中的卡片仍然显示，避免用户看不到当前生效的配置。
 */
export function filterBrandProviders<T extends { category?: string }>(
  providers: Record<string, T>,
  currentProviderId: string,
): Record<string, T> {
  return PURE_EDITION
    ? filterOfficialProviders(providers, currentProviderId)
    : providers;
}

export function filterOfficialProviders<T extends { category?: string }>(
  providers: Record<string, T>,
  currentProviderId: string,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, p] of Object.entries(providers)) {
    if (p.category === "official" && id !== currentProviderId) continue;
    out[id] = p;
  }
  return out;
}
