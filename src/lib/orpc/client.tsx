"use client";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { addBreadcrumb } from "@sentry/nextjs";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { createQueryClient } from "@/lib/orpc/query-client";
import type { AppRouter } from "@/server/api/root";

let clientQueryClientSingleton: QueryClient | undefined;
export const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return createQueryClient();
  }
  // Browser: use singleton pattern to keep the same query client
  clientQueryClientSingleton ??= createQueryClient();

  return clientQueryClientSingleton;
};

const DEPLOYMENT_PIN_HEADER = "x-deployment-id";

/**
 * Set once Vercel refuses this tab's pin: every later call goes unpinned, to
 * whichever deployment serves the domain now.
 */
let deploymentPinReleased = false;

/**
 * Pins the call to the deployment that served this page, so Vercel's Skew
 * Protection routes it to the server this tab's JavaScript was built against
 * (docs/agents/skew-protection.md). Next pins its own navigations and Server
 * Actions, not a hand-rolled `fetch`, and every oRPC call is one.
 *
 * Stays a literal `process.env.NEXT_DEPLOYMENT_ID` member access: the bundler
 * replaces exactly that expression with the build's id, and it is empty where
 * the build has none (`next dev`, a standalone build).
 */
function withDeploymentPin(): Record<string, string> {
  const deploymentId = process.env.NEXT_DEPLOYMENT_ID;

  return deploymentId && !deploymentPinReleased
    ? { [DEPLOYMENT_PIN_HEADER]: deploymentId }
    : {};
}

/**
 * Vercel answered a pinned call itself with a 404: the deployment that served
 * this tab is past the project's Skew Protection maximum age, was deleted, or
 * sits below a threshold. No procedure ran anywhere.
 */
class PinnedDeploymentUnavailableError extends Error {
  override name = "PinnedDeploymentUnavailableError";
}

/**
 * A 404 Vercel wrote itself, marked with `x-vercel-error`. The oRPC handler
 * never sets that header, so a business NOT_FOUND keeps the pin.
 */
function isRefusedPin(response: Response): boolean {
  return response.status === 404 && response.headers.has("x-vercel-error");
}

/**
 * Sends the session cookie, and turns Vercel's refusal to route a pinned call
 * into `PinnedDeploymentUnavailableError`, releasing the pin for the tab.
 */
async function linkFetch(
  input: Request | string | URL,
  init?: RequestInit
): Promise<Response> {
  const pinned =
    (input instanceof Request && input.headers.has(DEPLOYMENT_PIN_HEADER)) ||
    new Headers(init?.headers).has(DEPLOYMENT_PIN_HEADER);
  const response = await fetch(input, { ...init, credentials: "include" });

  if (pinned && isRefusedPin(response)) {
    deploymentPinReleased = true;
    // The next real error then shows this tab outlived its deployment.
    addBreadcrumb({
      category: "skew-protection",
      level: "warning",
      message: "Vercel refused the deployment pin; this tab now calls unpinned",
    });
    throw new PinnedDeploymentUnavailableError();
  }

  return response;
}

const link = new RPCLink({
  url: `${typeof window === "undefined" ? "http://localhost:3000" : window.location.origin}/api/orpc`,
  headers: withDeploymentPin,
  fetch: linkFetch,
  clientInterceptors: [
    // Re-sends a refused call once, unpinned. Safe for a mutation too: the
    // refusal came before any deployment ran it, so this is its first run.
    async (options) => {
      try {
        return await options.next();
      } catch (error) {
        if (!(error instanceof PinnedDeploymentUnavailableError)) {
          throw error;
        }

        const { [DEPLOYMENT_PIN_HEADER]: _pin, ...headers } =
          options.request.headers;
        return await options.next({
          ...options,
          request: { ...options.request, headers },
        });
      }
    },
  ],
});

export const client: RouterClient<AppRouter> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);

export function ORPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {props.children}
    </QueryClientProvider>
  );
}
