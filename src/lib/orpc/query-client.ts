import {
  defaultShouldDehydrateQuery,
  MutationCache,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";

import { reportError } from "@/lib/errors/client";

interface ErrorReportMeta extends Record<string, unknown> {
  /**
   * Set on a query or mutation that reports its own failure with a more
   * specific action, so the global sink does not report it a second time.
   */
  suppressGlobalErrorReport?: boolean;
}

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: ErrorReportMeta;
    queryMeta: ErrorReportMeta;
  }
}

export const createQueryClient = () =>
  new QueryClient({
    // The caches, not `defaultOptions`: a query or mutation with its own
    // `onError` replaces a default handler, and its failure still belongs in
    // the report. Report only; what the user sees is the component's job.
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!query.meta?.suppressGlobalErrorReport) {
          reportError(error, { action: "Query.failed" });
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (!mutation.meta?.suppressGlobalErrorReport) {
          reportError(error, { action: "Mutation.failed" });
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 1000,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
