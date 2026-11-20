import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  StoreAnnouncementBar,
  type StoreAnnouncementBarProps,
} from "./store-announcement-bar";

function setup(props: StoreAnnouncementBarProps = {}) {
  render(
    <StoreAnnouncementBar {...props}>
      {props.children ?? "Burbujeros y joyas en la feria"}
    </StoreAnnouncementBar>
  );
  const bar = screen.getByTestId("store-announcement-bar");

  return { bar, line: bar.querySelector("p") };
}

describe("StoreAnnouncementBar", () => {
  test("is one line of the display face, the foreground on the accent", () => {
    const { bar, line } = setup();

    expect(line).toHaveTextContent(/^Burbujeros y joyas en la feria$/u);
    expect(bar).toHaveAttribute("data-slot", "store-announcement-bar");
    expect(bar).toHaveClass(
      "bg-store-accent",
      "text-store-foreground",
      "font-display",
      "uppercase",
      "text-center"
    );
    expect(bar).not.toHaveAttribute("aria-hidden");
    expect(bar).toHaveAttribute("data-placeholder", "false");
  });

  test("marks the language its words are in", () => {
    const { line } = setup({ lang: "es" });

    expect(line).toHaveAttribute("lang", "es");
  });

  test("as a placeholder keeps one empty line, hidden from assistive technology", () => {
    const { bar, line } = setup({ placeholder: true });

    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(bar).toHaveAttribute("data-placeholder", "true");
    expect(line?.textContent).toBe(" ");
  });

  test("with a phone's version, keeps the whole notice for every reader and shows the short one to the eye below lg", () => {
    const { bar, line } = setup({
      children: "Te esperamos en la Feria Paseo Prado, puesto 86",
      short: "Feria Paseo Prado · Puesto 86",
    });

    const full = bar.querySelector('[data-slot="store-announcement-bar-full"]');
    const short = bar.querySelector(
      '[data-slot="store-announcement-bar-short"]'
    );
    expect(full).toHaveTextContent(
      /^Te esperamos en la Feria Paseo Prado, puesto 86$/u
    );
    expect(full).toHaveClass("max-lg:sr-only");
    expect(full).not.toHaveAttribute("aria-hidden");
    expect(short).toHaveTextContent(/^Feria Paseo Prado · Puesto 86$/u);
    expect(short).toHaveAttribute("aria-hidden", "true");
    expect(short).toHaveClass("lg:hidden");
    expect(line?.children).toHaveLength(2);
  });

  test("without a phone's version, is the notice alone, shown at every width", () => {
    const { bar } = setup();

    expect(
      bar.querySelector('[data-slot="store-announcement-bar-short"]')
    ).toBeNull();
    expect(
      bar.querySelector('[data-slot="store-announcement-bar-full"]')
    ).not.toHaveClass("max-lg:sr-only");
  });

  test("without a link, is only words", () => {
    setup();

    expect(screen.queryByRole("link")).toBeNull();
  });

  test("with a path of the site, its words are one link there, named by the whole notice", () => {
    const { bar } = setup({
      children: "Encontranos en la feria, del 5/12 al 5/1",
      href: "/en/productos",
      short: "En la feria",
    });

    const link = screen.getByRole("link", {
      name: "Encontranos en la feria, del 5/12 al 5/1",
    });
    expect(link).toHaveAttribute("href", "/en/productos");
    expect(link).not.toHaveAttribute("rel");
    expect(link).toHaveClass("underline");
    // Both versions inside the one link.
    expect(
      link.querySelector('[data-slot="store-announcement-bar-short"]')
    ).toHaveTextContent(/^En la feria$/u);
    expect(bar.querySelectorAll("a")).toHaveLength(1);
  });

  test("with an address elsewhere, is a plain link that does not hand over the page", () => {
    setup({ href: "https://instagram.com/lr-market" });

    const link = screen.getByRole("link", {
      name: "Burbujeros y joyas en la feria",
    });
    expect(link).toHaveAttribute("href", "https://instagram.com/lr-market");
    expect(link).toHaveAttribute("rel", "noopener");
  });

  test.each([
    ["a path of the site", "/en/productos"],
    ["an address elsewhere", "https://instagram.com/lr-market"],
  ])(
    "with %s, its link is a 44 px target below md over a box of its own, not a taller bar",
    (_case, href) => {
      const { bar } = setup({ href });

      expect(screen.getByRole("link")).toHaveClass(
        "relative",
        "max-md:z-50",
        "max-md:before:absolute",
        "max-md:before:h-11",
        "max-md:before:min-w-11",
        "max-md:before:top-1/2",
        "max-md:before:-translate-y-1/2"
      );
      expect(bar).toHaveClass("py-2.5");
    }
  );

  test("keeps a caller's class", () => {
    const { bar } = setup({ className: "sticky" });

    expect(bar).toHaveClass("sticky", "bg-store-accent");
  });
});
