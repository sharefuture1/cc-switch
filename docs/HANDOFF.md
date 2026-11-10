# WendingAI Switch 交接文档（P0 + P1）

更新时间：2026-11-10 08:08 EST（America/New_York）
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
| `cd src-tauri && cargo test --no-fail-fast` | 通过：全部测试二进制共 4765 通过 / 0 失败 / 14 忽略（含 2 个原先硬编码 `.cc-switch` 的用例，已改用 `brand::DATA_DIR_NAME`）；`cargo fmt --check` 通过 |
| `cargo test --lib wending_quota::tests::live_invalid_key -- --ignored` | 通过：api.wending.ai 返回 HTTP 401 “Invalid token”，结果不含 Key |
| `pnpm build:renderer && scripts/check-brand.sh` | 通过（56 个文件 0 命中） |
| 反向对照：`WENDING_UPSTREAM_MODE=1 vite build --outDir /tmp/dist-upstream` 再检查 | 按预期失败（775 处命中），说明检查有效 |
| `pnpm tauri build --bundles deb,appimage` | 通过：`WendingAI Switch_4.0.28_amd64.deb`（18 MB）、`.AppImage`（117 MB） |
| Xvfb 启动 release 二进制（隔离 HOME） | 引导弹窗正常；输入无效 Key 显示“Key 无效或已停用”，未写入 ~/.claude / ~/.codex / ~/.gemini；日志中无 Key。截图：`docs/wendingai/onboarding*.png` |

未做：macOS / Windows 打包与签名；`cargo clippy`。

## 2b. 真实 Key 端到端测试（2026-11-10 07:44–08:10 EST）

测试 Key 只通过环境变量传入，未打印、未写入仓库 / 日志 / 截图（截图只显示打码 Key）；已用 `git grep` 和日志检查确认不含 Key。
测试前 `~/.claude` 不存在，`~/.codex`、`~/.gemini` 里只有刚执行 `--version` 产生的临时文件，没有用户配置需要备份。

- Key 可用模型（`/v1/models`）：`laotalk-fast`、`laotalk-quality`、`laotalk-vision`。`/v1/chat/completions`、`/v1/responses`、`/v1/messages`、Gemini `v1beta generateContent` 四种格式各发一次极小请求均成功。
- **发现并修复**（commit `6c4e6f4`）：原 `pickModels` 在列表里找不到 claude-* / gpt-5* / gemini-* 时回退到内置默认模型，而该 Key 无权访问这些模型（服务端返回“该令牌无权访问模型”）。现在改为：已知模型族 → 通用主力（quality/pro…）/ 快速（fast/mini…）关键词 → 第一个对话模型（排除 vision 等）；新增单测。
- 控制台链接修正（commit `8bcff68`）：`/keys`、`/wallet`。
- 引导流程：在 Xvfb 中启动 release 二进制（真实 HOME），粘贴 Key → 验证并配置成功，三个 CLI 的配置由应用写入：
  - `~/.claude/settings.json`：`ANTHROPIC_BASE_URL=https://api.wending.ai`，`ANTHROPIC_AUTH_TOKEN`（Key），`ANTHROPIC_MODEL` / SONNET / OPUS = `laotalk-quality`，HAIKU = `laotalk-fast`
  - `~/.codex/config.toml`：`model = "laotalk-quality"`，`model_reasoning_effort = "high"`，`base_url = "https://api.wending.ai/v1"`，`wire_api = "responses"`，Key 写在 `experimental_bearer_token`（不生成 auth.json）
  - `~/.gemini/.env`：`GOOGLE_GEMINI_BASE_URL=https://api.wending.ai`，`GEMINI_MODEL=laotalk-quality`；`settings.json` 选择 `gemini-api-key`
- 额度显示：引导后显示 “Key 剩余 $9.67，已用 $0.33”；测试后显示 “$9.34，已用 $0.66”，与 `/api/usage/token/` 原始值 ÷ `quota_per_unit`(500000) 一致（$9.3408 / 总额 $10.00）。
- 真实调用（shell 中没有任何 ANTHROPIC_/OPENAI_/GEMINI_ 环境变量，只靠应用写的配置）：

| 命令 | 结果 |
| --- | --- |
| `claude -p 'reply with OK' --max-turns 1`（Claude Code 2.1.197） | 通过，回复 `OK`；JSON 输出显示使用 `laotalk-quality` + `laotalk-fast`，约 $0.012 |
| `codex exec --skip-git-repo-check 'reply with OK'`（codex-cli 0.167.0） | 通过，回复 `OK`；provider custom，模型 laotalk-quality，8,550 tokens |
| `gemini -p 'reply with OK'`（gemini-cli 0.67.0） | 失败：未受信任目录下 Gemini CLI 不读取 `~/.gemini/.env`（CLI 自身的文件夹信任机制） |
| `gemini --skip-trust -p 'reply with OK'` | 通过，回复 `OK`（同一份应用写入的配置） |

- 修复后重新验证：`pnpm typecheck` 通过；`pnpm format:check` 通过；`pnpm test:unit` 3748 通过 / 9 跳过；`pnpm tauri build --bundles deb,appimage` 通过；`scripts/check-brand.sh` 通过。（Rust 代码本轮未改动。）

已知小问题：
- Codex 提示 “Model metadata for `laotalk-quality` not found”，使用默认元数据，不影响调用；以后可在 Codex 配置里补模型元数据或由服务端提供 OpenAI 风格的模型名。
- Gemini CLI 在未受信任目录的非交互模式下需要 `--skip-trust` / `GEMINI_CLI_TRUST_WORKSPACE=true`，或在交互模式里信任该目录；应用目前不改用户的信任设置（P2 可在界面加提示）。
- 背景里仍显示上游 “Claude Official” 卡片（P2 隐藏）。

## 3. 安全说明
- Key 明文存储（与上游一致）：`~/.wendingai/cc-switch.db`（SQLite）以及各 CLI 自己的配置文件（`~/.claude/settings.json`、`~/.codex/auth.json`、`~/.gemini/.env`）。CLI 本身需要明文读取。界面只显示打码 Key（≤12 位整串隐藏）。
- deeplink 只注册 `wendingai://`；解析器仍兼容 `ccswitch://` 格式（仅手动 / 测试）。
- 上游远端 push 地址已设为 `DISABLED`，防止误推。

## 4. 仍是占位 / 待确认
- 内置默认模型（claude-sonnet-4-5 / gpt-5.5 / gemini-2.5-pro）只在拿不到 `/v1/models` 时使用；测试 Key 无权访问这些模型，正常流程按 Key 实际可用模型选择。
- 控制台链接已确认：前端把旧路由 `/console/token`、`/console/topup` 重定向到 `/keys`、`/wallet`，现已直接使用后者（SPA 路由，HTTP 200）。
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
