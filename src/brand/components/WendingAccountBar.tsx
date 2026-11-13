import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  RefreshCw,
  Settings2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { settingsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BRAND, lineForEndpoint, maskApiKey } from "../brand";
import { formatAmount, type QuotaLine } from "../wending";
import {
  openWendingOnboarding,
  useRefreshWending,
  useWendingProvider,
  useWendingQuota,
} from "./useWendingAccount";
import logo from "@/assets/icons/logo.svg";

function Amount({
  label,
  line,
  testId,
}: {
  label: string;
  line?: QuotaLine;
  testId: string;
}) {
  const { t } = useTranslation();
  if (!line) return null;
  const low =
    !line.unlimited && line.remaining !== undefined && line.remaining < 1;
  return (
    <div
      className="flex items-baseline gap-1.5 whitespace-nowrap"
      data-testid={testId}
    >
      <span className="text-xs text-fg-3">{label}</span>
      <span
        className={cn(
          "text-[15px] font-semibold tabular-nums",
          low ? "text-warning-text" : "text-fg-1",
        )}
      >
        {line.unlimited
          ? t("wending.quota.unlimited")
          : formatAmount(line.remaining, line.unit)}
      </span>
      {line.used !== undefined && (
        <span className="text-xs tabular-nums text-fg-3">
          {t("wending.quota.used")} {formatAmount(line.used, line.unit)}
        </span>
      )}
    </div>
  );
}

/** 顶部 WendingAI 账户条：线路、打码的 Key、账户余额 / Key 剩余额度；刷新、充值、连接设置 */
export function WendingAccountBar() {
  const { t } = useTranslation();
  const { data: provider, isFetched } = useWendingProvider();
  const quotaQuery = useWendingQuota(provider?.apiKey, provider?.baseUrl);
  const { refresh, refreshing } = useRefreshWending();

  if (!isFetched) return null;

  const line = lineForEndpoint(provider?.baseUrl);
  const lineLabel = t(`wending.lines.${line.id}.label`, {
    defaultValue: line.label,
  });
  const quota = quotaQuery.data;
  const loading = quotaQuery.isFetching || refreshing;

  return (
    <div
      className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-border bg-surface px-4 py-2 text-sm"
      data-testid="wending-account-bar"
    >
      <div className="flex items-center gap-2 font-semibold text-fg-1">
        <img src={logo} alt="" className="h-5 w-5 rounded" />
        {BRAND.shortName}
        {provider && (
          <>
            <span
              className="rounded-full bg-action-soft px-2 py-0.5 text-xs font-medium text-action-text"
              title={line.endpoint}
              data-testid="wending-line-badge"
            >
              {lineLabel}
            </span>
            <span className="font-mono text-xs font-normal text-fg-3">
              {maskApiKey(provider.apiKey)}
            </span>
          </>
        )}
      </div>

      {!provider ? (
        <div className="flex flex-1 items-center justify-between gap-2 text-fg-2">
          <span>{t("wending.quota.notConfigured")}</span>
          <Button size="sm" onClick={openWendingOnboarding}>
            {t("wending.quota.configure")}
          </Button>
        </div>
      ) : (
        <>
          {quotaQuery.isLoading && (
            <span className="flex items-center gap-1.5 text-xs text-fg-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("wending.quota.loading")}
            </span>
          )}
          {quota?.status === "ok" && (
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <Amount
                label={t("wending.quota.account")}
                line={quota.account}
                testId="wending-quota-account"
              />
              <Amount
                label={t("wending.quota.key")}
                line={quota.key}
                testId="wending-quota-key"
              />
            </div>
          )}
          {quota && quota.status !== "ok" && (
            <span
              className="flex min-w-0 items-center gap-1.5 text-danger-text"
              title={quota.message}
              data-testid="wending-quota-error"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">
                {quota.status === "invalid"
                  ? t("wending.quota.invalid")
                  : t("wending.quota.error")}
              </span>
              <span className="max-w-[220px] truncate text-xs text-fg-3">
                {quota.message}
              </span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {quota && (
              <span className="mr-1 hidden text-xs text-fg-3 lg:inline">
                {t("wending.quota.lastUpdated", {
                  time: new Date(quota.checkedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </span>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-control-sm w-control-sm"
              disabled={loading}
              onClick={() => void refresh()}
              title={t("wending.quota.refresh")}
              aria-label={t("wending.quota.refresh")}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", loading && "animate-spin")}
              />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void settingsApi.openExternal(line.consoleTopupUrl)
              }
            >
              <Wallet className="h-3.5 w-3.5" />
              {t("wending.quota.topup")}
              <ExternalLink className="h-3 w-3 text-fg-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={openWendingOnboarding}
              data-testid="wending-manage"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {t("wending.quota.manage")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
