import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import useEmblaCarousel from "embla-carousel-react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createFakeEmbla } from "@/test/embla";
import { renderWithI18n } from "@/test/i18n";
import { stubReducedMotion } from "@/test/reduced-motion";
import { required } from "@/test/required";

import {
  StoreArticleRow,
  type StoreArticleRowProps,
} from "./store-article-row";

vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));

const ITEMS = ["Anillo solitario", "Cadena corona", "Aros abotonados"].map(
  (name) => ({ content: <a href={`#${name}`}>{name}</a>, id: name })
);

function setup({
  locale = "es",
  snaps = 3,
  ...props
}: Partial<StoreArticleRowProps> & { locale?: Locale; snaps?: number } = {}) {
  stubReducedMotion(false);
  const embla = createFakeEmbla({ snaps });
  vi.mocked(useEmblaCarousel).mockReturnValue(embla.hook);
  renderWithI18n(
    <StoreArticleRow
      className="bg-store-background"
      items={ITEMS}
      title="Novedades"
      viewAllHref="/products"
      {...props}
    />,
    { locale }
  );

  return {
    arrow: () =>
      document.querySelector<HTMLElement>(
        '[data-slot="store-article-row-arrow"]'
      ),
    embla,
    row: document.querySelector('[data-slot="store-article-row"]'),
    user: userEvent.setup(),
  };
}

describe("StoreArticleRow", () => {
  test("is a section with its heading in the display face, then its cards in a carousel named after it", () => {
    const { row } = setup();

    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Novedades",
    });
    expect(heading).toHaveClass("font-display", "uppercase");
    expect(row).toHaveClass("bg-store-background");
    const carousel = screen.getByRole("region", { name: "Novedades" });
    expect(
      within(carousel)
        .getAllByRole("group")
        .map((slide) => slide.textContent)
    ).toEqual(["Anillo solitario", "Cadena corona", "Aros abotonados"]);
  });

  test("hands Embla a row that starts at its left edge and pages by what it shows", () => {
    setup();

    expect(useEmblaCarousel).toHaveBeenCalledWith(
      { align: "start", containScroll: "trimSnaps", slidesToScroll: "auto" },
      undefined
    );
  });

  test("takes the heading level it is given", () => {
    setup({ headingLevel: "h3" });

    expect(
      screen.getByRole("heading", { level: 3, name: "Novedades" })
    ).toBeVisible();
  });

  test.each([
    ["es", "Ver todo", "Ver todo: Novedades"],
    ["en", "See all", "See all: Novedades"],
  ] as const)(
    "in %s, links %j to the whole list, named after the row",
    (locale, text, name) => {
      setup({ locale, viewAllHref: "/products?category=anillos" });

      const all = screen.getByRole("link", { name });
      expect(all).toHaveTextContent(new RegExp(`^${text}$`, "u"));
      expect(all).toHaveAttribute("href", "/products?category=anillos");
    }
  );

  test("has no such link without an address for it", () => {
    setup({ viewAllHref: undefined });

    expect(screen.queryByRole("link", { name: /Ver todo/u })).toBeNull();
  });

  test("its round arrow pages forward, then leads back to the start at the end", async () => {
    const { arrow, embla, user } = setup();

    expect(arrow()).toHaveAccessibleName("Ver más de Novedades");
    expect(arrow()).toHaveAttribute("data-variant", "primary");
    expect(arrow()).toHaveClass("rounded-full", "size-13");

    await user.click(required(arrow()));
    await user.click(required(arrow()));
    // Each a glide (`false`): motion is allowed here.
    expect(embla.fake.scrollNext.mock.calls).toEqual([[false], [false]]);
    expect(arrow()).toHaveAccessibleName("Volver al principio de Novedades");

    await user.click(required(arrow()));
    expect(embla.fake.scrollTo).toHaveBeenCalledExactlyOnceWith(0, false);
    expect(arrow()).toHaveAccessibleName("Ver más de Novedades");
  });

  test("names its arrow in English on an English page", () => {
    const { arrow } = setup({ locale: "en" });

    expect(arrow()).toHaveAccessibleName("See more of Novedades");
  });

  test("shows no arrow when every card fits", () => {
    const { arrow, embla } = setup();

    act(() => {
      embla.resize(1);
    });

    expect(arrow()).toBeNull();
  });

  test("gives each card a slide of a quarter of a computer and two thirds of a phone", () => {
    setup();

    for (const slide of screen.getAllByRole("group")) {
      expect(slide).toHaveClass("basis-[62%]", "lg:basis-[23.5%]");
    }
  });
});
