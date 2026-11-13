import { expect, type Page } from "@playwright/test";

export type RpcInput = Readonly<Record<string, string | number | boolean>>;

interface CompleteRpcOptions {
  /** Fields the request must carry, so another call to the path never counts. */
  input?: RpcInput;
  /** The status the action must end in; a refusal is a result too. */
  status?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * For an action that MUST send a fresh request: arm the response listener
 * before acting, match the path and input, require the status and the whole
 * response, and only then let the caller assert what rendered. An element
 * missing 15 seconds later says nothing; "the request never went" or "it
 * answered 500" says what broke. oRPC sends its input as `{ json }`, Better
 * Auth as the body itself; both are matched.
 */
export async function completeRpcAction(
  page: Page,
  path: `/api/orpc/${string}/${string}` | `/api/auth/${string}`,
  action: () => Promise<void>,
  { input, status = 200 }: CompleteRpcOptions = {}
): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => {
      const request = candidate.request();

      if (
        request.method() !== "POST" ||
        new URL(candidate.url()).pathname !== path
      ) {
        return false;
      }

      if (!input) {
        return true;
      }

      const body: unknown = request.postDataJSON();
      const sent = isRecord(body) && isRecord(body.json) ? body.json : body;

      return (
        isRecord(sent) &&
        Object.entries(input).every(([key, value]) => sent[key] === value)
      );
    }),
    action(),
  ]);

  expect(response.status()).toBe(status);
  expect(await response.finished()).toBeNull();
}
