import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useUpdate } from "@/contexts/UpdateContext";
import { providersApi, settingsApi } from "@/lib/api";
import { extractErrorMessage } from "@/utils/errorUtils";
import { BRAND } from "../brand";

export interface WendingUpdatePanelProps {
  isPortable?: boolean;
  autoUpdateEnabled?: boolean;
  onAutoSave?: (updates: { autoUpdateEnabled: boolean }) => Promise<boolean>;
}

/**
 * 没有发布 / 没有 latest.json（例如还没发正式版）时 updater 报的是取不到更新清单，
 * 这不算故障，界面上按“暂无更新”处理。
 */
export function isNoReleaseError(message: string): boolean {
  return /valid release json|404|not found|status code|could not fetch/i.test(
    message,
  );
}

/** 关于页里的“软件更新”：检查更新、一键更新并重启、自动下载开关 */
export function WendingUpdatePanel({
  isPortable = false,
  autoUpdateEnabled = false,
  onAutoSave,
}: WendingUpdatePanelProps) {
  const { t } = useTranslation();
  const {
    hasUpdate,
    updateInfo,
    checkUpdate,
    resetDismiss,
    isChecking,
    autoUpdateSupported,
    refreshAutoUpdate,
    readyUpdate,
  } = useUpdate();
  const [installing, setInstalling] = useState(false);

  const openReleases = useCallback(() => {
    void settingsApi.openExternal(BRAND.releasesUrl);
  }, []);

  const handleCheck = useCallback(async () => {
    try {
      const available = await checkUpdate();
      if (!available) toast.success(t("wending.update.upToDate"));
    } catch (error) {
      const message = extractErrorMessage(error) || String(error);
      if (isNoReleaseError(message)) {
        toast.info(t("wending.update.noRelease"));
      } else {
        toast.error(t("wending.update.failed"), { description: message });
      }
    }
  }, [checkUpdate, t]);

  const handleInstall = useCallback(async () => {
    if (isPortable) {
      openReleases();
      return;
    }
    setInstalling(true);
    try {
      resetDismiss();
      const installed = await settingsApi.installUpdateAndRestart();
      if (!installed) toast.success(t("wending.update.upToDate"));
    } catch (error) {
      toast.error(t("wending.update.installFailed"), {
        description: extractErrorMessage(error) || undefined,
        action: {
          label: t("wending.update.openReleases"),
          onClick: openReleases,
        },
      });
    } finally {
      setInstalling(false);
    }
  }, [isPortable, openReleases, resetDismiss, t]);

  const handleAutoChange = useCallback(
    async (enabled: boolean) => {
      if (!onAutoSave) return;
      if (!(await onAutoSave({ autoUpdateEnabled: enabled }))) return;
      await refreshAutoUpdate();
      providersApi.updateTrayMenu().catch(console.error);
      if (enabled) {
        settingsApi.downloadAppUpdate().catch((error) => {
          console.warn("[wending] background update download failed", error);
        });
      }
    },
    [onAutoSave, refreshAutoUpdate],
  );

  const version = readyUpdate?.version ?? updateInfo?.availableVersion ?? "";
  const notes = readyUpdate?.notes ?? updateInfo?.notes;

  return (
    <div className="space-y-3 px-5 py-4" data-testid="wending-update-panel">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-body font-medium text-fg-1">
            {t("wending.update.title")}
          </div>
          {hasUpdate && version && (
            <div className="text-caption text-action">
              {t("wending.update.available", { version })}
            </div>
          )}
        </div>
        {hasUpdate ? (
          <Button
            type="button"
            variant="solid"
            size="regular"
            onClick={() => void handleInstall()}
            disabled={installing}
          >
            {installing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {installing
              ? t("wending.update.installing")
              : t("wending.update.install", { version })}
          </Button>
        ) : (
          <Button
            type="button"
            variant="neutral"
            size="regular"
            onClick={() => void handleCheck()}
            disabled={isChecking}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isChecking ? "animate-spin" : ""}`}
            />
            {isChecking
              ? t("wending.update.checking")
              : t("wending.update.check")}
          </Button>
        )}
        <Button
          type="button"
          variant="quiet"
          size="compact"
          onClick={openReleases}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t("wending.update.openReleases")}
        </Button>
      </div>
      {hasUpdate && notes && (
        <p className="line-clamp-3 text-caption text-fg-2">{notes}</p>
      )}
      {onAutoSave && (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 text-caption text-fg-2">
            <div className="text-body text-fg-1">
              {t("wending.update.auto")}
            </div>
            {autoUpdateSupported
              ? t("wending.update.autoHelp")
              : t("wending.update.autoUnsupported")}
          </div>
          <Switch
            checked={autoUpdateEnabled && autoUpdateSupported}
            disabled={!autoUpdateSupported}
            onCheckedChange={(value) => void handleAutoChange(value)}
            aria-label={t("wending.update.auto")}
          />
        </div>
      )}
    </div>
  );
}
