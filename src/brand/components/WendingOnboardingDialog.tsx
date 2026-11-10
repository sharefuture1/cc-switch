import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { settingsApi } from "@/lib/api";
import { BRAND } from "../brand";
import {
  setupWendingKey,
  WendingSetupError,
  type SetupStage,
} from "../wending";
import {
  useOnboardingOpenSignal,
  useWendingProvider,
  WENDING_PROVIDER_QUERY_KEY,
  WENDING_QUOTA_QUERY_KEY,
} from "./useWendingAccount";
import logo from "@/assets/icons/logo.svg";

/**
 * 首次启动引导：粘贴一次 WendingAI API Key → 验证 → 自动写好 Claude Code / Codex / Gemini CLI。
 * 尚未配置时自动弹出；也可通过 openWendingOnboarding() 手动打开（更换 Key）。
 */
export function WendingOnboardingDialog() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: provider, isFetched } = useWendingProvider();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [stage, setStage] = useState<SetupStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isFetched && !provider && !dismissed) setOpen(true);
  }, [isFetched, provider, dismissed]);

  useOnboardingOpenSignal(
    useCallback(() => {
      setError(null);
      setApiKey("");
      setOpen(true);
    }, []),
  );

  const busy = stage !== null;

  const submit = async () => {
    setError(null);
    if (!apiKey.trim()) {
      setError(t("wending.onboarding.emptyKey"));
      return;
    }
    try {
      const result = await setupWendingKey(
        apiKey,
        BRAND.defaultEndpoint,
        setStage,
      );
      queryClient.setQueryData(WENDING_QUOTA_QUERY_KEY, result.quota);
      await queryClient.invalidateQueries({
        queryKey: WENDING_PROVIDER_QUERY_KEY,
      });
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      await queryClient.invalidateQueries();
      if (result.failedApps.length > 0) {
        toast.warning(
          t("wending.onboarding.partial", {
            apps: result.failedApps.map((f) => f.app).join(", "),
          }),
        );
      } else {
        toast.success(t("wending.onboarding.success"));
      }
      setApiKey("");
      setOpen(false);
    } catch (e) {
      if (e instanceof WendingSetupError) {
        if (e.kind === "invalid") setError(t("wending.onboarding.invalidKey"));
        else if (e.kind === "empty") setError(t("wending.onboarding.emptyKey"));
        else
          setError(t("wending.onboarding.networkError", { error: e.message }));
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setStage(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) setDismissed(true);
      }}
    >
      <DialogContent className="max-w-md" zIndex="top">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <img src={logo} alt="" className="h-6 w-6" />
            {t("wending.onboarding.title")}
          </DialogTitle>
          <DialogDescription>
            {t("wending.onboarding.subtitle")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3 px-6 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label
            className="block text-sm font-medium text-fg-1"
            htmlFor="wending-api-key"
          >
            {t("wending.onboarding.keyLabel")}
          </label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
            <Input
              id="wending-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="pl-8"
              placeholder={t("wending.onboarding.keyPlaceholder")}
              value={apiKey}
              disabled={busy}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-fg-3">
            <span>
              {t("wending.onboarding.endpoint")}: {BRAND.defaultEndpoint}
            </span>
            <button
              type="button"
              className="text-action hover:underline"
              onClick={() =>
                void settingsApi.openExternal(BRAND.consoleTokenUrl)
              }
            >
              {t("wending.onboarding.getKey")}
            </button>
          </div>
          {error && (
            <p
              role="alert"
              className="text-sm text-danger"
              data-testid="wending-onboarding-error"
            >
              {error}
            </p>
          )}
          <p className="text-xs leading-relaxed text-fg-3">
            {t("wending.onboarding.securityNote")}
          </p>
          <button type="submit" hidden aria-hidden="true" />
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              setDismissed(true);
            }}
          >
            {t("wending.onboarding.later")}
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {stage === "verifying"
              ? t("wending.onboarding.verifying")
              : stage === "configuring"
                ? t("wending.onboarding.configuring")
                : t("wending.onboarding.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
