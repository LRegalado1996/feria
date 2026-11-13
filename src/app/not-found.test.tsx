import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import NotFound, { metadata } from "./not-found";

describe("NotFound", () => {
  test("offers a way back to the home page", () => {
    render(<NotFound />);

    expect(
      screen.getByRole("heading", { name: "Page not found" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("not-found-home-link")).toHaveAttribute(
      "href",
      "/"
    );
  });

  test("titles the document", () => {
    expect(metadata.title).toBe("Page not found");
  });
});
