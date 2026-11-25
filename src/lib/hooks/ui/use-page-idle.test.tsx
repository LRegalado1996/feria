import { act, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { collectHydrationErrors } from "@/test/hydration";

import { usePageIdle } from "./use-page-idle";

// When the page is idle has its own tests: here the test says when.
const { cancel, whenPageIdle } = vi.hoisted(() => ({
  cancel: vi.fn<() => void>(),
  whenPageIdle: vi.fn<(callback: () => void) => () => void>(),
}));

vi.mock("@/lib/utils/page-idle", () => ({ whenPageIdle }));

function Probe() {
  return <span data-idle={String(usePageIdle())} data-testid="probe" />;
}

/** The page's idle moment, held until `idle()`. */
function setup() {
  const held: (() => void)[] = [];
  whenPageIdle.mockImplementation((callback) => {
    held.push(callback);
    return cancel;
  });

  return {
    idle: () => {
      act(() => {
        for (const runWhenIdle of held.splice(0)) {
          runWhenIdle();
        }
      });
    },
  };
}

describe("usePageIdle", () => {
  test("is false until the page's idle moment, then true", () => {
    const { idle } = setup();
    render(<Probe />);

    expect(screen.getByTestId("probe")).toHaveAttribute("data-idle", "false");
    idle();
    expect(screen.getByTestId("probe")).toHaveAttribute("data-idle", "true");
  });

  test("unmounted before then, cancels its wait", () => {
    setup();
    const { unmount } = render(<Probe />);

    expect(cancel).not.toHaveBeenCalled();
    unmount();
    expect(cancel).toHaveBeenCalledExactlyOnceWith();
  });

  test("is false in the server render and while hydrating, without a mismatch", () => {
    setup();
    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <Probe />,
      { clientNowMs: 1000, serverNowMs: 0 }
    );

    expect(serverHtml).toContain('data-idle="false"');
    expect(clientHtml).toContain('data-idle="false"');
    expect(errors).toEqual([]);
  });
});
