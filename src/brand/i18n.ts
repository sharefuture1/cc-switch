/**
 * WendingAI 品牌文案（命名空间 `wending.*`），在 i18n 初始化后合并进各语言。
 * 不改上游的 locales/*.json，减少合并冲突。
 */
const zh = {
  wending: {
    onboarding: {
      title: "连接 WendingAI",
      subtitle:
        "选择线路，用 WendingAI 账号一键登录或粘贴 API Key，自动为 Claude Code、Codex、Gemini CLI 完成配置。",
      keyLabel: "API Key",
      keyPlaceholder: "sk-...",
      getKey: "去控制台创建 Key",
      endpoint: "接口地址",
      submit: "验证并配置",
      verifying: "正在验证…",
      configuring: "正在写入配置…",
      success:
        "配置完成：Claude Code / Codex / Gemini CLI 已切换到 WendingAI {{line}}",
      partial: "部分应用配置失败：{{apps}}",
      modelsMissing:
        "配置完成，但这个 Key 的可用模型里没有 {{apps}} 对应的模型，这些工具可能无法使用。请在控制台给 Key 选择包含对应模型的分组。",
      invalidKey: "Key 无效或已被禁用，请检查后重试",
      invalidKeyLine:
        "Key 在{{line}}上无效：该线路使用独立账户，请使用在该线路控制台创建的 Key",
      emptyKey: "请输入 API Key",
      networkError: "无法连接 WendingAI：{{error}}",
      orPaste: "或者粘贴 API Key",
      later: "稍后再说",
      close: "关闭",
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
      manage: "线路 / Key",
      notConfigured: "尚未配置 WendingAI Key",
      configure: "立即配置",
    },
    lines: {
      title: "线路",
      main: { label: "主线路", description: "api.wending.ai · 支持一键登录" },
      api14: {
        label: "线路 14",
        description: "api14.wending.ai · 独立账户",
      },
      separateTitle: "{{line}}使用独立账户",
      separateDesc:
        "主线路的 Key 在这里不能用。请登录 {{host}} 控制台创建 Key 后粘贴到下方，额度按该线路账户计算。",
    },
    auth: {
      login: "使用 WendingAI 账号一键登录",
      checking: "正在检查一键登录…",
      hint: "在浏览器中登录并授权，本机自动获得专用 Key，无需复制粘贴",
      waitingTitle: "请在浏览器中完成授权",
      waitingDesc:
        "已打开 WendingAI 授权页面。登录后点击“授权”，完成后会自动回到这里并完成配置。",
      cancel: "取消",
      unavailable: "一键登录暂未开放，请先使用 API Key 连接。",
      unavailableNetwork:
        "暂时无法连接一键登录服务，请稍后再试，或使用 API Key 连接。",
      errors: {
        access_denied: "你在浏览器中取消了授权",
        cancelled: "已取消",
        timeout: "等待授权超时，请重试",
        invalid_grant: "授权已过期或已被使用，请重试",
        invalid_client: "一键登录暂未开放，请使用 API Key 连接",
        generic: "授权没有完成，请重试或使用 API Key 连接",
      },
    },
    gemini: {
      trustTitle: "Gemini CLI 需要信任当前目录才会读取配置",
      trustDesc:
        "首次在某个项目目录运行 gemini 时，请在提示中选择信任该目录；脚本或非交互模式可使用",
      dismiss: "不再提示",
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
      title: "Connect WendingAI",
      subtitle:
        "Pick a line, then sign in with your WendingAI account or paste an API key. Claude Code, Codex and Gemini CLI are configured automatically.",
      keyLabel: "API key",
      keyPlaceholder: "sk-...",
      getKey: "Create a key in the console",
      endpoint: "Endpoint",
      submit: "Verify and configure",
      verifying: "Verifying…",
      configuring: "Writing configuration…",
      success:
        "Done: Claude Code / Codex / Gemini CLI now use WendingAI {{line}}",
      partial: "Some apps could not be configured: {{apps}}",
      modelsMissing:
        "Configured, but this key has no models for {{apps}}, so those tools may not work. Pick a group with matching models for the key in the console.",
      invalidKey: "The key is invalid or disabled. Please check and retry.",
      invalidKeyLine:
        "The key is not valid on {{line}}: that line has separate accounts, use a key created in its console",
      emptyKey: "Please enter an API key",
      networkError: "Cannot reach WendingAI: {{error}}",
      orPaste: "or paste an API key",
      later: "Later",
      close: "Close",
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
      manage: "Line / key",
      notConfigured: "WendingAI key not configured",
      configure: "Configure now",
    },
    lines: {
      title: "Line",
      main: {
        label: "Main line",
        description: "api.wending.ai · one-click sign-in",
      },
      api14: {
        label: "Line 14",
        description: "api14.wending.ai · separate account",
      },
      separateTitle: "{{line}} uses separate accounts",
      separateDesc:
        "Main-line keys do not work here. Sign in to the {{host}} console, create a key and paste it below; quota is billed to that account.",
    },
    auth: {
      login: "Sign in with WendingAI",
      checking: "Checking one-click sign-in…",
      hint: "Sign in and approve in your browser; this computer gets its own key automatically",
      waitingTitle: "Finish in your browser",
      waitingDesc:
        "The WendingAI authorization page is open. Sign in and click Authorize; you will be brought back here automatically.",
      cancel: "Cancel",
      unavailable:
        "One-click sign-in is not available yet. Please connect with an API key.",
      unavailableNetwork:
        "Cannot reach the sign-in service right now. Try again later or use an API key.",
      errors: {
        access_denied: "Authorization was cancelled in the browser",
        cancelled: "Cancelled",
        timeout: "Timed out waiting for authorization. Please retry.",
        invalid_grant:
          "The authorization expired or was already used. Please retry.",
        invalid_client:
          "One-click sign-in is not available yet. Please use an API key.",
        generic: "Authorization did not complete. Retry or use an API key.",
      },
    },
    gemini: {
      trustTitle: "Gemini CLI only reads its config in trusted folders",
      trustDesc:
        "The first time you run gemini in a project folder, choose to trust it; for scripts or non-interactive use run",
      dismiss: "Don't show again",
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
