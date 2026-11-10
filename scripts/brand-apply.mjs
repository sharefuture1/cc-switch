#!/usr/bin/env node
/**
 * WendingAI 品牌替换脚本（可重复执行、幂等）。
 *
 * 每次合并上游 CC Switch 之后运行一次：
 *   node scripts/brand-apply.mjs
 *
 * 做的事情：
 *  1. i18n：删除 `providerForm.partnerPromotion`（合作伙伴优惠文案）；把 “CC Switch” 换成产品名。
 *  2. 前端 / Rust 源码中的用户可见产品名 “CC Switch” → 产品名（src/brand、LICENSE、NOTICE 除外）。
 *  3. 图标：删除合作中转站 / 推广品牌的图标（index.ts、metadata.ts 中的条目和图片文件）。
 *
 * 品牌常量见 src/brand/brand.ts 与 src-tauri/src/brand.rs。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCT_NAME = "WendingAI Switch";
const UPSTREAM_NAME = "CC Switch";
const PARTNER_PRESET_NAME_KEYS = ["ucloud", "ucloudCoding", "shengsuanyun"];
const LOCALE_PATH_REPLACEMENTS = [
  ["cc-switch.exe", "wendingai-switch.exe"],
  ["cc-switch.log", "wendingai-switch.log"],
  ["my-cc-switch-bucket", "my-wendingai-bucket"],
  ["cc-switch-{{key}}", "wendingai-{{key}}"],
  ["~/.cc-switch", "~/.wendingai"],
  ["\\\\.cc-switch", "\\\\.wendingai"],
  [" .cc-switch", " .wendingai"],
];
const DRY = process.argv.includes("--dry-run");

/** 合作中转站 / 推广品牌图标（不含模型厂商和工具本身的图标） */
const PARTNER_ICON_KEYS = [
  // 内联 SVG
  "9527code",
  "aicodemirror",
  "aicodewith",
  "aicoding",
  "aicoming",
  "aigocode",
  "amux",
  "botcf",
  "commandcode",
  "crazyrouter",
  "cubence",
  "zenmux",
  "packycode",
  "soleapi",
  "yylx",
  "rc",
  "lioncc",
  "aihubmix",
  "micu",
  "ucloud",
  "sssaicode",
  "catcoder",
  "jiekou",
  "moark",
  "therouter",
  "dit",
  "haoai",
  "buytoken",
  "vapi",
  "ppio",
  // 位图
  "88api",
  "alltokens",
  "alltokens-si",
  "alltokensSi",
  "a6api",
  "apikeyfun",
  "apinebula",
  "atlascloud",
  "ccsub",
  "claudeapi",
  "claudecn",
  "cherryin",
  "code0",
  "dmxapi",
  "eflowcode",
  "etok",
  "everyapi",
  "fenno",
  "fluxa",
  "genesis",
  "grooroute",
  "ikuncode",
  "modelflare",
  "nekocode",
  "openmodel",
  "ospreyai",
  "pateway",
  "pipellm",
  "qiniu",
  "relaxcode",
  "runapi",
  "runtoken",
  "tokenplus",
  "tokenflux",
  "shengsuanyun",
  "soruxgpt",
  "soshow",
  "subrouter",
  "sudocode",
  "sudocode-us",
  "sudocodeUs",
  "teamorouter",
  "tuzi",
  "unity2",
  "xycai",
  "zetaapi",
  "byteplus",
];

let changed = 0;
function write(file, next, prev) {
  if (next === prev) return;
  changed++;
  console.log(`  updated ${path.relative(ROOT, file)}`);
  if (!DRY) fs.writeFileSync(file, next);
}

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "target", "dist", "brand"].includes(entry.name))
        continue;
      walk(p, exts, out);
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(p);
    }
  }
  return out;
}

// ── 1. i18n ────────────────────────────────────────────────
console.log("[brand] i18n");
for (const file of walk(path.join(ROOT, "src/i18n/locales"), [".json"])) {
  const prev = fs.readFileSync(file, "utf8");
  const json = JSON.parse(prev);
  if (json.providerForm && json.providerForm.partnerPromotion) {
    delete json.providerForm.partnerPromotion;
  }
  // 合作伙伴的中文品牌名（预设名称翻译）；纯净版没有这些预设，上游模式下回退为英文名
  if (json.providerForm && json.providerForm.presets) {
    for (const k of PARTNER_PRESET_NAME_KEYS)
      delete json.providerForm.presets[k];
  }
  let next = JSON.stringify(json, null, 2) + "\n";
  next = next.split(UPSTREAM_NAME).join(PRODUCT_NAME);
  // 用户可见的路径 / 文件名（与 src-tauri/src/brand.rs 保持一致）
  for (const [from, to] of LOCALE_PATH_REPLACEMENTS)
    next = next.split(from).join(to);
  write(file, next, prev);
}

// ── 2. 源码中的产品名 ──────────────────────────────────────
console.log("[brand] source strings");
const sourceFiles = [
  ...walk(path.join(ROOT, "src"), [".ts", ".tsx", ".html"]),
  ...walk(path.join(ROOT, "src-tauri/src"), [".rs"]),
  ...walk(path.join(ROOT, "src-tauri/tests"), [".rs"]),
  ...walk(path.join(ROOT, "tests"), [".ts", ".tsx"]),
];
for (const file of sourceFiles) {
  const prev = fs.readFileSync(file, "utf8");
  if (!prev.includes(UPSTREAM_NAME)) continue;
  if (file.endsWith(path.join("src-tauri", "src", "brand.rs"))) continue;
  write(file, prev.split(UPSTREAM_NAME).join(PRODUCT_NAME), prev);
}

// ── 3. 合作推广图标 ────────────────────────────────────────
console.log("[brand] partner icons");
const iconDir = path.join(ROOT, "src/icons/extracted");
const keySet = new Set(PARTNER_ICON_KEYS);
const keyPattern = (k) => (/^[a-z_$][\w$]*$/i.test(k) ? k : `"${k}"`);
{
  const file = path.join(iconDir, "index.ts");
  const prev = fs.readFileSync(file, "utf8");
  const removedFiles = [];
  const lines = prev.split("\n").filter((line) => {
    // import _xxx from "./xxx.png";
    const imp = line.match(/^import (_[\w$]+) from "\.\/([^"?]+)(\?url)?";$/);
    if (imp) {
      const varName = imp[1].slice(1);
      const base = imp[2]
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]icon$/i, "")
        .replace(/_icon$/i, "");
      const hit =
        keySet.has(varName) ||
        keySet.has(base) ||
        keySet.has(base.toLowerCase()) ||
        keySet.has(imp[2].replace(/\.[^.]+$/, "").toLowerCase());
      if (hit && !/wendingai/i.test(imp[2])) {
        removedFiles.push(imp[2]);
        return false;
      }
      return true;
    }
    // map entries:  key: _var,   or   key: `<svg ...>`,
    const entry = line.match(/^ {2}("?)([\w-]+)\1: (`|_)/);
    if (entry && keySet.has(entry[2])) return false;
    return true;
  });
  const next = lines.join("\n");
  write(file, next, prev);
  for (const f of removedFiles) {
    const p = path.join(iconDir, f);
    if (fs.existsSync(p)) {
      console.log(`  removed ${path.relative(ROOT, p)}`);
      if (!DRY) fs.unlinkSync(p);
      changed++;
    }
  }
}
{
  const file = path.join(iconDir, "metadata.ts");
  const prev = fs.readFileSync(file, "utf8");
  const lines = prev.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^ {2}("?)([\w-]+)\1: \{$/);
    if (m && keySet.has(m[2])) {
      // 跳过整块，直到同级的 "  },"
      while (i < lines.length && lines[i] !== "  },") i++;
      continue;
    }
    out.push(lines[i]);
  }
  write(file, out.join("\n"), prev);
}

console.log(`[brand] done, ${changed} change(s)${DRY ? " (dry run)" : ""}`);
void keyPattern;
