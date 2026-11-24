import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import type { CatalogCover } from "@/lib/catalog/cover";
import { required } from "@/test/required";

import { StoreCatalogCover } from "./store-catalog-cover";

const COMPUTER = { height: 800, url: "/seed/ring-2.jpg", width: 1200 };
const PHONE = { height: 1200, url: "/seed/ring-1.jpg", width: 1000 };

function setup(cover: Partial<CatalogCover> = {}) {
  render(
    <StoreCatalogCover
      className="custom"
      cover={{
        alt: "Anillo sello",
        computer: COMPUTER,
        phone: PHONE,
        ...cover,
      }}
    >
      <h1>Anillos</h1>
    </StoreCatalogCover>
  );
  const root = screen.getByTestId("store-catalog-cover");

  return {
    image: within(root).getByRole("img", { name: "Anillo sello" }),
    root,
    sources: () => [...root.querySelectorAll("source")],
  };
}

test("shows the phone's image below md and the computer's from md up", () => {
  const { image, sources } = setup();

  const [source] = sources();
  expect(sources()).toHaveLength(1);
  expect(required(source).getAttribute("media")).toBe("(min-width: 768px)");
  expect(required(source).getAttribute("srcset")).toContain(
    encodeURIComponent(COMPUTER.url)
  );
  expect(image.getAttribute("src")).toContain(encodeURIComponent(PHONE.url));
  expect(image.getAttribute("srcset")).toContain(encodeURIComponent(PHONE.url));
});

test("shows the computer's image everywhere when there is no phone image", () => {
  const { image, sources } = setup({ phone: null });

  expect(sources()).toEqual([]);
  expect(image.getAttribute("src")).toContain(encodeURIComponent(COMPUTER.url));
});

test("is fetched first, never lazily, as wide as the window and nearly as tall, filling a box that keeps its place", () => {
  const { image, root } = setup();

  expect(image).toHaveAttribute("fetchpriority", "high");
  expect(image).toHaveAttribute("loading", "eager");
  expect(image).toHaveAttribute("sizes", "100vw");
  expect(image).toHaveClass("object-cover", "size-full");
  // The window's height less the frame and a hint of the first row
  // (FER-044, design.md § Storefront), never under 20rem.
  expect(root).toHaveClass(
    "w-full",
    "h-[calc(100svh-17.5rem)]",
    "md:h-[calc(100svh-20rem)]",
    "min-h-80",
    "custom"
  );
  expect(root.className).not.toMatch(/aspect-/u);
});

test("puts the page's title over the photo with a text shadow of its own, and no shade over the photo (FER-077)", () => {
  const { root } = setup();
  const title = within(root).getByRole("heading", { level: 1 });

  expect(title).toHaveTextContent("Anillos");
  expect(title.parentElement).toHaveClass("store-display-shadow");
  // Nothing but the photo and the words: no layer between them.
  expect(
    [...root.querySelectorAll<HTMLElement>(":scope > *")].map(
      (child) => child.dataset.slot
    )
  ).toEqual(["store-picture", "store-catalog-cover-words"]);
  expect(root.innerHTML).not.toMatch(/bg-linear|gradient/u);
});
