import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  ExternalLink,
  Globe,
  KeyRound,
  Loader2,
  LogIn,
  ShieldCheck,
} from "lucide-react";
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
import { Notice } from "@/components/ui/notice";
import { settingsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  WENDING_LINES,
  getWendingLine,
  lineForEndpoint,
  type WendingLine,
} from "../brand";
import {
  setupWendingKey,
  WendingSetupError,
  type SetupResult,
  type SetupStage,
} from "../wending";
import {
  authErrorKey,
  loginWithBrowser,
  probeWendingAuth,
  WendingAuthError,
} from "../auth";
import {
  useOnboardingOpenSignal,
  useWendingProvider,
  WENDING_PROVIDER_QUERY_KEY,
  WENDING_QUOTA_QUERY_KEY,
} from "./useWendingAccount";
import logo from "@/assets/icons/logo.svg";

type Busy = SetupStage | "probing" | "browser" | null;

function useLineText() {
  const { t } = useTranslation();
  return (line: WendingLine) => ({
    label: t(`wending.lines.${line.id}.label`, { defaultValue: line.label }),
    description: t(`wending.lines.${line.id}.description`, {
      defaultValue: line.description,
    }),
  });
}

/** 线路选择：两张可点选的卡片 */
function LinePicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const text = useLineText();
  return (
    <div
      role="radiogroup"
      aria-label={t("wending.lines.title")}
      className="grid grid-cols-2 gap-2"
    >
      {WENDING_LINES.map((line) => {
        const selected = line.id === value;
        const { label, description } = text(line);
        return (
          <button
            key={line.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            data-testid={`wending-line-${line.id}`}
            onClick={() => onChange(line.id)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-control border px-3 py-2.5 text-left transition-colors disabled:opacity-60",
              selected
                ? "border-action bg-action-soft"
                : "border-border-strong bg-surface hover:bg-subtle",
            )}
          >
            <span className="flex w-full items-center justify-between text-sm font-semibold text-fg-1">
              {label}
              {selected && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-action-text" />
              )}
            </span>
            <span className="text-xs leading-snug text-fg-3">
              {description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 连接 WendingAI：选择线路 → 一键登录（主线路，服务端已开放时）或粘贴 API Key
 * → 验证 → 自动写好 Claude Code / Codex / Gemini CLI。
 * 尚未配置时自动弹出；也可通过 openWendingOnboarding() 手动打开（切换线路 / 更换 Key）。
 */
export function WendingOnboardingDialog() {
  const { t } = useTranslation();
  const lineText = useLineText();
  const queryClient = useQueryClient();
  const { data: provider, isFetched } = useWendingProvider();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [lineId, setLineId] = useState<string>(WENDING_LINES[0].id);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  /** 当前进行中的方式：粘贴 Key / 浏览器一键登录 */
  const [via, setVia] = useState<"key" | "browser" | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const line = getWendingLine(lineId);

  useEffect(() => {
    if (isFetched && !provider && !dismissed) setOpen(true);
  }, [isFetched, provider, dismissed]);

  useOnboardingOpenSignal(
    useCallback(() => {
      setError(null);
      setApiKey("");
      setLineId(lineForEndpoint(provider?.baseUrl).id);
      setOpen(true);
    }, [provider?.baseUrl]),
  );

  // 服务端是否已开放一键登录（未开放时只显示粘贴 Key）
  const probe = useQuery({
    queryKey: ["wending", "auth-probe", line.endpoint],
    queryFn: () => probeWendingAuth(line.endpoint),
    enabled: open && line.oauth,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const oauthAvailable = line.oauth && probe.data?.available === true;
  const probing = line.oauth && probe.isLoading;

  const finish = async (result: SetupResult) => {
    queryClient.setQueryData(WENDING_QUOTA_QUERY_KEY, result.quota);
    await queryClient.invalidateQueries({
      queryKey: WENDING_PROVIDER_QUERY_KEY,
    });
    await queryClient.invalidateQueries();
    if (result.failedApps.length > 0) {
      toast.warning(
        t("wending.onboarding.partial", {
          apps: result.failedApps.map((f) => f.app).join(", "),
        }),
      );
    } else if (result.appsWithoutModels.length > 0) {
      toast.warning(
        t("wending.onboarding.modelsMissing", {
          apps: result.appsWithoutModels.map(appName).join("、"),
        }),
        { duration: 10_000 },
      );
    } else {
      toast.success(
        t("wending.onboarding.success", { line: lineText(line).label }),
      );
    }
    setApiKey("");
    setOpen(false);
  };

  const describeSetupError = (e: unknown) => {
    if (e instanceof WendingSetupError) {
      if (e.kind === "invalid")
        return line.sharesMainAccount
          ? t("wending.onboarding.invalidKey")
          : t("wending.onboarding.invalidKeyLine", {
              line: lineText(line).label,
            });
      if (e.kind === "empty") return t("wending.onboarding.emptyKey");
      return t("wending.onboarding.networkError", { error: e.message });
    }
    return e instanceof Error ? e.message : String(e);
  };

  const submitKey = async () => {
    setError(null);
    if (!apiKey.trim()) {
      setError(t("wending.onboarding.emptyKey"));
      return;
    }
    setVia("key");
    try {
      await finish(await setupWendingKey(apiKey, line.endpoint, setBusy));
    } catch (e) {
      setError(describeSetupError(e));
    } finally {
      setBusy(null);
      setVia(null);
    }
  };

  const loginInBrowser = async () => {
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setVia("browser");
    setBusy("browser");
    try {
      const key = await loginWithBrowser(line.endpoint, {
        signal: controller.signal,
      });
      await finish(await setupWendingKey(key, line.endpoint, setBusy));
    } catch (e) {
      if (e instanceof WendingAuthError) {
        if (e.code !== "cancelled")
          setError(t(`wending.auth.errors.${authErrorKey(e.code)}`));
      } else {
        setError(describeSetupError(e));
      }
    } finally {
      abortRef.current = null;
      setBusy(null);
      setVia(null);
    }
  };

  const cancelBrowser = () => abortRef.current?.abort();
  const working = busy !== null && busy !== "probing";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (working) return;
        setOpen(next);
        if (!next) setDismissed(true);
      }}
    >
      <DialogContent className="max-w-lg" zIndex="top">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <img src={logo} alt="" className="h-7 w-7 rounded-md" />
            {t("wending.onboarding.title")}
          </DialogTitle>
          <DialogDescription>
            {t("wending.onboarding.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-3">
              <Globe className="h-3.5 w-3.5" />
              {t("wending.lines.title")}
            </h3>
            <LinePicker
              value={lineId}
              disabled={working}
              onChange={(id) => {
                setLineId(id);
                setError(null);
              }}
            />
          </section>

          {line.oauth && (probing || oauthAvailable) && (
            <section className="space-y-2" data-testid="wending-oauth">
              {busy === "browser" ? (
                <div className="flex items-start gap-3 rounded-panel bg-subtle px-4 py-3">
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-action-text" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium text-fg-1">
                      {t("wending.auth.waitingTitle")}
                    </p>
                    <p className="text-xs leading-relaxed text-fg-2">
                      {t("wending.auth.waitingDesc")}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={cancelBrowser}>
                    {t("wending.auth.cancel")}
                  </Button>
                </div>
              ) : (
                <Button
                  size="lg"
                  className="w-full"
                  disabled={working || probing}
                  onClick={() => void loginInBrowser()}
                  data-testid="wending-oauth-login"
                >
                  {probing || via === "browser" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="h-4 w-4" />
                  )}
                  {probing
                    ? t("wending.auth.checking")
                    : via === "browser"
                      ? t("wending.onboarding.configuring")
                      : t("wending.auth.login")}
                </Button>
              )}
              <p className="flex items-center justify-center gap-1 text-xs text-fg-3">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t("wending.auth.hint")}
              </p>
            </section>
          )}

          {line.oauth && !probing && !oauthAvailable && (
            <p
              className="text-xs leading-relaxed text-fg-3"
              data-testid="wending-oauth-unavailable"
            >
              {probe.data?.reason === "network"
                ? t("wending.auth.unavailableNetwork")
                : t("wending.auth.unavailable")}
            </p>
          )}

          {line.oauth && (probing || oauthAvailable) && (
            <div className="flex items-center gap-3 text-xs text-fg-3">
              <span className="h-px flex-1 bg-border" />
              {t("wending.onboarding.orPaste")}
              <span className="h-px flex-1 bg-border" />
            </div>
          )}

          {!line.sharesMainAccount && (
            <Notice
              tone="neutral"
              title={t("wending.lines.separateTitle", {
                line: lineText(line).label,
              })}
            >
              {t("wending.lines.separateDesc", {
                host: new URL(line.endpoint).host,
              })}
            </Notice>
          )}

          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submitKey();
            }}
          >
            <div className="flex items-center justify-between">
              <label
                className="text-sm font-medium text-fg-1"
                htmlFor="wending-api-key"
              >
                {t("wending.onboarding.keyLabel")}
              </label>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-action-text hover:underline"
                onClick={() =>
                  void settingsApi.openExternal(line.consoleTokenUrl)
                }
              >
                {t("wending.onboarding.getKey")}
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
                <Input
                  id="wending-api-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className="pl-8 font-mono"
                  placeholder={t("wending.onboarding.keyPlaceholder")}
                  value={apiKey}
                  disabled={working}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                variant={oauthAvailable ? "outline" : "default"}
                disabled={working}
                data-testid="wending-key-submit"
              >
                {via === "key" && <Loader2 className="h-4 w-4 animate-spin" />}
                {via === "key" && busy === "verifying"
                  ? t("wending.onboarding.verifying")
                  : via === "key" && busy === "configuring"
                    ? t("wending.onboarding.configuring")
                    : t("wending.onboarding.submit")}
              </Button>
            </div>
            <p className="text-xs text-fg-3">
              {t("wending.onboarding.endpoint")}:{" "}
              <span className="font-mono">{line.endpoint}</span>
            </p>
          </form>

          {error && (
            <div role="alert" data-testid="wending-onboarding-error">
              <Notice tone="danger" title={error} />
            </div>
          )}

          <p className="text-xs leading-relaxed text-fg-3">
            {t("wending.onboarding.securityNote")}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={working}
            onClick={() => {
              setOpen(false);
              setDismissed(true);
            }}
          >
            {provider
              ? t("wending.onboarding.close")
              : t("wending.onboarding.later")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function appName(app: string): string {
  switch (app) {
    case "claude":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "gemini":
      return "Gemini CLI";
    default:
      return app;
  }
}
