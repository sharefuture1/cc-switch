import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { buildLatestJson } from "../../scripts/wending-latest-json.mjs";

describe("wending-latest-json", () => {
  it("maps signed bundles to Tauri updater platform keys", () => {
    const files = [
      "WendingAI-Switch-4.0.32-Windows-x64-setup.exe",
      "WendingAI-Switch-4.0.32-Windows-x64-setup.exe.sig",
      "WendingAI-Switch-4.0.32-Windows-x64.msi",
      "WendingAI-Switch-4.0.32-Windows-x64.msi.sig",
      "WendingAI-Switch-4.0.32-macOS-universal.app.tar.gz",
      "WendingAI-Switch-4.0.32-macOS-universal.app.tar.gz.sig",
      "WendingAI-Switch-4.0.32-macOS-universal.dmg",
      "WendingAI-Switch-4.0.32-Linux-x64.AppImage",
      "WendingAI-Switch-4.0.32-Linux-x64.AppImage.sig",
      "WendingAI-Switch-4.0.32-Linux-x64.deb",
      "WendingAI-Switch-4.0.32-Linux-arm64.AppImage",
    ];
    const json = buildLatestJson({
      files,
      readSig: (f: string) => `sig-of-${f}\n`,
      version: "v4.0.32",
      baseUrl: "https://example.test/download/wendingai-v4.0.32/",
      notes: "n",
      pubDate: "2026-11-14T00:00:00Z",
    });
    expect(json.version).toBe("4.0.32");
    expect(Object.keys(json.platforms).sort()).toEqual([
      "darwin-aarch64",
      "darwin-aarch64-app",
      "darwin-x86_64",
      "darwin-x86_64-app",
      "linux-x86_64",
      "linux-x86_64-appimage",
      "windows-x86_64",
      "windows-x86_64-msi",
      "windows-x86_64-nsis",
    ]);
    // 通用 windows 键指向 NSIS 安装器
    expect(json.platforms["windows-x86_64"].url).toBe(
      "https://example.test/download/wendingai-v4.0.32/WendingAI-Switch-4.0.32-Windows-x64-setup.exe",
    );
    expect(json.platforms["linux-x86_64"].signature).toBe(
      "sig-of-WendingAI-Switch-4.0.32-Linux-x64.AppImage.sig",
    );
  });
});
