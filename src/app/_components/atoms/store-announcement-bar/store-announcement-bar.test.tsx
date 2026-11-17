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

  test("without a phone's version, is the notice alone", () => {
    const { bar } = setup();

    expect(
      bar.querySelector('[data-slot="store-announcement-bar-short"]')
    ).toBeNull();
    expect(
      bar.querySelector('[data-slot="store-announcement-bar-full"]')
    ).toBeNull();
  });

  test("keeps a caller's class", () => {
    const { bar } = setup({ className: "sticky" });

    expect(bar).toHaveClass("sticky", "bg-store-accent");
  });
});
