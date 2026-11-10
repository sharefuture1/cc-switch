import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BRAND } from "../brand";
import {
  getWendingProvider,
  queryWendingQuota,
  type WendingQuota,
} from "../wending";

export const WENDING_PROVIDER_QUERY_KEY = ["wending", "provider"] as const;
export const WENDING_QUOTA_QUERY_KEY = ["wending", "quota"] as const;

/** 打开 / 关闭“粘贴 Key”引导窗口（跨组件） */
const OPEN_EVENT = "wending:open-onboarding";
export function openWendingOnboarding() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}
export function useOnboardingOpenSignal(onOpen: () => void) {
  useEffect(() => {
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [onOpen]);
}

export function useWendingProvider() {
  return useQuery({
    queryKey: WENDING_PROVIDER_QUERY_KEY,
    queryFn: getWendingProvider,
    staleTime: 30_000,
  });
}

export function useWendingQuota(apiKey: string | undefined, baseUrl?: string) {
  return useQuery<WendingQuota>({
    queryKey: WENDING_QUOTA_QUERY_KEY,
    queryFn: () =>
      queryWendingQuota(apiKey ?? "", baseUrl || BRAND.defaultEndpoint),
    enabled: Boolean(apiKey),
    refetchInterval: 10 * 60_000,
    staleTime: 60_000,
    retry: false,
  });
}

export function useRefreshWending() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({
        queryKey: WENDING_PROVIDER_QUERY_KEY,
      });
      await queryClient.refetchQueries({ queryKey: WENDING_QUOTA_QUERY_KEY });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);
  return { refresh, refreshing };
}
