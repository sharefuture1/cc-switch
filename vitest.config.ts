import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 单元测试跑在“上游模式”，保证上游测试用例继续有效；品牌层逻辑另有专门测试（tests/brand）。
  define: {
    __WENDING_PURE__: "false",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["{src,tests}/**/*.{test,spec}.{ts,tsx,js,jsx}"],
    // WendingAI 版的 README 是品牌说明 + 去掉赞助商的上游文档，不和上游多语言 README 逐行对齐
    exclude: ["**/node_modules/**", "tests/config/readmeParity.test.ts"],
    environment: "jsdom",
    setupFiles: ["./tests/setupGlobals.ts", "./tests/setupTests.ts"],
    globals: true,
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
