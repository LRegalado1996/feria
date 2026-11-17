import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { collectHydrationErrors } from "@/test/hydration";

import { useVisitSeed } from "./use-visit-seed";

function Probe() {
  return <span data-seed={String(useVisitSeed())} />;
}

function seedOf(container: HTMLElement): string | null {
  return container.querySelector("span")?.dataset.seed ?? null;
}

describe("useVisitSeed", () => {
  test("is null in the server render and a number once hydrated, without a mismatch", () => {
    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <Probe />,
      { clientNowMs: 1000, serverNowMs: 0 }
    );

    expect(serverHtml).toContain('data-seed="null"');
    expect(clientHtml).toMatch(/data-seed="\d+"/u);
    expect(errors).toEqual([]);
  });

  test("is the same for every component and every render of the visit", () => {
    const first = render(<Probe />);
    const second = render(<Probe />);
    const seed = seedOf(first.container);

    first.rerender(<Probe />);

    expect(seed).toMatch(/^\d+$/u);
    expect(seedOf(first.container)).toBe(seed);
    expect(seedOf(second.container)).toBe(seed);
  });
});
