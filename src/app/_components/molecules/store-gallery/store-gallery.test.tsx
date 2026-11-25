import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import useEmblaCarousel from "embla-carousel-react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createFakeEmbla } from "@/test/embla";
import { renderWithI18n } from "@/test/i18n";
import { stubReducedMotion } from "@/test/reduced-motion";
import { required } from "@/test/required";

import { StoreGallery, type StoreGalleryImage } from "./store-gallery";

vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));

// When the page is idle has its own tests: here each test says whether it is.
const { usePageIdle } = vi.hoisted(() => ({ usePageIdle: vi.fn(() => true) }));

vi.mock("@/lib/hooks/ui/use-page-idle", () => ({ usePageIdle }));

function makeImages(count: number): StoreGalleryImage[] {
  return Array.from({ length: count }, (_, index) => ({
    alt: `Anillo solitario, foto ${index + 1}`,
    height: 900,
    id: index + 10,
    url: `/seed/ring-${index + 1}.jpg`,
    width: 1200,
  }));
}

function setup({
  actions,
  count = 3,
  idle = true,
  locale = "es",
  loop = true,
  snaps = count,
}: {
  actions?: ReactNode;
  count?: number;
  /** Whether the page has had its idle moment. */
  idle?: boolean;
  locale?: Locale;
  /** Whether Embla could go round: it gives up when the photos are few. */
  loop?: boolean;
  snaps?: number;
} = {}) {
  stubReducedMotion(false);
  usePageIdle.mockReturnValue(idle);
  const embla = createFakeEmbla({ loop, snaps });
  vi.mocked(useEmblaCarousel).mockReturnValue(embla.hook);
  renderWithI18n(
    <StoreGallery
      actions={actions}
      className="custom"
      images={makeImages(count)}
      title="Anillo solitario"
    />,
    { locale }
  );

  return {
    arrow: () =>
      document.querySelector<HTMLElement>('[data-slot="store-gallery-arrow"]'),
    embla,
    status: () => document.querySelector("output"),
    user: userEvent.setup(),
  };
}

describe("StoreGallery", () => {
  test.each([
    ["es", "Fotos de Anillo solitario"],
    ["en", "Photos of Anillo solitario"],
  ] as const)(
    "in %s is a carousel of every photo on the grey tile, named %j",
    (locale, name) => {
      setup({ locale });

      const gallery = screen.getByRole("region", { name });
      expect(gallery).toHaveClass("custom");
      const photos = within(gallery).getAllByRole("img");
      expect(photos.map((photo) => photo.getAttribute("alt"))).toEqual([
        "Anillo solitario, foto 1",
        "Anillo solitario, foto 2",
        "Anillo solitario, foto 3",
      ]);
      expect(photos[0]?.parentElement).toHaveClass(
        "aspect-square",
        "bg-store-surface"
      );
    }
  );

  test("hands Embla a row of photos that starts at its left edge and goes round", () => {
    setup();

    expect(useEmblaCarousel).toHaveBeenCalledWith(
      { align: "start", loop: true },
      undefined
    );
  });

  test("going round, its round arrow always leads on: past the last photo comes the first", async () => {
    const { arrow, embla, status, user } = setup();

    await user.click(required(arrow()));
    await user.click(required(arrow()));
    expect(status()).toHaveTextContent("Foto 3 de 3");
    expect(arrow()).toHaveAccessibleName("Foto siguiente");

    await user.click(required(arrow()));

    expect(status()).toHaveTextContent("Foto 1 de 3");
    expect(arrow()).toHaveAccessibleName("Foto siguiente");
    // Three steps on, gliding; never a jump back to the start.
    expect(embla.fake.scrollNext.mock.calls).toEqual([
      [false],
      [false],
      [false],
    ]);
    expect(embla.fake.scrollTo).not.toHaveBeenCalled();
  });

  test("loads the first photo at once and ahead of the rest, the others lazily", () => {
    setup();

    const photos = screen.getAllByRole("img");
    expect(
      photos.map((photo) => [
        photo.getAttribute("loading"),
        photo.getAttribute("fetchpriority"),
      ])
    ).toEqual([
      ["eager", "high"],
      ["lazy", null],
      ["lazy", null],
    ]);
  });

  test.each([
    [false, ["Anillo solitario, foto 1", "Anillo solitario, foto 2"]],
    [
      true,
      [
        "Anillo solitario, foto 1",
        "Anillo solitario, foto 2",
        "Anillo solitario, foto 3",
        "Anillo solitario, foto 4",
      ],
    ],
  ])(
    "with the page idle %s, holds the photos past the second on their grey tiles until then",
    (idle, shown) => {
      setup({ count: 4, idle });

      expect(
        screen.getAllByRole("img").map((photo) => photo.getAttribute("alt"))
      ).toEqual(shown);
      // Every photo keeps its place in the row, on its tile.
      expect(
        document.querySelectorAll('[data-slot="store-gallery"] .aspect-square')
      ).toHaveLength(4);
    }
  );

  test.each([
    [1, ["foto 1", "foto 2", "foto 3"]],
    [2, ["foto 1", "foto 2", "foto 3", "foto 4"]],
  ] as const)(
    "before the page is idle, %i steps on draw each photo reached and the one that peeks beside it",
    async (steps, shown) => {
      const { arrow, user } = setup({ count: 5, idle: false });

      for (let step = 0; step < steps; step += 1) {
        await user.click(required(arrow()));
      }

      expect(
        screen.getAllByRole("img").map((photo) => photo.getAttribute("alt"))
      ).toEqual(shown.map((photo) => `Anillo solitario, ${photo}`));
    }
  );

  test("going back round to the last photo before the page is idle draws it, and the ones between stay on their tiles", async () => {
    const { embla } = setup({ count: 5, idle: false });

    act(() => {
      embla.fake.scrollPrev();
    });

    expect(
      screen.getAllByRole("img").map((photo) => photo.getAttribute("alt"))
    ).toEqual([
      "Anillo solitario, foto 1",
      "Anillo solitario, foto 2",
      "Anillo solitario, foto 5",
    ]);
  });

  test("where Embla could not go round, its round arrow shows the next photo, then leads back to the first", async () => {
    const { arrow, embla, status, user } = setup({ loop: false });

    expect(arrow()).toHaveAccessibleName("Foto siguiente");
    // Lime on any photo: the accent, not the ink of the main buttons.
    expect(arrow()).toHaveAttribute("data-variant", "accent");
    expect(status()).toHaveTextContent("Foto 1 de 3");

    await user.click(required(arrow()));
    expect(status()).toHaveTextContent("Foto 2 de 3");
    await user.click(required(arrow()));
    // Each a glide (`false`): motion is allowed here.
    expect(embla.fake.scrollNext.mock.calls).toEqual([[false], [false]]);
    expect(arrow()).toHaveAccessibleName("Volver a la primera foto");

    await user.click(required(arrow()));
    expect(embla.fake.scrollTo).toHaveBeenCalledExactlyOnceWith(0, false);
    expect(status()).toHaveTextContent("Foto 1 de 3");
  });

  test("says the photo in view politely, in English on an English page", () => {
    const { arrow, status } = setup({ locale: "en" });

    expect(status()).toHaveAttribute("aria-live", "polite");
    expect(status()).toHaveTextContent("Photo 1 of 3");
    expect(arrow()).toHaveAccessibleName("Next photo");
  });

  test("several photos each take most of the width, so the next one peeks in", () => {
    setup();

    const [first] = screen.getAllByRole("group");
    expect(first).toHaveClass("basis-[88%]", "md:basis-[62%]");
    // That share of the gallery, which from `lg` is what the article's
    // 27rem column leaves: the file the browser picks is never too small.
    expect(screen.getAllByRole("img")[0]).toHaveAttribute(
      "sizes",
      "(min-width: 1024px) calc((100vw - 27rem) * 0.62), (min-width: 768px) 62vw, 88vw"
    );
  });

  test("one photo fills the gallery's width", () => {
    setup({ count: 1 });

    expect(screen.getByRole("group")).toHaveClass("basis-full");
    expect(screen.getByRole("group")).not.toHaveClass("basis-[88%]");
    expect(screen.getByRole("img")).toHaveAttribute(
      "sizes",
      "(min-width: 1024px) calc(100vw - 27rem), 100vw"
    );
  });

  test("one photo has nothing to move: no arrow, no counter", () => {
    const { arrow, status } = setup({ count: 1 });

    expect(arrow()).toBeNull();
    expect(status()).toBeNull();
  });

  test("the magnifier is a small circle in the top-left corner, the page's own controls after it (FER-019)", () => {
    setup({ actions: <button type="button">Compartir</button> });

    const corner = required(
      document.querySelector<HTMLElement>('[data-slot="store-gallery-actions"]')
    );
    expect(corner).toHaveClass("absolute", "top-2.5", "left-2.5", "gap-2");
    expect(
      within(corner)
        .getAllByRole("button")
        .map(
          (button) => button.getAttribute("aria-label") ?? button.textContent
        )
    ).toEqual(["Ampliar la foto", "Compartir"]);
    expect(
      within(corner).getByRole("button", {
        name: "Ampliar la foto",
      })
    ).toHaveAttribute("data-size", "icon-sm");
  });

  test("with no controls of the page's, the corner holds the magnifier alone", () => {
    setup();

    expect(
      within(
        required(
          document.querySelector<HTMLElement>(
            '[data-slot="store-gallery-actions"]'
          )
        )
      )
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Ampliar la foto"]);
  });

  test("zooms into the photo in view, full screen, and closes back to the gallery", async () => {
    const { arrow, user } = setup();
    await user.click(required(arrow()));

    await user.click(screen.getByRole("button", { name: "Ampliar la foto" }));

    const zoom = screen.getByRole("dialog", {
      name: "Anillo solitario, foto 2",
    });
    expect(within(zoom).getByRole("img")).toHaveAttribute(
      "alt",
      "Anillo solitario, foto 2"
    );
    expect(zoom).toHaveClass("fixed", "inset-0", "bg-store-contrast");

    await user.click(
      within(zoom).getByRole("button", { name: "Cerrar la foto ampliada" })
    );
    await waitFor(() => {
      expect(screen.queryByTestId("store-gallery-zoom")).toBeNull();
    });
    expect(
      screen.getByRole("button", { name: "Ampliar la foto" })
    ).toHaveFocus();
  });

  test("zooms into the last photo while Embla rests on fewer places than photos", async () => {
    const { embla, user } = setup({ count: 3, snaps: 4 });
    act(() => {
      embla.fake.scrollTo(3);
    });

    await user.click(screen.getByRole("button", { name: "Ampliar la foto" }));

    expect(
      screen.getByRole("dialog", { name: "Anillo solitario, foto 3" })
    ).toBeVisible();
  });

  test.each([
    ["es", "Sin foto"],
    ["en", "No photo"],
  ] as const)(
    "in %s, an article with no photo says %j on the tile",
    (locale, text) => {
      renderWithI18n(<StoreGallery images={[]} title="Anillo" />, { locale });

      const tile = document.querySelector('[data-slot="store-gallery"]');
      expect(tile).toHaveTextContent(text);
      expect(tile).toHaveClass("aspect-square", "bg-store-surface");
      expect(screen.queryByRole("region")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
      expect(
        document.querySelector('[data-slot="store-gallery-actions"]')
      ).toBeNull();
    }
  );

  test("with no photo there is nothing to zoom, but the page's own controls stay in the corner (FER-019)", () => {
    renderWithI18n(
      <StoreGallery
        actions={<button type="button">Compartir</button>}
        images={[]}
        title="Anillo"
      />,
      { locale: "es" }
    );

    const corner = required(
      document.querySelector<HTMLElement>('[data-slot="store-gallery-actions"]')
    );
    expect(corner).toHaveClass("absolute", "top-2.5", "left-2.5");
    expect(corner.parentElement).toHaveClass("relative");
    expect(
      within(corner)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["Compartir"]);
  });
});
