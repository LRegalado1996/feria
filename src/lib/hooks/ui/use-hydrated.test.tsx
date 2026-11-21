import { describe, expect, test } from "vitest";

import { collectHydrationErrors } from "@/test/hydration";

import { useHydrated } from "./use-hydrated";

function Probe() {
  return <span data-hydrated={String(useHydrated())} />;
}

describe("useHydrated", () => {
  test("is false in the server render and true once hydrated, without a mismatch", () => {
    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <Probe />,
      {
        clientNowMs: 1000,
        serverNowMs: 0,
      }
    );

    expect(serverHtml).toContain('data-hydrated="false"');
    expect(clientHtml).toContain('data-hydrated="true"');
    expect(errors).toEqual([]);
  });
});
