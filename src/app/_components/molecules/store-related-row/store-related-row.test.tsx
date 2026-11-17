import { screen, within } from "@testing-library/react";
import useEmblaCarousel from "embla-carousel-react";
import { describe, expect, test, vi } from "vitest";

import { pickRelated, seededRandom } from "@/lib/catalog/related";
import type * as UiHooks from "@/lib/hooks/ui";
import { createFakeEmbla } from "@/test/embla";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, renderWithI18n } from "@/test/i18n";

import { type StoreRelatedItem, StoreRelatedRow } from "./store-related-row";

// The row measures a layout happy-dom does not have.
vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));

const { visitSeed } = vi.hoisted(() => ({
  visitSeed: vi.fn<() => number | null>(() => null),
}));

vi.mock("@/lib/hooks/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof UiHooks>()),
  useVisitSeed: () => visitSeed(),
}));

/** `count` cards of a kind, each a link named by its id. */
function cards(kind: string, count: number): StoreRelatedItem[] {
  return Array.from({ length: count }, (_, index) => {
    const id = `${kind}${index + 1}`;

    return { content: <a href={`/products/${id}`}>{id}</a>, id };
  });
}

function setup({
  others = 0,
  same = 10,
  seed = null,
}: {
  others?: number;
  same?: number;
  seed?: number | null;
}) {
  visitSeed.mockReturnValue(seed);
  vi.mocked(useEmblaCarousel).mockReturnValue(
    createFakeEmbla({ snaps: 2 }).hook
  );
  const pool = { others: cards("o", others), same: cards("s", same) };
  const props = {
    ...pool,
    title: "También te puede gustar",
    viewAllHref: "/products?category=anillos",
  };

  return {
    pool,
    props,
    render: () => renderWithI18n(<StoreRelatedRow {...props} />),
    shown: () =>
      within(screen.getByRole("region", { name: "También te puede gustar" }))
        .getAllByRole("link")
        .map((link) => link.textContent)
        .filter((name) => name !== "Ver todo"),
  };
}

describe("StoreRelatedRow", () => {
  test("before the browser draws, shows the pool's first eight of the category, in its order", () => {
    const { render, shown } = setup({ same: 10 });
    render();

    expect(shown()).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]);
  });

  test.each([1, 2, 77])(
    "with the visit's seed %i, shows the pick that seed draws",
    (seed) => {
      const { pool, render, shown } = setup({ others: 4, same: 12, seed });
      render();

      expect(shown()).toEqual(
        pickRelated(pool, seededRandom(seed)).map((item) => item.id)
      );
      expect(shown()).not.toEqual(
        pickRelated(pool, null).map((item) => item.id)
      );
    }
  );

  test("with fewer than four in the category, fills from the rest of the store", () => {
    const { render, shown } = setup({ others: 9, same: 2, seed: 5 });
    render();

    // Both of the category first, then six others of the store, each once:
    // the pick seed 5 draws.
    expect(shown()).toEqual(["s1", "s2", "o6", "o3", "o8", "o1", "o2", "o5"]);
  });

  test("shows nothing at all when the pool is empty", () => {
    const { render } = setup({ others: 0, same: 0 });
    render();

    expect(
      screen.queryByRole("region", { name: "También te puede gustar" })
    ).toBeNull();
  });

  test("hydrates the server's pick without a mismatch, then shows the visit's own", async () => {
    // The real hook: null on the server and while hydrating.
    const { useVisitSeed } =
      await vi.importActual<typeof UiHooks>("@/lib/hooks/ui");
    const { props } = setup({ others: 0, same: 16 });
    visitSeed.mockImplementation(() => useVisitSeed());
    const Wrapper = createI18nWrapper("es");
    const order = (html: string) =>
      [...html.matchAll(/href="\/products\/(s\d+)"/gu)].map(
        (match) => match[1]
      );

    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <Wrapper>
        <StoreRelatedRow {...props} />
      </Wrapper>,
      { clientNowMs: 0, serverNowMs: 0 }
    );

    expect(errors).toEqual([]);
    expect(order(serverHtml)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
      "s6",
      "s7",
      "s8",
    ]);
    // As many cards after the draw: the row keeps its size.
    expect(order(clientHtml)).toHaveLength(8);
    expect(order(clientHtml)).not.toEqual(order(serverHtml));
  });
});
