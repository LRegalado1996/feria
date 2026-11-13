import { act, type ReactElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { vi } from "vitest";

export interface HydrationOutcome {
  /** The DOM after React hydrated it and ran mount effects. */
  clientHtml: string;
  /** React's recoverable (hydration mismatch) errors. Empty when both renders agree. */
  errors: string[];
  /** The DOM as the server emitted it. */
  serverHtml: string;
}

/**
 * Server-render `element` at `serverNowMs`, then hydrate that exact HTML at
 * `clientNowMs`, collecting React's recoverable errors.
 *
 * Every real browser hydrates later than the server rendered (network, parse,
 * a slow device), so a component whose render reads the ambient clock passes a
 * same-instant test and still fails here: `errors` is empty only when the two
 * renders agree. It fakes the clock itself and restores it, so a test stays
 * self-contained.
 *
 *   const { errors } = collectHydrationErrors(<Feed />, { serverNowMs, clientNowMs });
 *   expect(errors).toEqual([]);
 */
export function collectHydrationErrors(
  element: ReactElement,
  times: { clientNowMs: number; serverNowMs: number }
): HydrationOutcome {
  vi.useFakeTimers();
  // React also logs each recoverable error; the test reads `errors` instead.
  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const container = document.createElement("div");
  document.body.append(container);

  try {
    vi.setSystemTime(times.serverNowMs);
    const serverHtml = renderToString(element);

    vi.setSystemTime(times.clientNowMs);
    container.innerHTML = serverHtml;

    const errors: string[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    act(() => {
      root = hydrateRoot(container, element, {
        onRecoverableError: (error) => {
          errors.push(String(error));
        },
      });
    });
    const clientHtml = container.innerHTML;

    act(() => {
      root?.unmount();
    });

    return { clientHtml, errors, serverHtml };
  } finally {
    container.remove();
    consoleError.mockRestore();
    vi.useRealTimers();
  }
}
