import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import AdminLayout, { generateMetadata } from "./layout";

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

describe("AdminLayout", () => {
  test("adds no chrome: it renders the page it wraps, as it is", () => {
    render(
      <AdminLayout>
        <p>Admin page</p>
      </AdminLayout>
    );

    expect(document.body.firstElementChild?.innerHTML).toBe(
      "<p>Admin page</p>"
    );
    expect(screen.getByText("Admin page")).toBeInTheDocument();
  });
});

describe("generateMetadata", () => {
  test.each([
    ["es", "Panel"],
    ["en", "Admin"],
  ])(
    "in %s, titles the admin %j and keeps it out of search engines",
    async (locale, title) => {
      await expect(
        generateMetadata({ params: makeParams(locale) })
      ).resolves.toEqual({
        robots: { follow: false, index: false },
        title,
      });
    }
  );

  test("answers 404 for a language the product does not speak", async () => {
    await expect(
      generateMetadata({ params: makeParams("fr") })
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});
