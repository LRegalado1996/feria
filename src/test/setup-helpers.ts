import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

/**
 * A fresh QueryClient per test, wrapped as a provider component. Retries are
 * off, so a failed request fails the test at once instead of being retried.
 *
 *   const wrapper = createQueryWrapper();
 *   const { result } = renderHook(() => useMyHook(), { wrapper });
 *   wrapper.queryClient.getQueryData(key);
 */
export function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  }

  return Object.assign(Wrapper, { queryClient });
}
