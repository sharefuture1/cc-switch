# WendingAI Switch 交接文档（P0 + P1）

更新时间：2026-11-10 07:40 EST（America/New_York）
仓库：https://github.com/sharefuture1/cc-switch，分支 `wendingai`（基于上游 tag `v4.0.28`）
`main` 只做上游镜像（与 farion1231/cc-switch main 一致），不在上面开发。提交身份：sharefuture1（noreply 邮箱，仓库本地配置）。

## 1. 已完成

### P0 品牌与构建
- 品牌配置集中：`src/brand/brand.ts`（前端）、`src-tauri/src/brand.rs`（Rust）。
  - 产品名 `WendingAI Switch`，界面只显示 “WendingAI”，不出现公司全称
  - bundle id `ai.wending.switch`，deeplink `wendingai://`，数据目录 `~/.wendingai`（与上游 `~/.cc-switch` 隔离，不迁移）
  - 默认端点 `https://api.wending.ai`，日志 `wendingai-switch.log`，UA `WendingAI-Switch/<版本>`
- Logo / 图标：来源为 `https://api.wending.ai/api/status` 返回的 logo（`assets/brand/wendingai-logo-source.png`），据此生成 1024 应用图标后执行 `pnpm tauri icon` 生成全套图标；macOS 托盘模板图、`src/assets/icons/logo.svg`、供应商图标 `wendingai` 同步替换。
- 更新器中立化：`tauri.conf.json` 删除 updater 插件配置、`createUpdaterArtifacts: false`；前端 `BRAND.updatesEnabled = false`，`checkUpdate` 直接返回；上游 R2 同步 workflow 永久禁用。
- 许可：保留 `LICENSE`（MIT，Copyright (c) 2025 Jason Young），新增 `NOTICE`；“关于”页（`WendingAboutSection`）显示 “基于 CC Switch（MIT License，Jason Young）”及许可链接。
- zh / en 全量品牌化：locale 中 “CC Switch” → “WendingAI Switch”，路径类文案（`.cc-switch`、`cc-switch.exe`、日志名）同步替换；品牌专用文案在 `src/brand/i18n.ts`（zh-TW 用 zh，ja / tr 用 en）。

### P1 纯净版 + 粘贴 Key + 额度
- 构建开关 `__WENDING_PURE__`（`vite.config.ts`，默认 true；`WENDING_UPSTREAM_MODE=1` 构建上游界面）。13 个 `*ProviderPresets.ts` 改为惰性函数 + 三元导出，纯净版构建时上游预设整体被 tree-shake 掉。
- 预设白名单：Claude Code / Codex / Gemini CLI 各只有 WendingAI 预设（`src/brand/presets.ts`）；其余应用通过 `BRAND.enabledApps` 隐藏；第三方登录（Auth 中心页）通过 `BRAND.hiddenPages` 隐藏；上游首次运行提示 / 新布局 / 更新摘要关闭。
- 移除推广：`providerForm.partnerPromotion` 文案、合作伙伴图标与中文品牌名、README 赞助区块、`assets/partners`。
- 首次启动引导（`WendingOnboardingDialog`）：粘贴一次 Key → `/api/usage/token/` 验证 → 拉 `/v1/models` 自动选模型 → 写统一供应商 `wendingai` → 同步并切换 Claude / Codex / Gemini 三个子供应商。无效 Key 会在写任何配置之前报错（已实测）。
- 额度栏（`WendingAccountBar`）：打码 Key、账户余额 / Key 余额、加载 / 错误 / 无效状态、最后更新时间、刷新 / 充值 / 更换 Key。
- Rust：`services/wending_quota.rs`（`/api/status` 取 `quota_per_unit`，`/api/usage/token/` 取额度；401/403 → 无效 Key；错误信息用 `without_url()`，不含 Key）；`balance.rs` 对 wending 域名走该分支。
- CI 守卫：`scripts/check-brand.sh`（调用 `scripts/check-brand.mjs` 扫描 `dist/`），已加入 `ci.yml`。
- 上游合并工具：`node scripts/brand-apply.mjs [--dry-run]`，幂等，合并上游后重跑。

## 2. 验证（2026-11-10，本机 Linux x86_64）

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm format:check`（项目无 eslint 脚本，以 prettier 作为 lint） | 通过 |
| `pnpm test:unit` | 通过：295 个文件，3746 通过 / 9 跳过（跳过的是已删除合作伙伴图标的上游用例） |
| `pnpm vitest run tests/brand` | 通过 19 / 19 |
| `cd src-tauri && cargo check` | 通过 |
| `cd src-tauri && cargo test --no-fail-fast` | 修复 2 个硬编码 `.cc-switch` 的用例后，相关用例重跑通过（lib 4548 通过；provider_service 55 通过）；`cargo fmt --check` 通过 |
| `cargo test --lib wending_quota::tests::live_invalid_key -- --ignored` | 通过：api.wending.ai 返回 HTTP 401 “Invalid token”，结果不含 Key |
| `pnpm build:renderer && scripts/check-brand.sh` | 通过（56 个文件 0 命中） |
| 反向对照：`WENDING_UPSTREAM_MODE=1 vite build --outDir /tmp/dist-upstream` 再检查 | 按预期失败（775 处命中），说明检查有效 |
| `pnpm tauri build --bundles deb,appimage` | 通过：`WendingAI Switch_4.0.28_amd64.deb`（18 MB）、`.AppImage`（117 MB） |
| Xvfb 启动 release 二进制（隔离 HOME） | 引导弹窗正常；输入无效 Key 显示“Key 无效或已停用”，未写入 ~/.claude / ~/.codex / ~/.gemini；日志中无 Key。截图：`docs/wendingai/onboarding*.png` |

未做：真实 Key 的端到端（没有真实 Key）；macOS / Windows 打包与签名；`cargo clippy`。

## 3. 安全说明
- Key 明文存储（与上游一致）：`~/.wendingai/cc-switch.db`（SQLite）以及各 CLI 自己的配置文件（`~/.claude/settings.json`、`~/.codex/auth.json`、`~/.gemini/.env`）。CLI 本身需要明文读取。界面只显示打码 Key（≤12 位整串隐藏）。
- deeplink 只注册 `wendingai://`；解析器仍兼容 `ccswitch://` 格式（仅手动 / 测试）。
- 上游远端 push 地址已设为 `DISABLED`，防止误推。

## 4. 仍是占位 / 待确认
- 默认模型：Codex `gpt-5.5`（参考 wending-codex-launcher）；Claude（claude-sonnet-4-5 等）与 Gemini（gemini-2.5-pro）为猜测，引导时会按 `/v1/models` 自动匹配。
- 控制台链接 `/console/token`、`/console/topup` 按 new-api 默认路径推断，需确认。
- 应用图标是“白底圆角 + 黑色 W”自动生成；`dmg-background.png` 未换。正式设计稿到位后替换 `assets/brand/` 并重跑 `pnpm tauri icon`。
- 发布流水线（release.yml）只做了改名，未验证；签名、公证、自有更新源都没配。
- 模型别名（显示友好名称）未做，放 P3。
- 引导弹窗背后的供应商列表仍会显示上游默认的官方卡片（Claude Official 等），可在 P2 隐藏。
- `deplink.html`、`flatpak/`、`docs/user-manual` 仍是上游内容。

## 5. 下一步（P2+）
1. 拿到真实 Key 做端到端：三个 CLI 实际调用、额度刷新、更换 Key。
2. 自有更新源（Tauri updater 公钥 + 自有 latest.json），再打开 `BRAND.updatesEnabled`。
3. macOS / Windows 签名打包；release.yml 去掉上游专属步骤。
4. 隐藏剩余上游入口（官方卡片、MCP / Skills 等高级页按需隐藏）、OAuth 一键授权（如 WendingAI 提供 OAuth / 设备码）。
5. P3：模型别名、额度告警、多 Key。

## 6. 关键决策
- 尽量少改上游：品牌常量集中；批量替换由 `brand-apply.mjs` 生成；纯净版用编译期开关，上游单测仍跑上游模式。
- 数据目录独立，不迁移上游数据，可与 CC Switch 并存。
- lib crate 名保留 `cc_switch_lib`（内部名，不可见），减少合并冲突；包名 / 二进制改为 `wendingai-switch`。

## 7. 路径
- 代码：`/workspace/cc-switch`（分支 wendingai）
- 安装包：`/workspace/artifacts/`（deb、AppImage，未发布）
- 方案：`/workspace/cc-switch-wendingai-plan.md`
- Logo 中间文件：`/workspace/wlogo/`
