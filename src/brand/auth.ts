/**
 * WendingAI 一键授权登录（前端）。
 *
 * Rust 侧（`services/wending_auth.rs`）负责回环监听、PKCE 和用授权码换 Key；
 * 这里负责：探测服务端是否已开放 → 打开浏览器 → 轮询结果 → 拿到 Key。
 * 拿到的 Key 交给 `setupWendingKey`，与“粘贴 Key”走完全相同的配置流程。
 */
import { invoke } from "@tauri-apps/api/core";
import { settingsApi } from "@/lib/api";

export interface WendingAuthProbe {
  available: boolean;
  /** not_registered：服务端尚未开放；network：网络错误；invalid_base：地址不受支持 */
  reason?: string | null;
  clientName?: string | null;
}

interface LoginStart {
  flowId: string;
  authUrl: string;
  expiresIn: number;
}

interface LoginPoll {
  status: "pending" | "done" | "error";
  apiKey?: string | null;
  error?: string | null;
}

export class WendingAuthError extends Error {
  constructor(
    /** cancelled / access_denied / timeout / flow_ended / 服务端错误码 */
    public readonly code: string,
  ) {
    super(code);
  }
}

export async function probeWendingAuth(
  baseUrl: string,
): Promise<WendingAuthProbe> {
  try {
    return await invoke<WendingAuthProbe>("wending_auth_probe", { baseUrl });
  } catch {
    return { available: false, reason: "network" };
  }
}

const POLL_MS = 800;

/**
 * 打开浏览器完成授权，返回专用 API Key。
 * `signal` 中止时取消本次登录（Rust 侧停止监听）。
 */
export async function loginWithBrowser(
  baseUrl: string,
  opts: { signal?: AbortSignal; onBrowserOpened?: (url: string) => void } = {},
): Promise<string> {
  const start = await invoke<LoginStart>("wending_auth_start", { baseUrl });
  const cancel = () =>
    void invoke("wending_auth_cancel", { flowId: start.flowId }).catch(
      () => undefined,
    );
  if (opts.signal?.aborted) {
    cancel();
    throw new WendingAuthError("cancelled");
  }
  await settingsApi.openExternal(start.authUrl);
  opts.onBrowserOpened?.(start.authUrl);

  return new Promise<string>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      cancel();
      reject(new WendingAuthError("cancelled"));
    };
    if (opts.signal?.aborted) {
      onAbort();
      return;
    }
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const tick = async () => {
      try {
        const poll = await invoke<LoginPoll>("wending_auth_poll", {
          flowId: start.flowId,
        });
        if (opts.signal?.aborted) return;
        if (poll.status === "pending") {
          timer = setTimeout(() => void tick(), POLL_MS);
          return;
        }
        opts.signal?.removeEventListener("abort", onAbort);
        if (poll.status === "done" && poll.apiKey) resolve(poll.apiKey);
        else reject(new WendingAuthError(poll.error || "unknown"));
      } catch (e) {
        opts.signal?.removeEventListener("abort", onAbort);
        reject(e);
      }
    };
    timer = setTimeout(() => void tick(), POLL_MS);
  });
}

/** 把错误码转换成 i18n key（wending.auth.errors.*） */
export function authErrorKey(code: string): string {
  switch (code) {
    case "access_denied":
    case "cancelled":
    case "timeout":
    case "invalid_grant":
    case "invalid_client":
      return code;
    default:
      return "generic";
  }
}
