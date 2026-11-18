import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { QueuedPhoto } from "@/lib/hooks/upload";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { type ProductPhoto, ProductPhotoGrid } from "./product-photo-grid";

function makePhoto(name: string, overrides: Partial<ProductPhoto> = {}) {
  return {
    height: 900,
    preview: `/seed/${name}.jpg`,
    url: `/seed/${name}.jpg`,
    width: 900,
    ...overrides,
  };
}

function makeQueued(key: string, state: QueuedPhoto["state"]): QueuedPhoto {
  return { key, name: `${key}.jpg`, preview: `blob:${key}`, state };
}

function setup({
  locale = "en",
  photos = [makePhoto("a"), makePhoto("b"), makePhoto("c")],
  queued = [],
}: {
  locale?: Locale;
  photos?: ReturnType<typeof makePhoto>[];
  queued?: QueuedPhoto[];
} = {}) {
  const spies = {
    onMakeMain: vi.fn<(index: number) => void>(),
    onMove: vi.fn<(from: number, to: number) => void>(),
    onRemove: vi.fn<(index: number) => void>(),
    onRemoveQueued: vi.fn<(key: string) => void>(),
    onRetry: vi.fn<(key: string) => void>(),
  };
  const user = userEvent.setup();
  renderWithI18n(
    <ProductPhotoGrid {...spies} photos={photos} queued={queued} />,
    { locale }
  );
  const tiles = () => screen.getAllByTestId("product-photo");
  const tile = (index: number) => {
    const found = tiles()[index];

    if (!found) {
      throw new Error(`No tile ${index}`);
    }

    return within(found);
  };
  /** Gives each tile its own place, 200px apart: happy-dom lays nothing out. */
  const layOut = () => {
    for (const [index, element] of tiles().entries()) {
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ height: 180, width: 180, x: index * 200, y: 0 })
      );
    }
  };
  /** dnd-kit's live region, which says what a drag is doing. */
  const dragAnnouncer = () =>
    screen
      .getAllByRole("status")
      .find((region) => region.id.includes("DndLiveRegion"));

  return { dragAnnouncer, layOut, spies, tile, tiles, user };
}

describe("ProductPhotoGrid", () => {
  test("lists the photos in order, the first marked as the main one", () => {
    const { tiles } = setup();

    expect(
      screen.getByRole("list", { name: "Photos, in the store's order" })
    ).toBeInTheDocument();
    expect(tiles().map((tile) => tile.dataset.main)).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(within(tiles()[0] ?? document.body).getByText("Main")).toBeVisible();
    expect(within(tiles()[1] ?? document.body).queryByText("Main")).toBeNull();
  });

  test("names every control with its photo", () => {
    const { tile } = setup();

    expect(
      tile(1)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual([
      "Drag to reorder: Photo 2",
      "Remove: Photo 2",
      "Move earlier: Photo 2",
      "Use as the main photo: Photo 2",
      "Move later: Photo 2",
    ]);
  });

  test("draws a photo stored on the site through the optimizer, and one from this device as it is", () => {
    setup({
      photos: [makePhoto("a"), makePhoto("b", { preview: "blob:local-b" })],
    });

    const [stored, local] = screen
      .getAllByTestId("product-photo")
      .map((tile) => tile.querySelector("img"));
    expect(
      new URL(
        stored?.getAttribute("src") ?? "",
        "http://localhost"
      ).searchParams.get("url")
    ).toBe("/seed/a.jpg");
    expect(local).toHaveAttribute("src", "blob:local-b");
  });

  test.each([
    ["the first photo earlier", 0, "Move earlier: Photo 1", true],
    ["the first photo later", 0, "Move later: Photo 1", false],
    ["the last photo later", 2, "Move later: Photo 3", true],
    ["the last photo earlier", 2, "Move earlier: Photo 3", false],
  ])(
    "moving %s is refused: %s, and the button stays focusable",
    async (_case, index, name, refused) => {
      const { spies, tile, user } = setup();
      const button = tile(index).getByRole("button", { name });

      // Never `disabled`: a move that lands a photo at an end would drop
      // the focused button's focus to the page.
      expect(button).toHaveProperty("disabled", false);
      expect(button.getAttribute("aria-disabled")).toBe(
        refused ? "true" : null
      );

      await user.click(button);

      // The middle place is the one either allowed move lands on.
      expect(spies.onMove.mock.calls).toEqual(refused ? [] : [[index, 1]]);
    }
  );

  test("moves a photo one place with its buttons", async () => {
    const { spies, tile, user } = setup();

    await user.click(
      tile(0).getByRole("button", { name: "Move later: Photo 1" })
    );
    await user.click(
      tile(2).getByRole("button", { name: "Move earlier: Photo 3" })
    );

    expect(spies.onMove.mock.calls).toEqual([
      [0, 1],
      [2, 1],
    ]);
  });

  test("makes another photo the main one, and the main one stays as it is", async () => {
    const { spies, tile, user } = setup();
    const main = tile(0).getByRole("button", {
      name: "It is the main photo: Photo 1",
    });

    expect(main).toHaveAttribute("aria-disabled", "true");
    expect(
      tile(2).getByRole("button", { name: "Use as the main photo: Photo 3" })
    ).not.toHaveAttribute("aria-disabled");

    await user.click(main);
    await user.click(
      tile(2).getByRole("button", { name: "Use as the main photo: Photo 3" })
    );

    expect(spies.onMakeMain).toHaveBeenCalledExactlyOnceWith(2);
  });

  test("removes a photo by its place", async () => {
    const { spies, tile, user } = setup();

    await user.click(tile(1).getByRole("button", { name: "Remove: Photo 2" }));

    expect(spies.onRemove).toHaveBeenCalledExactlyOnceWith(1);
  });

  test("moves a photo by keyboard on its handle, and says each step by the photo's place", async () => {
    const { dragAnnouncer, layOut, spies, tile, user } = setup();
    layOut();
    const handle = tile(0).getByRole("button", {
      name: "Drag to reorder: Photo 1",
    });
    expect(handle).toHaveAccessibleDescription(
      "To reorder with the keyboard, press space on the handle, move it with the arrow keys and press space again to drop it, or Escape to cancel."
    );
    handle.focus();

    await user.keyboard(" ");
    await waitFor(() => {
      expect(dragAnnouncer()).toHaveTextContent(/^You picked up Photo 1\.$/u);
    });
    await user.keyboard("{ArrowRight}");
    await waitFor(() => {
      expect(dragAnnouncer()).toHaveTextContent(
        /^Photo 1 is over Photo 2's place\.$/u
      );
    });
    await user.keyboard(" ");

    await waitFor(() => {
      expect(spies.onMove).toHaveBeenCalledExactlyOnceWith(0, 1);
    });
  });

  test("a keyboard drag dropped where it started moves nothing and says so", async () => {
    const { dragAnnouncer, layOut, spies, tile, user } = setup();
    layOut();
    tile(1).getByRole("button", { name: "Drag to reorder: Photo 2" }).focus();

    await user.keyboard(" ");
    await user.keyboard(" ");

    await waitFor(() => {
      expect(dragAnnouncer()).toHaveTextContent(
        /^Photo 2 stayed where it was\.$/u
      );
    });
    expect(spies.onMove).not.toHaveBeenCalled();
  });

  test("a cancelled keyboard drag moves nothing and says so", async () => {
    const { dragAnnouncer, layOut, spies, tile, user } = setup();
    layOut();
    tile(0).getByRole("button", { name: "Drag to reorder: Photo 1" }).focus();

    await user.keyboard(" ");
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(dragAnnouncer()).toHaveTextContent(
        /^Move cancelled: Photo 1 stayed where it was\.$/u
      );
    });
    expect(spies.onMove).not.toHaveBeenCalled();
  });

  test.each([
    ["waiting", { status: "waiting" }, "Waiting", undefined],
    ["preparing", { status: "preparing" }, "Preparing…", undefined],
    ["uploading", { percent: 42, status: "uploading" }, "Uploading… 42%", "42"],
  ] as const)(
    "shows a photo %s after the article's own, with its progress and a cancel",
    async (_case, state, said, value) => {
      const { spies, user } = setup({
        photos: [makePhoto("a")],
        queued: [makeQueued("photo-9", state)],
      });
      const queued = within(screen.getByTestId("product-photo-queued"));

      expect(queued.getByText(said)).toBeVisible();
      const progress = queued.getByRole("progressbar", {
        name: "Upload progress: Photo 2",
      });
      expect(progress.getAttribute("value") ?? undefined).toBe(value);
      expect(queued.getByRole("img")).toHaveAttribute("src", "blob:photo-9");

      await user.click(
        queued.getByRole("button", { name: "Cancel the upload: Photo 2" })
      );
      expect(spies.onRemoveQueued).toHaveBeenCalledExactlyOnceWith("photo-9");
    }
  );

  test("says why a photo failed, offers a retry, and discards it", async () => {
    const { spies, user } = setup({
      photos: [],
      queued: [makeQueued("photo-3", { reason: "failed", status: "failed" })],
    });
    const queued = within(screen.getByTestId("product-photo-queued"));

    expect(queued.getByRole("alert")).toHaveTextContent(
      "The photo could not be uploaded. Check the connection and retry."
    );
    expect(queued.queryByRole("progressbar")).toBeNull();

    await user.click(queued.getByRole("button", { name: "Retry: Photo 1" }));
    await user.click(queued.getByRole("button", { name: "Discard: Photo 1" }));

    expect(spies.onRetry).toHaveBeenCalledExactlyOnceWith("photo-3");
    expect(spies.onRemoveQueued).toHaveBeenCalledExactlyOnceWith("photo-3");
  });

  // The owner's review (FER-017, 2026-11-18): a failed photo spilled out of
  // its tile. happy-dom lays nothing out, so this holds the classes that
  // keep it in; the e2e measures the boxes.
  test("keeps a failed photo, its words and its buttons inside its tile, the words wrapping", () => {
    setup({
      photos: [],
      queued: [
        makeQueued("photo-3", { reason: "notConfigured", status: "failed" }),
      ],
    });
    const tile = screen.getByTestId("product-photo-queued");
    const status = screen.getByTestId("product-photo-queued-status");

    expect(tile).toHaveClass("grid-cols-1", "min-w-0", "overflow-hidden");
    expect(screen.getByTestId("product-photo-queued-frame")).toHaveClass(
      "aspect-square",
      "min-w-0",
      "overflow-hidden"
    );
    expect(status).toHaveClass("wrap-break-word");
    expect(status).not.toHaveClass("truncate");
    expect(status).toHaveTextContent(
      "Photo uploads aren't set up on this server."
    );
    expect(
      within(tile).getByRole("button", { name: "Discard: Photo 1" })
    ).toBeVisible();
  });

  test("shows the retry's word on the button, under the reason", () => {
    setup({
      photos: [],
      queued: [makeQueued("photo-3", { reason: "failed", status: "failed" })],
    });

    expect(
      screen.getByRole("button", { name: "Retry: Photo 1" })
    ).toHaveTextContent("Retry");
  });

  test.each(["tooLarge", "unreadable", "notConfigured"] as const)(
    "offers no retry for a photo that failed as %s",
    (reason) => {
      setup({
        photos: [],
        queued: [makeQueued("photo-3", { reason, status: "failed" })],
      });
      const queued = within(screen.getByTestId("product-photo-queued"));

      expect(queued.queryByRole("button", { name: /^Retry/u })).toBeNull();
      expect(
        queued.getByRole("button", { name: "Discard: Photo 1" })
      ).toBeVisible();
    }
  );

  test("in Spanish, names the controls in Spanish", () => {
    const { tile } = setup({ locale: "es" });

    expect(
      tile(0).getByRole("button", { name: "Es la principal: Foto 1" })
    ).toBeVisible();
    expect(tile(0).getByText("Principal")).toBeVisible();
    expect(
      tile(1).getByRole("button", { name: "Mover después: Foto 2" })
    ).toBeVisible();
  });
});
