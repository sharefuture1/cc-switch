/**
 * WendingAI 品牌文案（命名空间 `wending.*`），在 i18n 初始化后合并进各语言。
 * 不改上游的 locales/*.json，减少合并冲突。
 */
const zh = {
  wending: {
    onboarding: {
      title: "欢迎使用 WendingAI Switch",
      subtitle:
        "粘贴一次 WendingAI API Key，即可自动为 Claude Code、Codex、Gemini CLI 完成配置。",
      keyLabel: "WendingAI API Key",
      keyPlaceholder: "sk-...",
      getKey: "还没有 Key？去控制台创建",
      endpoint: "接口地址",
      submit: "验证并一键配置",
      verifying: "正在验证 Key…",
      configuring: "正在写入配置…",
      success: "配置完成：Claude Code / Codex / Gemini CLI 已切换到 WendingAI",
      partial: "部分应用配置失败：{{apps}}",
      invalidKey: "Key 无效或已被禁用，请检查后重试",
      emptyKey: "请输入 API Key",
      networkError: "无法连接 WendingAI：{{error}}",
      later: "稍后再说",
      securityNote:
        "Key 仅保存在本机，并写入各工具自己的配置文件（与工具官方要求一致，为明文存储）。界面中只显示打码后的 Key。",
    },
    quota: {
      title: "WendingAI 额度",
      account: "账户余额",
      key: "Key 剩余额度",
      used: "已用",
      unlimited: "不限额",
      refresh: "刷新",
      refreshing: "刷新中…",
      loading: "正在查询额度…",
      error: "额度查询失败",
      invalid: "Key 无效",
      expired: "Key 已过期",
      lastUpdated: "更新于 {{time}}",
      topup: "充值",
      changeKey: "更换 Key",
      notConfigured: "尚未配置 WendingAI Key",
      configure: "立即配置",
    },
    about: {
      basedOn:
        "本软件基于开源项目 {{name}} 修改，原项目以 {{license}} 发布，{{copyright}}。",
      viewLicense: "查看开源许可",
    },
  },
};

const en = {
  wending: {
    onboarding: {
      title: "Welcome to WendingAI Switch",
      subtitle:
        "Paste your WendingAI API key once and Claude Code, Codex and Gemini CLI are configured automatically.",
      keyLabel: "WendingAI API key",
      keyPlaceholder: "sk-...",
      getKey: "No key yet? Create one in the console",
      endpoint: "Endpoint",
      submit: "Verify and configure",
      verifying: "Verifying key…",
      configuring: "Writing configuration…",
      success: "Done: Claude Code / Codex / Gemini CLI now use WendingAI",
      partial: "Some apps could not be configured: {{apps}}",
      invalidKey: "The key is invalid or disabled. Please check and retry.",
      emptyKey: "Please enter an API key",
      networkError: "Cannot reach WendingAI: {{error}}",
      later: "Later",
      securityNote:
        "The key stays on this computer and is written to each tool's own config file (plain text, as the tools require). Only a masked key is shown in the UI.",
    },
    quota: {
      title: "WendingAI quota",
      account: "Account balance",
      key: "Key remaining",
      used: "Used",
      unlimited: "Unlimited",
      refresh: "Refresh",
      refreshing: "Refreshing…",
      loading: "Loading quota…",
      error: "Failed to load quota",
      invalid: "Invalid key",
      expired: "Key expired",
      lastUpdated: "Updated {{time}}",
      topup: "Top up",
      changeKey: "Change key",
      notConfigured: "WendingAI key not configured",
      configure: "Configure now",
    },
    about: {
      basedOn:
        "This software is a modified version of the open-source project {{name}}, released under the {{license}}, {{copyright}}.",
      viewLicense: "View license",
    },
  },
};

export const brandTranslations: Record<string, typeof zh> = {
  zh,
  "zh-TW": zh,
  en,
  ja: en,
  tr: en,
};
