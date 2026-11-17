import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useSessionFlag } from "./use-session-flag";

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock("@/lib/errors/client", () => ({ reportError }));

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  reportError.mockReset();
});

function Probe({ flagKey }: { flagKey: string }) {
  const [on] = useSessionFlag(flagKey);

  return <span data-on={String(on)} />;
}

/** A key of each test's own: the hook keeps the visit's choices in memory. */
function setup(key: string) {
  const first = renderHook(() => useSessionFlag(key));
  const second = renderHook(() => useSessionFlag(key));

  return {
    first: () => first.result.current,
    second: () => second.result.current,
    set: (value: boolean) => {
      act(() => {
        first.result.current[1](value);
      });
    },
  };
}

describe("useSessionFlag", () => {
  test("is off on the server, whatever the browser remembers", () => {
    window.sessionStorage.setItem("flag:server", "1");

    expect(renderToString(<Probe flagKey="flag:server" />)).toBe(
      '<span data-on="false"></span>'
    );
  });

  test("reads what the visit remembered, reporting nothing", () => {
    window.sessionStorage.setItem("flag:read", "1");

    const { first } = setup("flag:read");

    expect(first()[0]).toBe(true);
    expect(reportError).not.toHaveBeenCalled();
  });

  test("sets and clears the choice, in storage and for every reader", () => {
    const { first, second, set } = setup("flag:set");

    set(true);
    expect(window.sessionStorage.getItem("flag:set")).toBe("1");
    expect(first()[0]).toBe(true);
    expect(second()[0]).toBe(true);

    set(false);
    expect(window.sessionStorage.getItem("flag:set")).toBeNull();
    expect(second()[0]).toBe(false);
  });

  test("where the browser refuses storage, is off and keeps a choice for the page", () => {
    vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { first, set } = setup("flag:refused");

    expect(first()[0]).toBe(false);
    set(true);

    expect(first()[0]).toBe(true);
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "SecurityError" }),
      { action: "Storage.read_session_flag" }
    );
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "QuotaExceededError" }),
      { action: "Storage.write_session_flag" }
    );
  });
});
