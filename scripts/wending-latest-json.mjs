#!/usr/bin/env node
/**
 * 生成 Tauri updater 用的 latest.json（WendingAI Switch）。
 *
 * 用法：
 *   node scripts/wending-latest-json.mjs --dir installers --version 4.0.32 \
 *     --base-url https://github.com/sharefuture1/cc-switch/releases/download/wendingai-v4.0.32 \
 *     [--notes "..."] [--out installers/latest.json]
 *
 * 在 --dir 里按文件名找带 .sig 的更新包（CI 的 Collect installers 步骤负责命名）：
 *   *-Windows-x64-setup.exe(.sig)      → windows-x86_64 / windows-x86_64-nsis
 *   *-Windows-x64.msi(.sig)            → windows-x86_64-msi
 *   *-macOS-universal.app.tar.gz(.sig) → darwin-aarch64 / darwin-x86_64（及 -app）
 *   *-Linux-x64.AppImage(.sig)         → linux-x86_64 / linux-x86_64-appimage
 *   *-Linux-arm64.AppImage(.sig)       → linux-aarch64 / linux-aarch64-appimage
 * 没有 .sig 的文件忽略（未配置签名密钥时 CI 不会生成）。
 */
import fs from "node:fs";
import path from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const RULES = [
  [/-Windows-x64-setup\.exe$/, ["windows-x86_64-nsis", "windows-x86_64"]],
  [/-Windows-x64\.msi$/, ["windows-x86_64-msi"]],
  [
    /-macOS-universal\.app\.tar\.gz$/,
    [
      "darwin-aarch64-app",
      "darwin-x86_64-app",
      "darwin-aarch64",
      "darwin-x86_64",
    ],
  ],
  [/-macOS-aarch64\.app\.tar\.gz$/, ["darwin-aarch64-app", "darwin-aarch64"]],
  [/-macOS-x64\.app\.tar\.gz$/, ["darwin-x86_64-app", "darwin-x86_64"]],
  [/-Linux-x64\.AppImage$/, ["linux-x86_64-appimage", "linux-x86_64"]],
  [/-Linux-arm64\.AppImage$/, ["linux-aarch64-appimage", "linux-aarch64"]],
];

export function buildLatestJson({
  files,
  readSig,
  version,
  baseUrl,
  notes,
  pubDate,
}) {
  const platforms = {};
  for (const file of [...files].sort()) {
    if (!files.includes(`${file}.sig`)) continue;
    const rule = RULES.find(([re]) => re.test(file));
    if (!rule) continue;
    const entry = {
      signature: readSig(`${file}.sig`).trim(),
      url: `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(file)}`,
    };
    for (const key of rule[1]) {
      // 安装器专用键优先于通用键：通用键只在还没有时补上
      if (!platforms[key]) platforms[key] = entry;
    }
  }
  return {
    version: version.replace(/^v/, ""),
    notes: notes ?? "",
    pub_date: pubDate ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    platforms,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = arg("dir", "installers");
  const version = arg("version");
  const baseUrl = arg("base-url");
  if (!version || !baseUrl) {
    console.error("--version and --base-url are required");
    process.exit(2);
  }
  const files = fs.readdirSync(dir);
  const json = buildLatestJson({
    files,
    readSig: (f) => fs.readFileSync(path.join(dir, f), "utf8"),
    version,
    baseUrl,
    notes: arg("notes", `WendingAI Switch ${version}`),
  });
  const count = Object.keys(json.platforms).length;
  if (count === 0) {
    console.error("no signed updater bundles found (missing .sig files?)");
    process.exit(1);
  }
  const out = arg("out", path.join(dir, "latest.json"));
  fs.writeFileSync(out, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`latest.json: ${count} platform keys → ${out}`);
}
