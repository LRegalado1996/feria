import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { StoreGallery, type StoreGalleryImage } from "./store-gallery";

function makeImage(id: number): StoreGalleryImage {
  return {
    alt: `Foto ${id} del collar`,
    height: 1000,
    id,
    url: `/collar-${id}.jpg`,
    width: 800,
  };
}

function setup({
  count = 3,
  locale = "es",
}: { count?: number; locale?: Locale } = {}) {
  const images = Array.from({ length: count }, (_, index) =>
    makeImage(index + 1)
  );
  const user = userEvent.setup();
  const { container } = renderWithI18n(
    <StoreGallery
      className="custom"
      images={images}
      title="Collar de perlas"
    />,
    { locale }
  );
  const found = container.querySelector(".snap-x");
  // With no photos there is no track; a detached one stands in.
  const track =
    found instanceof HTMLElement ? found : document.createElement("div");
  Object.defineProperty(track, "clientWidth", {
    configurable: true,
    value: 400,
  });
  // happy-dom lays nothing out: the scroll asked for is what is checked.
  const scrollTo = vi
    .spyOn(track, "scrollTo")
    .mockImplementation(() => undefined);

  const button = (name: string) => screen.getByRole("button", { name });

  return {
    button,
    container,
    counter: () => screen.getByText(/^Foto \d+ de \d+$/u),
    scrollTo,
    /** Scrolls the track as a swipe does, `left` pixels in. */
    swipe: (left: number, width = 400) => {
      Object.defineProperty(track, "clientWidth", {
        configurable: true,
        value: width,
      });
      track.scrollLeft = left;
      fireEvent.scroll(track);
    },
    /** The track coming to rest at `left` pixels in. */
    settle: (left: number) => {
      track.scrollLeft = left;
      fireEvent.scroll(track);
      fireEvent(track, new Event("scrollend"));
    },
    track,
    thumbs: () =>
      [1, 2, 3].map((position) =>
        button(`Ver la foto ${position}`).getAttribute("aria-current")
      ),
    user,
  };
}

describe("StoreGallery", () => {
  test.each([
    ["es", "Sin foto"],
    ["en", "No photo"],
  ] as const)("in %s, with no photos, says %j", (locale, text) => {
    const { container } = setup({ count: 0, locale });

    const empty = container.querySelector('[data-slot="store-gallery"]');
    expect(empty).toHaveTextContent(new RegExp(`^${text}$`, "u"));
    expect(empty).toHaveClass("custom");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("with one photo, shows it alone: no steps, no counter, no thumbnails", () => {
    setup({ count: 1 });

    const gallery = screen.getByRole("region", {
      name: "Fotos de Collar de perlas",
    });
    expect(gallery).toHaveAttribute("aria-roledescription", "carousel");
    expect(
      within(gallery)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["Ampliar la foto"]);
    expect(
      within(gallery).getByRole("img", { name: "Foto 1 del collar" })
    ).toBeVisible();
    expect(screen.queryByText(/^Foto \d+ de \d+$/u)).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  test("loads the first photo first", () => {
    setup();

    const [first, second] = ["Foto 1 del collar", "Foto 2 del collar"].map(
      (name) => screen.getByRole("img", { name })
    );
    // A priority image is never lazy; the others wait until they are near.
    expect(first).not.toHaveAttribute("loading");
    expect(second).toHaveAttribute("loading", "lazy");
  });

  test("starts on the first photo: previous disabled, next enabled, the first thumbnail current", () => {
    const { button, counter, thumbs } = setup();

    expect(counter()).toHaveTextContent(/^Foto 1 de 3$/u);
    expect(counter()).toHaveAttribute("aria-live", "polite");
    expect(button("Foto anterior")).toHaveAttribute("aria-disabled", "true");
    expect(button("Foto siguiente")).toHaveAttribute("aria-disabled", "false");
    expect(thumbs()).toEqual(["true", null, null]);
  });

  test("glides between photos with CSS, which stops gliding when motion is reduced", () => {
    const { track } = setup();

    expect(track).toHaveClass("scroll-smooth", "motion-reduce:scroll-auto");
  });

  test("at the last photo, next keeps the focus and goes nowhere", async () => {
    const { button, counter, scrollTo, user } = setup();
    await user.click(button("Ver la foto 3"));
    scrollTo.mockClear();

    await user.click(button("Foto siguiente"));

    expect(button("Foto siguiente")).toHaveFocus();
    expect(counter()).toHaveTextContent(/^Foto 3 de 3$/u);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  test("at the first photo, previous keeps the focus and goes nowhere", async () => {
    const { button, counter, scrollTo, user } = setup();

    await user.click(button("Foto anterior"));

    expect(button("Foto anterior")).toHaveFocus();
    expect(counter()).toHaveTextContent(/^Foto 1 de 3$/u);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  test("steps forward and back, scrolling the track a photo's width at a time", async () => {
    const { button, counter, scrollTo, thumbs, user } = setup();

    await user.click(button("Foto siguiente"));
    await user.click(button("Foto siguiente"));

    expect(counter()).toHaveTextContent(/^Foto 3 de 3$/u);
    expect(button("Foto siguiente")).toHaveAttribute("aria-disabled", "true");
    expect(button("Foto anterior")).toHaveAttribute("aria-disabled", "false");
    expect(thumbs()).toEqual([null, null, "true"]);

    await user.click(button("Foto anterior"));

    expect(counter()).toHaveTextContent(/^Foto 2 de 3$/u);
    expect(scrollTo.mock.calls).toEqual([
      [{ left: 400 }],
      [{ left: 800 }],
      [{ left: 400 }],
    ]);
  });

  test("a thumbnail shows its photo", async () => {
    const { button, counter, scrollTo, thumbs, user } = setup();

    await user.click(button("Ver la foto 3"));

    expect(counter()).toHaveTextContent(/^Foto 3 de 3$/u);
    expect(thumbs()).toEqual([null, null, "true"]);
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ left: 800 });
  });

  test("while gliding to a thumbnail's photo, the photos passed on the way neither move the counter nor start the next step", async () => {
    const { button, counter, scrollTo, swipe, user } = setup({ count: 4 });
    await user.click(button("Ver la foto 4"));

    swipe(400);
    swipe(800);

    expect(counter()).toHaveTextContent(/^Foto 4 de 4$/u);

    await user.click(button("Foto anterior"));

    expect(counter()).toHaveTextContent(/^Foto 3 de 4$/u);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 800 });
  });

  test("a swipe that interrupts the glide ends where it comes to rest", async () => {
    const { button, counter, settle, user } = setup();
    await user.click(button("Ver la foto 3"));

    settle(0);

    expect(counter()).toHaveTextContent(/^Foto 1 de 3$/u);
  });

  test.each([
    [400, 400, "Foto 2 de 3"],
    [590, 400, "Foto 2 de 3"],
    [610, 400, "Foto 3 de 3"],
    [0, 400, "Foto 1 de 3"],
    // A track not laid out yet stays on the first photo.
    [400, 0, "Foto 1 de 3"],
  ])("a swipe to %i px of a %i px track shows %j", (left, width, position) => {
    const { counter, swipe } = setup();

    swipe(left, width);

    expect(counter()).toHaveTextContent(new RegExp(`^${position}$`, "u"));
  });

  test("a swipe back after a step follows the track", async () => {
    const { button, counter, swipe, user } = setup();
    await user.click(button("Foto siguiente"));
    // The glide arrives.
    swipe(400);

    swipe(0);

    expect(counter()).toHaveTextContent(/^Foto 1 de 3$/u);
  });

  test("zooms the current photo in a dialog titled by it, and closes it", async () => {
    const { button, user } = setup();
    await user.click(button("Foto siguiente"));

    await user.click(button("Ampliar la foto"));

    const zoom = screen.getByRole("dialog", { name: "Foto 2 del collar" });
    expect(
      within(zoom).getByRole("img", { name: "Foto 2 del collar" })
    ).toHaveAttribute("src", expect.stringContaining("collar-2.jpg"));

    await user.click(
      within(zoom).getByRole("button", { name: "Cerrar la foto ampliada" })
    );

    await waitFor(() => {
      expect(screen.queryByTestId("store-gallery-zoom")).toBeNull();
    });
  });

  test("in English, names its controls in English", () => {
    setup({ locale: "en" });

    expect(
      screen.getByRole("region", { name: "Photos of Collar de perlas" })
    ).toBeVisible();
    expect(screen.getByText("Photo 1 of 3")).toBeVisible();
  });
});
