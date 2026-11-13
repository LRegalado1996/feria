/**
 * Replacement for `@/lib/orpc/client` in hook and component tests. It mimics
 * the TanStack Query utils oRPC generates, but every call is a real HTTP
 * request to `/api/orpc/<path>`, so the test answers it with
 * `createOrpcHandler` and MSW intercepts it:
 *
 *   vi.mock("@/lib/orpc/client", async () => {
 *     const { orpcClientMock } = await import("@/test/mocks/orpc-client");
 *     return orpcClientMock;
 *   });
 *
 * Requests go through `globalThis.fetch` at call time, so MSW's patch applies
 * whatever the import order.
 */

const BASE_URL = "http://localhost:3000/api/orpc";

async function rpcCall(path: string, input: unknown): Promise<unknown> {
  const response = await globalThis.fetch(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: input, meta: [] }),
  });
  const body: Record<string, unknown> = await response.json();

  if (!response.ok) {
    // The shape of an `ORPCError`: a client branches on `code` and on the
    // typed `data`, so both survive the trip.
    throw Object.assign(
      new Error(
        typeof body.message === "string"
          ? body.message
          : `Request failed: ${response.status}`
      ),
      {
        code: body.code,
        data: body.data,
        defined: body.defined,
        status: body.status ?? response.status,
      }
    );
  }

  return body.json;
}

interface InfiniteOptionsInput {
  initialPageParam?: unknown;
  input: (pageParam: unknown) => unknown;
}

function createOrpcProxy(segments: string[] = []): unknown {
  const path = segments.join("/");

  return new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "mutationOptions") {
          // The caller's options are spread through, not dropped: a hook puts
          // its cache work in `onMutate`/`onSuccess`/`onSettled`, and a mock
          // that swallowed them would leave only "it settled" to assert.
          return (options?: Record<string, unknown>) => ({
            mutationFn: async (input: unknown) => await rpcCall(path, input),
            ...options,
          });
        }

        if (prop === "infiniteOptions") {
          return ({ input, ...options }: InfiniteOptionsInput) => ({
            queryKey: [...segments, { input: input(options.initialPageParam) }],
            queryFn: async ({ pageParam }: { pageParam: unknown }) =>
              await rpcCall(path, input(pageParam)),
            ...options,
          });
        }

        return createOrpcProxy([...segments, prop]);
      },
    }
  );
}

export const orpcClientMock = { orpc: createOrpcProxy() };
