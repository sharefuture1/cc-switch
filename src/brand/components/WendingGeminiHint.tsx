import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Notice } from "@/components/ui/notice";

const STORAGE_KEY = "wending.geminiTrustHintDismissed";

/**
 * Gemini CLI 的“文件夹信任”机制：在未受信任的目录里不会读取 ~/.gemini/.env，
 * 表现为“配置好了却提示未登录 / 要求选择认证方式”。在 Gemini 页给一次性提示。
 */
export function WendingGeminiHint() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "1",
  );
  if (dismissed) return null;
  return (
    <div className="px-4 pt-3" data-testid="wending-gemini-hint">
      <Notice
        tone="neutral"
        title={t("wending.gemini.trustTitle")}
        onDismiss={() => {
          localStorage.setItem(STORAGE_KEY, "1");
          setDismissed(true);
        }}
        dismissLabel={t("wending.gemini.dismiss")}
      >
        {t("wending.gemini.trustDesc")}{" "}
        <code className="rounded bg-surface px-1 py-0.5 font-mono text-xs text-fg-1">
          gemini --skip-trust
        </code>
      </Notice>
    </div>
  );
}
