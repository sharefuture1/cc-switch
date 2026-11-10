#!/usr/bin/env bash
# WendingAI 品牌检查（CI 用）：构建产物中出现上游品牌 / 合作推广 / 返利链接时失败。
# 用法：scripts/check-brand.sh [distDir]   （默认 dist，需先执行 pnpm build:renderer）
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/check-brand.mjs "${1:-dist}"
