import { useTranslation } from "react-i18next";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { settingsApi } from "@/lib/api";
import { BRAND, maskApiKey } from "../brand";
import { formatAmount, type QuotaLine } from "../wending";
import {
  openWendingOnboarding,
  useRefreshWending,
  useWendingProvider,
  useWendingQuota,
} from "./useWendingAccount";
import logo from "@/assets/icons/logo.svg";

function Amount({ label, line }: { label: string; line?: QuotaLine }) {
  const { t } = useTranslation();
  if (!line) return null;
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-fg-3">{label}</span>
      <span className="font-semibold tabular-nums text-fg-1">
        {line.unlimited
          ? t("wending.quota.unlimited")
          : formatAmount(line.remaining, line.unit)}
      </span>
      {line.used !== undefined && (
        <span className="text-xs text-fg-3">
          {t("wending.quota.used")} {formatAmount(line.used, line.unit)}
        </span>
      )}
    </div>
  );
}

/** 顶部 WendingAI 账户条：显示打码的 Key、账户余额 / Key 剩余额度，支持手动刷新、充值、更换 Key */
export function WendingAccountBar() {
  const { t } = useTranslation();
  const { data: provider, isFetched } = useWendingProvider();
  const quotaQuery = useWendingQuota(provider?.apiKey, provider?.baseUrl);
  const { refresh, refreshing } = useRefreshWending();

  if (!isFetched) return null;

  const quota = quotaQuery.data;
  const loading = quotaQuery.isLoading || quotaQuery.isFetching || refreshing;

  return (
    <div
      className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface px-4 py-1.5 text-sm"
      data-testid="wending-account-bar"
    >
      <div className="flex items-center gap-2 font-medium text-fg-1">
        <img src={logo} alt="" className="h-4 w-4" />
        {BRAND.shortName}
        {provider && (
          <span className="font-mono text-xs text-fg-3">
            {maskApiKey(provider.apiKey)}
          </span>
        )}
      </div>

      {!provider ? (
        <div className="flex items-center gap-2 text-fg-3">
          {t("wending.quota.notConfigured")}
          <Button size="sm" onClick={openWendingOnboarding}>
            {t("wending.quota.configure")}
          </Button>
        </div>
      ) : (
        <>
          {quotaQuery.isLoading && (
            <span className="flex items-center gap-1.5 text-fg-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("wending.quota.loading")}
            </span>
          )}
          {quota?.status === "ok" && (
            <>
              <Amount label={t("wending.quota.account")} line={quota.account} />
              <Amount label={t("wending.quota.key")} line={quota.key} />
            </>
          )}
          {quota && quota.status !== "ok" && (
            <span
              className="flex items-center gap-1.5 text-danger"
              title={quota.message}
              data-testid="wending-quota-error"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              {quota.status === "invalid"
                ? t("wending.quota.invalid")
                : t("wending.quota.error")}
              <span className="max-w-[260px] truncate text-xs text-fg-3">
                {quota.message}
              </span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {quota && (
              <span className="mr-1 text-xs text-fg-3">
                {t("wending.quota.lastUpdated", {
                  time: new Date(quota.checkedAt).toLocaleTimeString(),
                })}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => void refresh()}
              title={t("wending.quota.refresh")}
            >
              <RefreshCw
                className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              {loading
                ? t("wending.quota.refreshing")
                : t("wending.quota.refresh")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void settingsApi.openExternal(BRAND.consoleTopupUrl)
              }
            >
              {t("wending.quota.topup")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={openWendingOnboarding}
            >
              {t("wending.quota.changeKey")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
