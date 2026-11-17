import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { StoreBreadcrumb } from "./store-breadcrumb";

function setup() {
  render(
    <StoreBreadcrumb
      className="custom"
      items={[
        { href: "/", name: "Inicio" },
        { href: "/bijouterie", lang: "es", name: "Bijouterie" },
        { lang: "en", name: "Rings" },
      ]}
      label="Ruta"
    />
  );

  return { trail: screen.getByRole("navigation", { name: "Ruta" }) };
}

test("lists the trail in order, every step a link but the page itself", () => {
  const { trail } = setup();

  expect(
    within(trail)
      .getAllByRole("listitem")
      .map((item) => [
        item.textContent,
        item.querySelector("a")?.getAttribute("href") ?? null,
      ])
  ).toEqual([
    ["Inicio", "/"],
    ["Bijouterie", "/bijouterie"],
    ["Rings", null],
  ]);
  expect(within(trail).getByRole("list").tagName).toBe("OL");
});

test("marks the page itself as current, in the language its name is in", () => {
  const { trail } = setup();

  const page = within(trail).getByText("Rings");
  expect(page).toHaveAttribute("aria-current", "page");
  expect(page).toHaveAttribute("lang", "en");
  expect(
    within(trail).getByRole("link", { name: "Bijouterie" })
  ).toHaveAttribute("lang", "es");
});

test("draws an arrow between steps that a screen reader does not read", () => {
  const { trail } = setup();

  const arrows = trail.querySelectorAll("svg");
  expect(arrows).toHaveLength(2);
  for (const arrow of arrows) {
    expect(arrow).toHaveAttribute("aria-hidden", "true");
  }
});

test("its links are 44 px targets with a visible focus ring, and it takes a className", () => {
  const { trail } = setup();

  for (const link of within(trail).getAllByRole("link")) {
    expect(link).toHaveClass("min-h-11", "focus-visible:outline-3");
  }
  expect(trail).toHaveClass("custom");
  expect(trail).toHaveAttribute("data-slot", "store-breadcrumb");
});
