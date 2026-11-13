import { HttpResponse, http, type RequestHandler } from "msw";

/**
 * Answers an oRPC procedure, as called through `@/test/mocks/orpc-client`.
 * The resolver receives the procedure's input and returns its output, which
 * is sent in oRPC's `{ json, meta }` envelope. A `vi.fn()` resolver doubles as
 * the spy on what the client sent.
 *
 *   const createPost = vi.fn(() => ({ id: "1", name: "Hello" }));
 *   server.use(createOrpcHandler("post.create", createPost));
 *   expect(createPost).toHaveBeenCalledWith({ name: "Hello" });
 */
export function createOrpcHandler(
  procedurePath: string,
  resolve: (input: unknown) => unknown
): RequestHandler {
  return http.post<never, { json?: unknown }>(
    orpcUrl(procedurePath),
    async ({ request }) => {
      const body = await request.json();
      const output = await resolve(body.json);

      return HttpResponse.json({ json: output, meta: [] });
    }
  );
}

/**
 * Fails an oRPC procedure the way `ORPCError` does: `code`, `message`, the
 * HTTP `status`, and the typed `data` a client narrows on, when there is one.
 */
export function createOrpcErrorHandler(
  procedurePath: string,
  error: { code: string; data?: unknown; message: string; status?: number }
): RequestHandler {
  const status = error.status ?? 400;

  return http.post(orpcUrl(procedurePath), () =>
    HttpResponse.json(
      {
        defined: true,
        code: error.code,
        status,
        message: error.message,
        ...(error.data === undefined ? {} : { data: error.data }),
      },
      { status }
    )
  );
}

function orpcUrl(procedurePath: string) {
  return `*/api/orpc/${procedurePath.replaceAll(".", "/")}`;
}
