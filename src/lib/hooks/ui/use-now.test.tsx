import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { useNow } from "./use-now";

const SERVER_NOW = new Date("2024-06-15T12:00:00Z").getTime();
const CLIENT_NOW = SERVER_NOW + 7000;

function Clock({ serverNow }: { serverNow: number }) {
  return <time>{useNow(serverNow)}</time>;
}

function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(CLIENT_NOW);

  return {
    renderOnServer: () => renderToString(<Clock serverNow={SERVER_NOW} />),
    mount: () => renderHook(() => useNow(SERVER_NOW)),
  };
}

describe("useNow", () => {
  test("renders the server's instant before mount, so hydration matches", () => {
    const { renderOnServer } = setup();

    expect(renderOnServer()).toBe(`<time>${SERVER_NOW}</time>`);
  });

  test("switches to the browser clock once mounted", () => {
    const { result } = setup().mount();

    expect(result.current).toBe(CLIENT_NOW);
  });

  test("ticks every 30 seconds, not before", () => {
    const { result } = setup().mount();

    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(result.current).toBe(CLIENT_NOW);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(CLIENT_NOW + 30_000);
  });

  test("stops ticking on unmount", () => {
    const { unmount } = setup().mount();
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
