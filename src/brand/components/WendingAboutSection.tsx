import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { ExternalLink, Globe, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { settingsApi } from "@/lib/api";
import { BRAND } from "../brand";
import logo from "@/assets/icons/logo.svg";

/** 纯净版“关于”页：只显示 WendingAI 品牌，保留上游 MIT 许可要求的版权声明 */
export function WendingAboutSection() {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  return (
    <div className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <img
          src={logo}
          alt=""
          draggable={false}
          className="h-10 w-10 shrink-0 p-1"
        />
        <div className="min-w-0 flex-1">
          <div className="text-title text-fg-1">{BRAND.productName}</div>
          <div className="text-caption text-fg-2 tabular-nums">
            {t("common.version")} v{version ?? t("common.unknown")}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void settingsApi.openExternal(BRAND.websiteUrl)}
        >
          <Globe className="mr-1 h-3.5 w-3.5" />
          {BRAND.shortName}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void settingsApi.openExternal(BRAND.consoleTokenUrl)}
        >
          <ExternalLink className="mr-1 h-3.5 w-3.5" />
          API Key
        </Button>
      </div>
      <div
        className="space-y-2 px-5 py-4 text-caption text-fg-2"
        data-testid="wending-attribution"
      >
        <p>
          {t("wending.about.basedOn", {
            name: BRAND.upstream.name,
            license: BRAND.upstream.license,
            copyright: BRAND.upstream.copyright,
          })}
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-action hover:underline"
          onClick={() =>
            void settingsApi.openExternal(
              `${BRAND.upstream.repo}/blob/main/LICENSE`,
            )
          }
        >
          <Scale className="h-3.5 w-3.5" />
          {t("wending.about.viewLicense")}
        </button>
      </div>
    </div>
  );
}
