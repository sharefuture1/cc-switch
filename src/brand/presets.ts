/**
 * WendingAI 纯净版预设：每个应用只保留一条 WendingAI 预设。
 *
 * 上游预设文件（`src/config/*ProviderPresets.ts`）里的数组改名为 `upstream*`，
 * 对外导出的数组在 `PURE_EDITION` 打开时换成这里的内容；构建时上游数组（含合作推广）会被 tree-shake 掉。
 */
import type { ProviderPreset } from "@/config/claudeProviderPresets";
import type { CodexProviderPreset } from "@/config/codexProviderPresets";
import type { GeminiProviderPreset } from "@/config/geminiProviderPresets";
import { BRAND, WENDING_DEFAULT_MODELS } from "./brand";

const ENDPOINT = BRAND.defaultEndpoint;
const ICON = "wendingai";

export const wendingClaudePresets: ProviderPreset[] = [
  {
    name: BRAND.shortName,
    websiteUrl: BRAND.websiteUrl,
    apiKeyUrl: BRAND.consoleTokenUrl,
    category: "aggregator",
    apiKeyField: "ANTHROPIC_AUTH_TOKEN",
    apiFormat: "anthropic",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: ENDPOINT,
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: WENDING_DEFAULT_MODELS.claude.model,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: WENDING_DEFAULT_MODELS.claude.haikuModel,
        ANTHROPIC_DEFAULT_SONNET_MODEL:
          WENDING_DEFAULT_MODELS.claude.sonnetModel,
        ANTHROPIC_DEFAULT_OPUS_MODEL: WENDING_DEFAULT_MODELS.claude.opusModel,
      },
    },
    endpointCandidates: [ENDPOINT],
    icon: ICON,
    iconColor: BRAND.iconColor,
  },
];

const codexToml = (model: string) => `model_provider = "custom"
model = ${JSON.stringify(model)}
model_reasoning_effort = ${JSON.stringify(WENDING_DEFAULT_MODELS.codex.reasoningEffort)}

[model_providers.custom]
name = ${JSON.stringify(BRAND.shortName)}
base_url = ${JSON.stringify(`${ENDPOINT}/v1`)}
wire_api = "responses"
requires_openai_auth = true`;

export const wendingCodexPresets: CodexProviderPreset[] = [
  {
    name: BRAND.shortName,
    websiteUrl: BRAND.websiteUrl,
    apiKeyUrl: BRAND.consoleTokenUrl,
    category: "aggregator",
    auth: { OPENAI_API_KEY: "" },
    config: codexToml(WENDING_DEFAULT_MODELS.codex.model),
    endpointCandidates: [`${ENDPOINT}/v1`],
    icon: ICON,
    iconColor: BRAND.iconColor,
  },
];

export const wendingGeminiPresets: GeminiProviderPreset[] = [
  {
    name: BRAND.shortName,
    websiteUrl: BRAND.websiteUrl,
    apiKeyUrl: BRAND.consoleTokenUrl,
    settingsConfig: {
      env: {
        GOOGLE_GEMINI_BASE_URL: ENDPOINT,
        GEMINI_MODEL: WENDING_DEFAULT_MODELS.gemini.model,
      },
    },
    baseURL: ENDPOINT,
    model: WENDING_DEFAULT_MODELS.gemini.model,
    description: BRAND.shortName,
    category: "aggregator",
    endpointCandidates: [ENDPOINT],
    icon: ICON,
    iconColor: BRAND.iconColor,
  },
];
