/// <reference types="vite/client" />

/** WendingAI 纯净版开关，由 vite.config.ts / vitest.config.ts 的 define 注入 */
declare global {
  const __WENDING_PURE__: boolean;
}

export {};
