#!/usr/bin/env node
/**
 * 品牌检查：扫描前端构建产物（默认 dist/），发现上游品牌、合作推广、返利链接时失败。
 *
 * 用法：node scripts/check-brand.mjs [distDir]
 * 允许的例外：开源署名（MIT 许可要求保留的版权声明附近的文本）。
 */
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve(process.argv[2] || "dist");
if (!fs.existsSync(dist)) {
  console.error(
    `[check-brand] ${dist} not found, run the frontend build first`,
  );
  process.exit(2);
}

/** 不允许出现的内容（用户可见的上游品牌、推广、返利） */
const FORBIDDEN = [
  { name: "upstream product name", re: /CC[ -]?Switch/g },
  { name: "upstream domain", re: /ccswitch\.io/gi },
  { name: "upstream deep link", re: /ccswitch:\/\//gi },
  { name: "upstream repo", re: /farion1231/gi },
  { name: "user-visible cc-switch", re: /cc-switch(?![-_.:/][a-z0-9])/gi },
  { name: "affiliate link", re: /[?&]aff=/gi },
  { name: "referral link", re: /\/(register|signup)\?(ref|invite|code)=/gi },
  { name: "promotion i18n", re: /"?partnerPromotion"?\s*:\s*\{/g },
  {
    name: "partner brand",
    re: /PackyCode|packyapi|APINEBULA|TokenPlus|tokenplus\.cn|A6API|SudoCode|Cubence|AICodeMirror|RightCode|CrazyRouter|DMXAPI|AIGoCode|TeamoRouter|CCSub|Modelflare|AllTokens|BuyToken|OspreyAI|SoleAPI|RunAPI|APIKEY\.FUN|PatewayAI|ClaudeCN|GrooRoute|XycAi|9527 ?CODE|ZetaAPI|AICoding|SSAI ?Code|Fenno\.ai|88API|ShengSuanYun|胜算云|优云智算/g,
  },
];

/** 匹配附近出现这些文本时视为开源署名 / 许可证，允许保留 */
const ALLOW_CONTEXT = [
  /Jason Young/,
  /MIT License/,
  /upstream\s*:\s*\{/,
  // 上游预设的内部查找表（家族名 / 搜索别名）。纯净版没有对应预设，
  // 这些条目永远不会渲染；放行它们可避免修改上游类型定义。
  /sudocode:\{name:"SudoCode"\}/,
  /"优云智算Coding Plan":"ucloud"/,
];

/** 以 cc-switch 开头的内部存储键（localStorage 等）不是用户可见文本 */
const ALLOW_MATCH = [/^cc-switch$/i];

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
})(dist);

const problems = [];
for (const file of files) {
  const rel = path.relative(dist, file);
  // 文件名本身（例如合作伙伴图标）
  for (const rule of FORBIDDEN) {
    rule.re.lastIndex = 0;
    if (rule.re.test(path.basename(file))) {
      problems.push({
        file: rel,
        rule: rule.name,
        sample: `(file name) ${path.basename(file)}`,
      });
    }
  }
  if (!/\.(js|mjs|css|html|json|txt|svg|map)$/i.test(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const rule of FORBIDDEN) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text))) {
      const start = Math.max(0, m.index - 160);
      const ctx = text.slice(start, m.index + m[0].length + 160);
      if (ALLOW_CONTEXT.some((a) => a.test(ctx))) continue;
      if (rule.name === "user-visible cc-switch") {
        // 内部 ID / 存储键 / 事件名等不算用户可见：前后紧贴引号里的标识符
        const before = text[m.index - 1] || "";
        const after = text[m.index + m[0].length] || "";
        if (
          (before === '"' || before === "'" || before === "`") &&
          after === before
        ) {
          // 单独的 "cc-switch" 字符串常被用作内部标识（托盘 ID、comp_hash 等）
          if (ALLOW_MATCH.some((a) => a.test(m[0]))) continue;
        }
      }
      problems.push({
        file: rel,
        rule: rule.name,
        sample: text
          .slice(Math.max(0, m.index - 50), m.index + m[0].length + 50)
          .replace(/\s+/g, " "),
      });
    }
  }
}

if (problems.length) {
  const byRule = {};
  for (const p of problems) byRule[p.rule] = (byRule[p.rule] || 0) + 1;
  console.error(`[check-brand] FAILED: ${problems.length} finding(s)`);
  console.error(byRule);
  for (const p of problems.slice(0, 40)) {
    console.error(` - [${p.rule}] ${p.file}: …${p.sample}…`);
  }
  if (problems.length > 40)
    console.error(` … and ${problems.length - 40} more`);
  process.exit(1);
}
console.log(
  `[check-brand] OK: scanned ${files.length} file(s) in ${path.relative(process.cwd(), dist) || dist}`,
);
