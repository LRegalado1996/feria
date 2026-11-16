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

  test("keeps a caller's class", () => {
    const { bar } = setup({ className: "sticky" });

    expect(bar).toHaveClass("sticky", "bg-store-accent");
  });
});
