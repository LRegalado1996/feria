import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import useEmblaCarousel from "embla-carousel-react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { ImageUploaderProps } from "@/app/_components/molecules/image-uploader";
import { Toaster } from "@/app/_components/molecules/sonner";
import { reportError } from "@/lib/errors/client";
import type { PageCurationData } from "@/lib/hooks/page";
import type { Locale } from "@/lib/i18n/config";
import { createFakeEmbla } from "@/test/embla";
import {
  makeHomeArticle,
  makeHomeBanner,
  makeHomeCategory,
  makeHomeCuration,
  makeHomePage,
  makeHomeSpotlight,
} from "@/test/factories/home-curation";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { stubReducedMotion } from "@/test/reduced-motion";

import { PageEditor } from "./page-editor";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

// The preview's rows measure a layout happy-dom does not have.
vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));

const UPLOADED = {
  height: 1067,
  url: "https://store9.public.blob.vercel-storage.com/local/banner/0f8e2b9c-1d2a-4b3c-8d4e-5f6a7b8c9d0e.webp",
  width: 1600,
};
const STORED = {
  height: 800,
  url: "https://store9.public.blob.vercel-storage.com/local/banner/2f8e2b9c-1d2a-4b3c-8d4e-5f6a7b8c9d0e.webp",
  width: 1200,
};

// The uploader has its own tests (FER-011): here a button hands the form a
// photo.
vi.mock("@/app/_components/molecules/image-uploader", () => ({
  ImageUploader: ({ label, onChange }: ImageUploaderProps) => (
    <fieldset aria-label={label}>
      <button
        onClick={() => {
          onChange(UPLOADED);
        }}
        type="button"
      >
        {`upload ${label}`}
      </button>
    </fieldset>
  ),
}));

const FAILURE = {
  code: "INTERNAL_SERVER_ERROR",
  message: "Internal server error",
  status: 500,
};

/**
 * A home with a showing cover banner, a scheduled banner between rows whose
 * article is a draft, one category with a published and a sold-out
 * article, and best sellers that cannot show (a draft, the sold-out one and
 * one the screen does not know).
 */
function makeData(overrides: Partial<PageCurationData> = {}): PageCurationData {
  return makeHomeCuration({
    articles: [
      makeHomeArticle(),
      makeHomeArticle({
        categoryId: null,
        id: 22,
        slug: "articulo",
        status: "draft",
        titleEn: null,
        titleEs: "",
      }),
      makeHomeArticle({
        id: 23,
        isAvailable: false,
        slug: "cadena-corona",
        titleEn: null,
        titleEs: "Cadena corona",
      }),
    ],
    banners: [
      makeHomeBanner({ image: STORED }),
      makeHomeBanner({
        href: null,
        id: 32,
        image: STORED,
        link: { kind: "product", productId: 22 },
        placement: "rows",
        startsOn: "2026-12-05",
        titleEn: null,
        titleEs: "Feria",
      }),
    ],
    categories: [makeHomeCategory()],
    coverBannerIds: [31],
    rankingProductIds: [22, 23, 99],
    sections: [
      { kind: "best_sellers" },
      { bannerId: 32, kind: "banner" },
      { categoryId: 4, kind: "category" },
      { kind: "featured" },
      { bannerId: 99, kind: "banner" },
      { categoryId: 99, kind: "category" },
    ],
    ...overrides,
  });
}

type Outcome = "fail" | "hang" | "ok";

/** A procedure that answers, fails, or never answers. */
function answer(
  path: string,
  spy: (input: unknown) => unknown,
  outcome: Outcome
) {
  if (outcome === "fail") {
    return createOrpcErrorHandler(path, FAILURE);
  }

  return createOrpcHandler(path, async (input) => {
    const output = spy(input);
    return outcome === "hang" ? await new Promise<never>(() => {}) : output;
  });
}

function setup({
  data = makeData(),
  get = "ok",
  locale = "en",
  write = "ok",
}: {
  data?: PageCurationData;
  get?: Outcome;
  locale?: Locale;
  write?: Outcome | "conflict";
} = {}) {
  stubReducedMotion(false);
  vi.mocked(useEmblaCarousel).mockReturnValue(
    createFakeEmbla({ snaps: 1 }).hook
  );
  const spies = {
    createBanner: vi.fn((_input: unknown) => ({ id: 40 })),
    createSpotlight: vi.fn((_input: unknown) => ({ id: 52 })),
    deleteSpotlight: vi.fn((_input: unknown) => ({ id: 51 })),
    updateSpotlight: vi.fn((_input: unknown) => ({ id: 51 })),
    deleteBanner: vi.fn((_input: unknown) => ({ id: 31 })),
    get: vi.fn((_input: unknown) => data),
    saveAnnouncement: vi.fn((_input: unknown) => ({ id: 1 })),
    saveLayout: vi.fn((input: unknown) => input),
    update: vi.fn((_input: unknown) => ({ id: 1, slug: "home" })),
    updateBanner: vi.fn((_input: unknown) => ({ id: 31 })),
  };
  // A taken address is the settings' answer only.
  const others = write === "conflict" ? "ok" : write;
  server.use(
    answer("page.get", spies.get, get),
    answer("page.saveAnnouncement", spies.saveAnnouncement, others),
    answer("page.createBanner", spies.createBanner, others),
    answer("page.updateBanner", spies.updateBanner, others),
    answer("page.deleteBanner", spies.deleteBanner, others),
    answer("page.saveLayout", spies.saveLayout, others),
    answer("page.createSpotlight", spies.createSpotlight, others),
    answer("page.updateSpotlight", spies.updateSpotlight, others),
    answer("page.deleteSpotlight", spies.deleteSpotlight, others),
    write === "conflict"
      ? createOrpcErrorHandler("page.update", {
          code: "CONFLICT",
          message: "Another page or category already has that address",
          status: 409,
        })
      : answer("page.update", spies.update, others)
  );
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    );
  }

  renderWithI18n(<PageEditor pageId={1} />, { locale, wrapper: Providers });
  const user = userEvent.setup();

  return {
    loaded: async () => await screen.findByTestId("page-layout-editor"),
    /** `page.get` answers `next` from now on, and the screen reads it again. */
    refresh: async (next: PageCurationData) => {
      spies.get.mockReturnValue(next);
      await queryClient.invalidateQueries();
    },
    spies,
    user,
  };
}

/** The names a list of the order shows, top to bottom. */
function listed(testId: string): (string | null | undefined)[] {
  return screen
    .getAllByTestId(testId)
    .map((item) => item.querySelector("p")?.textContent);
}

/** The title of the banner the preview's cover shows first. */
function coverTitle(): string | null | undefined {
  return screen
    .getByTestId("store-home-preview-cover")
    .querySelector('[data-slot="store-banner"]')?.textContent;
}

/** A saved announcement, on, with only its Spanish line. */
const ANNOUNCEMENT: NonNullable<PageCurationData["announcement"]> = {
  endsOn: null,
  isActive: true,
  linkUrl: null,
  shortTextEn: null,
  shortTextEs: null,
  startsOn: null,
  textEn: null,
  textEs: "Hola feria",
};

/** A second cover banner, which a refreshed home adds. */
const NEW_COVER = makeHomeBanner({ id: 33, titleEn: "Rings sale" });

/** A save of the order that hangs until the test lets it go. */
function holdLayoutSave() {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    createOrpcHandler("page.saveLayout", async (input) => {
      await held;
      return input;
    })
  );

  return release;
}

describe("PageEditor", () => {
  test("shows a busy skeleton and no save button while the home loads", async () => {
    const { spies } = setup({ get: "hang" });

    // The page's name is not known yet: the section's.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Pages$/u
    );
    const skeleton = screen.getByTestId("home-curation-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton).toHaveTextContent(/^Loading$/u);
    expect(screen.queryByTestId("admin-primary-action")).toBeNull();
    await waitFor(() => {
      expect(spies.get).toHaveBeenCalledExactlyOnceWith({ pageId: 1 });
    });
  });

  test("says the home failed to load and loads it again on retry", async () => {
    const { spies, user } = setup({ get: "fail" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/^We couldn't load the page\.Try again$/u);
    expect(screen.queryByTestId("admin-primary-action")).toBeNull();

    server.use(createOrpcHandler("page.get", spies.get));
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByTestId("page-layout-editor")).toBeVisible();
    expect(screen.queryByText(/load the page/u)).toBeNull();
  });

  test("lists the banners with where they go, whether they show today and a warning for a draft's link", async () => {
    const { loaded } = setup();
    await loaded();

    const rows = screen.getAllByTestId("home-banner-row");
    expect(rows.map((row) => row.querySelector("p")?.textContent)).toEqual([
      "Bubble guns",
      "Feria",
    ]);
    expect(
      rows.map(
        (row) => within(row).getByTestId("home-banner-status").textContent
      )
    ).toEqual(["Showing", "Scheduled"]);
    expect(
      within(rows[0] ?? document.body).queryByTestId("home-layout-warning")
    ).toBeNull();
    expect(
      within(rows[1] ?? document.body).getByTestId("home-layout-warning")
    ).toHaveTextContent(
      "The article it leads to is not published: the banner shows without a link."
    );
  });

  test("says when a banner of the store is not on this page", async () => {
    const { loaded } = setup({
      data: makeHomeCuration({
        banners: [makeHomeBanner({ placement: null, titleEn: "Elsewhere" })],
      }),
    });
    await loaded();

    expect(screen.getByTestId("home-banner-row")).toHaveTextContent(
      "Not on this page"
    );
    expect(screen.getByTestId("home-banner-row")).not.toHaveTextContent(
      "Cover"
    );
  });

  test("says when there is no banner yet", async () => {
    const { loaded } = setup({ data: makeHomeCuration() });
    await loaded();

    expect(screen.getByTestId("home-banners")).toHaveTextContent(
      "No banners yet. Add one for the cover or to go between two rows."
    );
  });

  test("names the rows and warns beside the curated articles the store leaves out", async () => {
    const { loaded } = setup();
    await loaded();

    const rows = within(screen.getByTestId("home-layout-rows"));
    expect(
      rows
        .getAllByTestId("home-layout-rows-item")
        .map((item) => item.querySelector("p")?.textContent)
    ).toEqual([
      "Best sellers",
      "Banner: Feria",
      "Rings",
      "Featured",
      "Banner: Untitled",
      "Untitled",
    ]);
    expect(rows.getByText("Scheduled")).toBeInTheDocument();
    expect(rows.getByText("Off")).toBeInTheDocument();
    expect(rows.getAllByText("No published articles: not shown")).toHaveLength(
      1
    );
    const best = screen
      .getAllByTestId("home-layout-best-sellers-item")
      .map((item) => [
        item.querySelector("p")?.textContent,
        within(item).queryByTestId("home-layout-warning")?.textContent ?? null,
      ]);
    expect(best).toEqual([
      ["Untitled", "It is not published: it doesn't appear in the store."],
      [
        "Cadena corona",
        "It is sold out: it doesn't appear in the store until it is available again.",
      ],
      ["Untitled", "It is not published: it doesn't appear in the store."],
    ]);
  });

  test("previews the home: the showing cover banner and the rows that have something to show", async () => {
    const { loaded } = setup();
    await loaded();

    const preview = within(screen.getByTestId("store-page-preview"));
    expect(screen.queryByTestId("store-announcement-bar")).toBeNull();
    expect(preview.getByTestId("store-home-preview-cover")).toHaveTextContent(
      "Bubble guns"
    );
    expect(
      preview.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    ).toEqual(["Bubble guns", "Rings", "Signet ring", "Cadena corona"]);
  });

  test("the preview shows the announcement as it is typed, before it is saved", async () => {
    const { loaded, user } = setup({ data: makeHomeCuration() });
    await loaded();

    await user.type(
      screen.getByRole("textbox", { name: "Text in Spanish" }),
      "Hola feria"
    );

    expect(
      within(screen.getByTestId("store-page-preview")).getByTestId(
        "store-announcement-bar"
      )
    ).toHaveTextContent(/^Hola feria$/u);
  });

  test("the preview keeps the saved featured articles while the ones typed do not read", async () => {
    const { loaded, user } = setup({
      data: makeHomeCuration({
        articles: [
          makeHomeArticle(),
          makeHomeArticle({ id: 24, slug: "b", titleEn: "Pearl necklace" }),
        ],
        featuredProductIds: [21, 24],
      }),
    });
    await loaded();
    const featured = () =>
      within(
        within(screen.getByTestId("store-page-preview"))
          .getByRole("heading", { name: "Featured" })
          .closest("section") ?? document.body
      )
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent);

    expect(featured()).toEqual(["Featured", "Signet ring", "Pearl necklace"]);
    await user.click(
      screen.getAllByRole("button", { name: "Remove: Signet ring" })[0] ??
        document.body
    );

    expect(listed("home-layout-featured-item")).toEqual(["Pearl necklace"]);
    // One featured article is not a valid order: the saved ones stay.
    expect(featured()).toEqual(["Featured", "Signet ring", "Pearl necklace"]);
  });

  test("the preview keeps a reordered cover while the featured articles typed do not read", async () => {
    const { loaded, user } = setup({
      data: makeData({
        banners: [makeHomeBanner({ image: STORED }), NEW_COVER],
        coverBannerIds: [31, 33],
      }),
    });
    await loaded();
    const cover = () => coverTitle();

    expect(cover()).toBe("Bubble guns");
    await user.click(
      screen.getByRole("button", { name: "Move down: Bubble guns" })
    );
    await user.selectOptions(
      within(screen.getByTestId("home-layout-featured")).getByRole("combobox"),
      "21"
    );
    await user.click(
      within(screen.getByTestId("home-layout-featured")).getByRole("button", {
        name: "Add",
      })
    );

    expect(listed("home-layout-featured-item")).toEqual(["Signet ring"]);
    expect(cover()).toBe("Rings sale");
  });

  test("the preview keeps a reordered cover while even the saved featured articles do not read", async () => {
    // A featured article deleted since leaves the saved row with one.
    const { loaded, user } = setup({
      data: makeData({
        banners: [makeHomeBanner({ image: STORED }), NEW_COVER],
        coverBannerIds: [31, 33],
        featuredProductIds: [21],
      }),
    });
    await loaded();

    expect(coverTitle()).toBe("Bubble guns");
    await user.click(
      screen.getByRole("button", { name: "Move down: Bubble guns" })
    );

    expect(coverTitle()).toBe("Rings sale");
    expect(listed("home-layout-featured-item")).toEqual(["Signet ring"]);
  });

  test("saves the announcement and says so", async () => {
    const { loaded, spies, user } = setup({ data: makeHomeCuration() });
    await loaded();

    await user.type(
      screen.getByRole("textbox", { name: "Text in Spanish" }),
      "Hola feria"
    );
    await user.click(screen.getByTestId("announcement-form-submit"));

    expect(await screen.findByText("Announcement saved.")).toBeVisible();
    expect(spies.saveAnnouncement).toHaveBeenCalledExactlyOnceWith({
      endsOn: null,
      isActive: true,
      linkUrl: null,
      shortTextEn: null,
      shortTextEs: null,
      startsOn: null,
      textEn: null,
      textEs: "Hola feria",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  test("an untouched announcement shows the saved one when the home is read again", async () => {
    const { loaded, refresh } = setup({
      data: makeHomeCuration({ announcement: ANNOUNCEMENT }),
    });
    await loaded();
    const text = screen.getByRole("textbox", { name: "Text in Spanish" });
    expect(text).toHaveValue("Hola feria");

    await refresh(
      makeHomeCuration({
        announcement: { ...ANNOUNCEMENT, isActive: false, textEs: "Chau" },
      })
    );

    await waitFor(() => {
      expect(text).toHaveValue("Chau");
    });
    expect(
      screen.getByRole("checkbox", { name: "Show the announcement" })
    ).not.toBeChecked();
    expect(screen.queryByTestId("store-announcement-bar")).toBeNull();
  });

  test("an announcement being edited keeps its edits when the home is read again, and follows it once they are undone", async () => {
    const { loaded, refresh, user } = setup({
      data: makeHomeCuration({ announcement: ANNOUNCEMENT }),
    });
    await loaded();
    const text = screen.getByRole("textbox", { name: "Text in Spanish" });

    await user.type(text, "!");
    await refresh(
      makeHomeCuration({
        announcement: { ...ANNOUNCEMENT, textEs: "Chau" },
        banners: [NEW_COVER],
        coverBannerIds: [33],
      })
    );
    expect(
      await screen.findByRole("button", { name: "Edit banner: Rings sale" })
    ).toBeVisible();

    expect(text).toHaveValue("Hola feria!");
    await user.type(text, "{Backspace}");

    await waitFor(() => {
      expect(text).toHaveValue("Chau");
    });
  });

  test("a failed announcement says so and is reported", async () => {
    const { loaded, user } = setup({ data: makeHomeCuration(), write: "fail" });
    await loaded();

    await user.type(
      screen.getByRole("textbox", { name: "Text in Spanish" }),
      "Hola feria"
    );
    await user.click(screen.getByTestId("announcement-form-submit"));

    expect(
      await screen.findByText(
        "We couldn't save the announcement. What you wrote is still here: try again."
      )
    ).toBeVisible();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Home.save_announcement" }
    );
  });

  test("saves the order from the top bar and says so", async () => {
    const { loaded, spies, user } = setup();
    await loaded();

    await user.click(
      screen.getByRole("button", { name: "Move down: Best sellers" })
    );
    await user.click(
      within(screen.getByTestId("admin-primary-action")).getByRole("button", {
        name: "Save order",
      })
    );

    expect(await screen.findByText("Order saved.")).toBeVisible();
    expect(spies.saveLayout).toHaveBeenCalledExactlyOnceWith({
      coverBannerIds: [31],
      pageId: 1,
      featuredProductIds: [],
      rankingProductIds: [22, 23, 99],
      sections: [
        { bannerId: 32, kind: "banner" },
        { kind: "best_sellers" },
        { categoryId: 4, kind: "category" },
        { kind: "featured" },
        { bannerId: 99, kind: "banner" },
        { categoryId: 99, kind: "category" },
      ],
    });
  });

  test("an order moved and not saved keeps its order when a banner in it is deleted, and saves without it", async () => {
    const { loaded, spies, user } = setup();
    await loaded();
    const moveDown = async () => {
      await user.click(
        screen.getByRole("button", { name: "Move down: Best sellers" })
      );
    };

    await moveDown();
    await moveDown();
    spies.get.mockReturnValue(
      makeData({
        banners: [makeData().banners[0] ?? makeHomeBanner()],
        sections: [
          { kind: "best_sellers" },
          { categoryId: 4, kind: "category" },
          { kind: "featured" },
          { bannerId: 99, kind: "banner" },
          { categoryId: 99, kind: "category" },
        ],
      })
    );
    await user.click(
      screen.getByRole("button", { name: "Delete banner: Feria" })
    );
    await user.click(await screen.findByTestId("confirm-dialog-confirm"));
    expect(await screen.findByText("Banner deleted.")).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByText("Banner: Feria")).toBeNull();
    });
    await user.click(
      within(screen.getByTestId("admin-primary-action")).getByRole("button", {
        name: "Save order",
      })
    );

    expect(await screen.findByText("Order saved.")).toBeVisible();
    expect(spies.saveLayout).toHaveBeenCalledExactlyOnceWith({
      coverBannerIds: [31],
      pageId: 1,
      featuredProductIds: [],
      rankingProductIds: [22, 23, 99],
      sections: [
        { categoryId: 4, kind: "category" },
        { kind: "best_sellers" },
        { kind: "featured" },
        { bannerId: 99, kind: "banner" },
        { categoryId: 99, kind: "category" },
      ],
    });
  });

  test("a spotlight created while the order has unsaved moves joins it at the server's place, and saves with it", async () => {
    const { loaded, spies, user } = setup();
    await loaded();

    await user.click(
      screen.getByRole("button", { name: "Move down: Best sellers" })
    );
    // The server put the new spotlight first, right under the cover.
    spies.get.mockReturnValue(
      makeData({
        sections: [
          { kind: "spotlight", spotlightId: 52 },
          ...makeData().sections,
        ],
        spotlights: [makeHomeSpotlight({ id: 52 })],
      })
    );
    await user.click(screen.getByTestId("home-spotlight-add"));
    const sheet = await screen.findByRole("dialog", { name: "New spotlight" });
    await user.selectOptions(
      within(sheet).getByRole("combobox", { name: "Article" }),
      "Signet ring"
    );
    await user.click(within(sheet).getByTestId("spotlight-form-submit"));
    expect(await screen.findByText("Spotlight added.")).toBeVisible();
    expect(
      await within(screen.getByTestId("page-layout-editor")).findByText(
        "Spotlight: Signet ring"
      )
    ).toBeVisible();
    await user.click(
      within(screen.getByTestId("admin-primary-action")).getByRole("button", {
        name: "Save order",
      })
    );

    expect(await screen.findByText("Order saved.")).toBeVisible();
    // The move kept, the spotlight where the server placed it.
    expect(spies.saveLayout).toHaveBeenCalledExactlyOnceWith({
      coverBannerIds: [31],
      pageId: 1,
      featuredProductIds: [],
      rankingProductIds: [22, 23, 99],
      sections: [
        { kind: "spotlight", spotlightId: 52 },
        { bannerId: 32, kind: "banner" },
        { kind: "best_sellers" },
        { categoryId: 4, kind: "category" },
        { kind: "featured" },
        { bannerId: 99, kind: "banner" },
        { categoryId: 99, kind: "category" },
      ],
    });
  });

  test("an order moved and not saved shows its order on screen when the home is read again", async () => {
    const { loaded, refresh, user } = setup();
    await loaded();

    await user.click(
      screen.getByRole("button", { name: "Move down: Best sellers" })
    );
    await refresh(
      makeData({
        banners: [...makeData().banners, NEW_COVER],
        coverBannerIds: [31, 33],
      })
    );

    await waitFor(() => {
      expect(listed("home-layout-cover-item")).toEqual([
        "Bubble guns",
        "Rings sale",
      ]);
    });
    expect(listed("home-layout-rows-item")).toEqual([
      "Banner: Feria",
      "Best sellers",
      "Rings",
      "Featured",
      "Banner: Untitled",
      "Untitled",
    ]);
  });

  test("the order stays locked while it saves, though the home is read again meanwhile, and follows the home once saved", async () => {
    const { loaded, refresh, spies, user } = setup();
    await loaded();
    const release = holdLayoutSave();

    await user.click(
      screen.getByRole("button", { name: "Move down: Best sellers" })
    );
    await user.click(
      within(screen.getByTestId("admin-primary-action")).getByRole("button")
    );
    const up = screen.getByRole("button", { name: "Move up: Best sellers" });
    await waitFor(() => {
      expect(up).toBeDisabled();
    });
    await refresh(
      makeData({
        banners: [...makeData().banners, NEW_COVER],
        coverBannerIds: [31, 33],
      })
    );
    expect(
      await screen.findByRole("button", { name: "Edit banner: Rings sale" })
    ).toBeVisible();

    expect(up).toBeDisabled();
    expect(listed("home-layout-cover-item")).toEqual(["Bubble guns"]);

    release();

    expect(await screen.findByText("Order saved.")).toBeVisible();
    await waitFor(() => {
      expect(listed("home-layout-cover-item")).toEqual([
        "Bubble guns",
        "Rings sale",
      ]);
    });
    expect(listed("home-layout-rows-item")).toEqual([
      "Banner: Feria",
      "Best sellers",
      "Rings",
      "Featured",
      "Banner: Untitled",
      "Untitled",
    ]);
    expect(
      screen.getByRole("button", { name: "Move up: Best sellers" })
    ).toBeEnabled();
    expect(spies.get).toHaveBeenCalledTimes(3);
  });

  test("a failed order says so and is reported", async () => {
    const { loaded, user } = setup({ write: "fail" });
    await loaded();

    await user.click(
      within(screen.getByTestId("admin-primary-action")).getByRole("button")
    );

    expect(
      await screen.findByText(
        "We couldn't save the order. Your changes are still here: try again."
      )
    ).toBeVisible();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Home.save_layout" }
    );
  });

  test("while the order saves, its button says so and cannot be pressed again", async () => {
    const { loaded, user } = setup({ write: "hang" });
    await loaded();
    const button = within(screen.getByTestId("admin-primary-action")).getByRole(
      "button"
    );

    await user.click(button);

    await waitFor(() => {
      expect(button).toHaveTextContent(/^Saving…$/u);
    });
    expect(button).toBeDisabled();
  });

  test("adds a banner from the side sheet, says so, closes it and hands focus back", async () => {
    const { loaded, spies, user } = setup();
    await loaded();
    const add = screen.getByTestId("home-banner-add");

    await user.click(add);
    const sheet = await screen.findByRole("dialog", { name: "New banner" });
    await user.click(
      within(sheet).getByRole("button", { name: "upload Computer photo" })
    );
    await user.type(
      within(sheet).getByRole("textbox", { name: "Title in Spanish" }),
      "Joyas"
    );
    await user.click(within(sheet).getByTestId("banner-form-submit"));

    expect(await screen.findByText("Banner added.")).toBeVisible();
    expect(spies.createBanner).toHaveBeenCalledExactlyOnceWith({
      ctaLabelEn: null,
      ctaLabelEs: null,
      endsOn: null,
      image: UPLOADED,
      imagePhone: null,
      isActive: true,
      link: { kind: "none" },
      pageId: 1,
      placement: "cover",
      startsOn: null,
      titleEn: null,
      titleEs: "Joyas",
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(add).toHaveFocus();
  });

  test("edits a banner without sending the photos it kept, its place among the rows offered", async () => {
    const { loaded, spies, user } = setup();
    await loaded();

    await user.click(
      screen.getByRole("button", { name: "Edit banner: Feria" })
    );
    const sheet = await screen.findByRole("dialog", { name: "Edit banner" });
    const after = within(sheet).getByRole("combobox", { name: "After" });
    expect(after).toHaveValue("1");
    expect(
      within(after)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual([
      "Before the first row",
      "Best sellers",
      "Rings",
      "Featured",
      "Banner: Untitled",
      "Untitled",
    ]);
    await user.click(within(sheet).getByTestId("banner-form-submit"));

    expect(await screen.findByText("Banner saved.")).toBeVisible();
    // The photos the form did not change are left out: the server keeps
    // them, a seeded one included.
    expect(spies.updateBanner).toHaveBeenCalledExactlyOnceWith({
      ctaLabelEn: null,
      ctaLabelEs: null,
      endsOn: null,
      id: 32,
      isActive: true,
      link: { kind: "product", productId: 22 },
      pageId: 1,
      placement: "rows",
      rowsIndex: 1,
      startsOn: "2026-12-05",
      titleEn: null,
      titleEs: "Feria",
    });
  });

  test("sends a photo the form changed", async () => {
    const { loaded, spies, user } = setup();
    await loaded();

    await user.click(
      screen.getByRole("button", { name: "Edit banner: Bubble guns" })
    );
    const sheet = await screen.findByRole("dialog", { name: "Edit banner" });
    await user.click(
      within(sheet).getByRole("button", { name: "upload Phone photo" })
    );
    await user.click(within(sheet).getByTestId("banner-form-submit"));

    await waitFor(() => {
      expect(spies.updateBanner).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: 31, imagePhone: UPLOADED })
      );
    });
    expect(spies.updateBanner.mock.calls[0]?.[0]).not.toHaveProperty("image");
  });

  test("a failed banner keeps the sheet open, says so in it, and is reported", async () => {
    const { loaded, user } = setup({ write: "fail" });
    await loaded();

    await user.click(
      screen.getByRole("button", { name: "Edit banner: Bubble guns" })
    );
    const sheet = await screen.findByRole("dialog", { name: "Edit banner" });
    await user.click(within(sheet).getByTestId("banner-form-submit"));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "We couldn't save the banner. What you wrote is still here: try again."
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Home.update_banner" }
    );
  });

  test("a banner refused because the cover is full says so in the sheet, unreported", async () => {
    const { loaded, user } = setup();
    await loaded();
    server.use(
      createOrpcErrorHandler("page.updateBanner", {
        code: "CONFLICT",
        message: "The cover holds at most 6 banners",
        status: 409,
      })
    );

    await user.click(
      screen.getByRole("button", { name: "Edit banner: Feria" })
    );
    const sheet = await screen.findByRole("dialog", { name: "Edit banner" });
    await user.selectOptions(
      within(sheet).getByRole("combobox", { name: "Where it goes" }),
      "cover"
    );
    await user.click(within(sheet).getByTestId("banner-form-submit"));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      /^The cover already has 6 banners: take one out of the cover or put this one between rows\.$/u
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  test("a save that ends after its sheet was closed leaves the sheet opened since alone", async () => {
    const { loaded, user } = setup();
    await loaded();
    let release: (value: { id: number }) => void = () => undefined;
    const saved = new Promise<{ id: number }>((resolve) => {
      release = resolve;
    });
    server.use(createOrpcHandler("page.updateBanner", async () => await saved));

    await user.click(
      screen.getByRole("button", { name: "Edit banner: Bubble guns" })
    );
    const editSheet = await screen.findByRole("dialog", {
      name: "Edit banner",
    });
    await user.click(within(editSheet).getByTestId("banner-form-submit"));
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await user.click(screen.getByTestId("home-banner-add"));
    const newSheet = await screen.findByRole("dialog", { name: "New banner" });
    await user.type(
      within(newSheet).getByRole("textbox", { name: "Title in Spanish" }),
      "Joyas"
    );
    release({ id: 31 });

    expect(await screen.findByText("Banner saved.")).toBeVisible();
    expect(screen.getByRole("dialog", { name: "New banner" })).toBe(newSheet);
    expect(
      within(newSheet).getByRole("textbox", { name: "Title in Spanish" })
    ).toHaveValue("Joyas");
  });

  test("a failed new banner is reported as one", async () => {
    const { loaded, user } = setup({ write: "fail" });
    await loaded();

    await user.click(screen.getByTestId("home-banner-add"));
    const sheet = await screen.findByRole("dialog", { name: "New banner" });
    await user.click(
      within(sheet).getByRole("button", { name: "upload Computer photo" })
    );
    await user.type(
      within(sheet).getByRole("textbox", { name: "Title in Spanish" }),
      "Joyas"
    );
    await user.click(within(sheet).getByTestId("banner-form-submit"));

    await waitFor(() => {
      expect(reportError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
        { action: "Home.create_banner" }
      );
    });
  });

  test("cancelling the sheet closes it and hands focus back to what opened it", async () => {
    const { loaded, spies, user } = setup();
    await loaded();
    const edit = screen.getByRole("button", { name: "Edit banner: Feria" });

    await user.click(edit);
    const sheet = await screen.findByRole("dialog", { name: "Edit banner" });
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(edit).toHaveFocus();
    expect(spies.updateBanner).not.toHaveBeenCalled();
  });

  test("Escape closes the sheet too", async () => {
    const { loaded, user } = setup();
    await loaded();

    await user.click(screen.getByTestId("home-banner-add"));
    await screen.findByRole("dialog", { name: "New banner" });
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  test("deletes a banner after asking, says so, and hands focus to the list's button once it is gone", async () => {
    const { loaded, spies, user } = setup();
    await loaded();
    spies.get.mockReturnValue(
      makeData({
        banners: [makeData().banners[1] ?? makeHomeBanner()],
        coverBannerIds: [],
      })
    );

    await user.click(
      screen.getByRole("button", { name: "Delete banner: Bubble guns" })
    );
    const dialog = await screen.findByTestId("confirm-dialog");
    expect(dialog).toHaveTextContent(
      "“Bubble guns” and its photos are deleted. This can't be undone."
    );
    await user.click(within(dialog).getByTestId("confirm-dialog-confirm"));

    expect(await screen.findByText("Banner deleted.")).toBeVisible();
    expect(spies.deleteBanner).toHaveBeenCalledExactlyOnceWith({ id: 31 });
    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByTestId("home-banner-add")).toHaveFocus();
    });
  });

  test("a refused deletion says so, is reported, and hands focus back to the button that asked", async () => {
    const { loaded, user } = setup({ write: "fail" });
    await loaded();
    const remove = screen.getByRole("button", {
      name: "Delete banner: Bubble guns",
    });

    await user.click(remove);
    await user.click(await screen.findByTestId("confirm-dialog-confirm"));

    expect(
      await screen.findByText("We couldn't delete the banner. Try again.")
    ).toBeVisible();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Home.delete_banner" }
    );
    await waitFor(() => {
      expect(remove).toHaveFocus();
    });
  });

  test("a deletion that ends after its question was closed leaves the question asked since open", async () => {
    const { loaded, user } = setup();
    await loaded();
    let finish: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    server.use(
      createOrpcHandler("page.deleteBanner", async () => {
        await held;
        return { id: 31 };
      })
    );

    // Released whatever happens before it: a failed step leaves no request
    // hanging past the test.
    try {
      await user.click(
        screen.getByRole("button", { name: "Delete banner: Bubble guns" })
      );
      await user.click(await screen.findByTestId("confirm-dialog-confirm"));
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByTestId("confirm-dialog")).toBeNull();
      });
      await user.click(
        screen.getByRole("button", { name: "Delete banner: Feria" })
      );
      const second = await screen.findByTestId("confirm-dialog");
      finish();

      expect(await screen.findByText("Banner deleted.")).toBeVisible();
      expect(screen.getByTestId("confirm-dialog")).toBe(second);
      expect(second).toHaveTextContent(
        "“Feria” and its photos are deleted. This can't be undone."
      );
    } finally {
      finish();
    }
  });

  test("closing the question deletes nothing", async () => {
    const { loaded, spies, user } = setup();
    await loaded();

    await user.click(
      screen.getByRole("button", { name: "Delete banner: Bubble guns" })
    );
    const dialog = await screen.findByTestId("confirm-dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    });
    expect(spies.deleteBanner).not.toHaveBeenCalled();
  });

  test("speaks Spanish on a Spanish page", async () => {
    const { loaded } = setup({ locale: "es" });
    await loaded();

    // The page's own name: the home is "Home" in every language.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Home$/u
    );
    expect(
      screen
        .getAllByTestId("home-banner-row")
        .map((row) => row.querySelector("p")?.textContent)
    ).toEqual(["Burbujeros", "Feria"]);
    expect(
      within(screen.getByTestId("admin-primary-action")).getByRole("button")
    ).toHaveTextContent(/^Guardar orden$/u);
  });

  test("lists the article spotlights: the article, its label, whether it is on this page, and why the store leaves one out", async () => {
    const { loaded } = setup({
      data: makeData({
        sections: [
          { kind: "spotlight", spotlightId: 51 },
          { kind: "spotlight", spotlightId: 53 },
        ],
        spotlights: [
          makeHomeSpotlight(),
          makeHomeSpotlight({
            id: 52,
            labelEn: null,
            onPage: false,
            productId: 22,
          }),
          makeHomeSpotlight({ id: 53, productId: 23 }),
        ],
      }),
    });
    await loaded();

    const rows = within(screen.getByTestId("home-spotlights")).getAllByTestId(
      "home-spotlight-row"
    );
    expect(
      rows.map((row) => [
        row.querySelector("p")?.textContent,
        within(row).getByTestId("home-spotlight-status").textContent,
        within(row).queryByTestId("home-layout-warning")?.textContent ?? null,
      ])
    ).toEqual([
      ["Signet ring", "On this page", null],
      [
        "Untitled",
        "Not on this page",
        "It is not published: it doesn't appear in the store.",
      ],
      [
        "Cadena corona",
        "On this page",
        "It is sold out: it doesn't appear in the store until it is available again.",
      ],
    ]);
    // Its label in the screen's language, else the Spanish one.
    expect(rows[0]).toHaveTextContent("New");
    expect(rows[1]).toHaveTextContent("Nuevo");
    // In the page's order, named and warned like a curated article.
    expect(
      within(screen.getByTestId("home-layout-rows"))
        .getAllByTestId("home-layout-rows-item")
        .map((item) => [
          item.querySelector("p")?.textContent,
          within(item).queryByTestId("home-layout-warning")?.textContent ??
            null,
        ])
    ).toEqual([
      ["Spotlight: Signet ring", null],
      [
        "Spotlight: Cadena corona",
        "It is sold out: it doesn't appear in the store until it is available again.",
      ],
    ]);
  });

  test.each([
    ["en", "New", "Nuevo", "New", null],
    ["es", "New", "Nuevo", "Nuevo", null],
    ["en", null, "Nuevo", "Nuevo", "es"],
    ["es", "New", null, "New", "en"],
  ] as const)(
    "on a %s screen, a spotlight labelled %s and %s shows %s, marked as %s",
    async (locale, labelEn, labelEs, text, lang) => {
      const { loaded } = setup({
        data: makeData({
          spotlights: [makeHomeSpotlight({ labelEn, labelEs })],
        }),
        locale,
      });
      await loaded();

      const label = within(
        screen.getByTestId("home-spotlight-row")
      ).getByTestId("home-spotlight-label");
      expect(label).toHaveTextContent(text);
      expect(label.getAttribute("lang")).toBe(lang);
    }
  );

  test("a spotlight with no label shows none", async () => {
    const { loaded } = setup({
      data: makeData({
        spotlights: [makeHomeSpotlight({ labelEn: null, labelEs: null })],
      }),
    });
    await loaded();

    expect(
      within(screen.getByTestId("home-spotlight-row")).queryByTestId(
        "home-spotlight-label"
      )
    ).toBeNull();
  });

  test("says when there is no spotlight yet", async () => {
    const { loaded } = setup();
    await loaded();

    expect(screen.getByTestId("home-spotlights")).toHaveTextContent(
      "No spotlights yet. Add one to feature an article as people scroll the page."
    );
  });

  test("adds a spotlight to this page from the side sheet, offering the published articles, says so and hands focus back", async () => {
    const { loaded, spies, user } = setup();
    await loaded();
    const add = screen.getByTestId("home-spotlight-add");

    await user.click(add);
    const sheet = await screen.findByRole("dialog", { name: "New spotlight" });
    const article = within(sheet).getByRole("combobox", { name: "Article" });
    expect(
      [...article.querySelectorAll("option")].map(
        (option) => option.textContent
      )
    ).toEqual(["Choose…", "Signet ring", "Cadena corona"]);
    await user.selectOptions(article, "Signet ring");
    await user.type(
      within(sheet).getByRole("textbox", { name: "Label in Spanish" }),
      "Nuevo"
    );
    await user.click(within(sheet).getByTestId("spotlight-form-submit"));

    expect(await screen.findByText("Spotlight added.")).toBeVisible();
    expect(spies.createSpotlight).toHaveBeenCalledExactlyOnceWith({
      labelEn: null,
      labelEs: "Nuevo",
      pageId: 1,
      phraseEn: null,
      phraseEs: null,
      productId: 21,
      rowsIndex: 0,
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(add).toHaveFocus();
  });

  test("edits a spotlight opened on its place, offering the draft it features, and leaves the place to the server", async () => {
    const { loaded, spies, user } = setup({
      data: makeData({
        sections: [
          { kind: "best_sellers" },
          { kind: "spotlight", spotlightId: 51 },
        ],
        spotlights: [makeHomeSpotlight({ productId: 22 })],
      }),
    });
    await loaded();

    await user.click(
      screen.getByRole("button", { name: "Edit spotlight: Untitled" })
    );
    const sheet = await screen.findByRole("dialog", { name: "Edit spotlight" });
    expect(
      within(sheet).getByRole("combobox", { name: "Article" })
    ).toHaveValue("22");
    expect(within(sheet).getByRole("combobox", { name: "After" })).toHaveValue(
      "1"
    );
    await user.click(within(sheet).getByTestId("spotlight-form-submit"));

    expect(await screen.findByText("Spotlight saved.")).toBeVisible();
    expect(spies.updateSpotlight).toHaveBeenCalledExactlyOnceWith({
      id: 51,
      labelEn: "New",
      labelEs: "Nuevo",
      pageId: 1,
      phraseEn: "The one kids ask for most.",
      phraseEs: "El que más piden los chicos.",
      productId: 22,
    });
  });

  test.each([["a new one", "home-spotlight-add", "Home.create_spotlight"]])(
    "a failed save of %s keeps the sheet open, says so and is reported",
    async (_case, opener, action) => {
      const { loaded, user } = setup({ write: "fail" });
      await loaded();

      await user.click(screen.getByTestId(opener));
      const sheet = await screen.findByRole("dialog", {
        name: "New spotlight",
      });
      await user.selectOptions(
        within(sheet).getByRole("combobox", { name: "Article" }),
        "Signet ring"
      );
      await user.click(within(sheet).getByTestId("spotlight-form-submit"));

      expect(await within(sheet).findByRole("alert")).toHaveTextContent(
        "We could not save the spotlight. What you typed is still here: try again."
      );
      expect(reportError).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {
        action,
      });
    }
  );

  test("a failed edit is reported as one", async () => {
    const { loaded, user } = setup({
      data: makeData({ spotlights: [makeHomeSpotlight()] }),
      write: "fail",
    });
    await loaded();

    await user.click(
      screen.getByRole("button", { name: "Edit spotlight: Signet ring" })
    );
    await user.click(await screen.findByTestId("spotlight-form-submit"));

    await waitFor(() => {
      expect(reportError).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {
        action: "Home.update_spotlight",
      });
    });
  });

  test("a save that lands after its sheet was closed leaves the sheet opened since alone", async () => {
    const { loaded, user } = setup();
    await loaded();
    let finish: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    server.use(
      createOrpcHandler("page.createSpotlight", async () => {
        await held;
        return { id: 52 };
      })
    );
    const add = screen.getByTestId("home-spotlight-add");

    await user.click(add);
    const first = await screen.findByRole("dialog", { name: "New spotlight" });
    await user.selectOptions(
      within(first).getByRole("combobox", { name: "Article" }),
      "Signet ring"
    );
    // Released whatever happens before it: a failed step leaves no
    // request hanging past the test.
    try {
      await user.click(within(first).getByTestId("spotlight-form-submit"));
      expect(
        await within(first).findByRole("button", { name: "Saving…" })
      ).toBeDisabled();
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      await user.click(add);
      const second = await screen.findByRole("dialog", {
        name: "New spotlight",
      });
      const label = within(second).getByRole("textbox", {
        name: "Label in Spanish",
      });
      await user.type(label, "Otra");
      expect(label).toHaveValue("Otra");
      finish();

      expect(await screen.findByText("Spotlight added.")).toBeVisible();
      expect(screen.getByRole("dialog", { name: "New spotlight" })).toBe(
        second
      );
      expect(label).toHaveValue("Otra");
    } finally {
      finish();
    }
  });

  test("cancelling and Escape close the sheet and hand focus back", async () => {
    const { loaded, user } = setup();
    await loaded();
    const add = screen.getByTestId("home-spotlight-add");

    await user.click(add);
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Cancel",
      })
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(add).toHaveFocus();

    await user.click(add);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(add).toHaveFocus();
  });

  test("deletes a spotlight after asking, says so, and hands focus to the list's button once it is gone", async () => {
    const { loaded, spies, user } = setup({
      data: makeData({ spotlights: [makeHomeSpotlight()] }),
    });
    await loaded();
    spies.get.mockReturnValue(makeData());

    await user.click(
      screen.getByRole("button", { name: "Delete spotlight: Signet ring" })
    );
    const dialog = await screen.findByTestId("confirm-dialog");
    expect(dialog).toHaveTextContent(
      "The spotlight of “Signet ring” is deleted. The article stays as it is."
    );
    await user.click(within(dialog).getByTestId("confirm-dialog-confirm"));

    expect(await screen.findByText("Spotlight deleted.")).toBeVisible();
    expect(spies.deleteSpotlight).toHaveBeenCalledExactlyOnceWith({ id: 51 });
    await waitFor(() => {
      expect(screen.getByTestId("home-spotlight-add")).toHaveFocus();
    });
  });

  test("a refused deletion of a spotlight says so, is reported, and hands focus back to the button that asked", async () => {
    const { loaded, user } = setup({
      data: makeData({ spotlights: [makeHomeSpotlight()] }),
      write: "fail",
    });
    await loaded();
    const remove = screen.getByRole("button", {
      name: "Delete spotlight: Signet ring",
    });

    await user.click(remove);
    await user.click(await screen.findByTestId("confirm-dialog-confirm"));

    expect(
      await screen.findByText("We could not delete the spotlight. Try again.")
    ).toBeVisible();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {
      action: "Home.delete_spotlight",
    });
    await waitFor(() => {
      expect(remove).toHaveFocus();
    });
  });

  test("a spotlight deletion that ends after its question was closed leaves the question asked since open", async () => {
    const { loaded, user } = setup({
      data: makeData({
        spotlights: [
          makeHomeSpotlight(),
          makeHomeSpotlight({ id: 53, productId: 23 }),
        ],
      }),
    });
    await loaded();
    let finish: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    server.use(
      createOrpcHandler("page.deleteSpotlight", async () => {
        await held;
        return { id: 51 };
      })
    );

    // Released whatever happens before it: a failed step leaves no
    // request hanging past the test.
    try {
      await user.click(
        screen.getByRole("button", { name: "Delete spotlight: Signet ring" })
      );
      await user.click(await screen.findByTestId("confirm-dialog-confirm"));
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByTestId("confirm-dialog")).toBeNull();
      });
      await user.click(
        screen.getByRole("button", { name: "Delete spotlight: Cadena corona" })
      );
      const second = await screen.findByTestId("confirm-dialog");
      finish();

      expect(await screen.findByText("Spotlight deleted.")).toBeVisible();
      expect(screen.getByTestId("confirm-dialog")).toBe(second);
      expect(second).toHaveTextContent(
        "The spotlight of “Cadena corona” is deleted. The article stays as it is."
      );
    } finally {
      finish();
    }
  });

  test("closing the question deletes no spotlight", async () => {
    const { loaded, spies, user } = setup({
      data: makeData({ spotlights: [makeHomeSpotlight()] }),
    });
    await loaded();

    await user.click(
      screen.getByRole("button", { name: "Delete spotlight: Signet ring" })
    );
    await screen.findByTestId("confirm-dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    });
    expect(spies.deleteSpotlight).not.toHaveBeenCalled();
  });
});

describe("PageEditor on a page that is not the home (FER-060)", () => {
  const GIFTS = makeHomePage({
    id: 2,
    isHome: false,
    nameEn: "Christmas gifts",
    nameEs: "Regalos de Navidad",
    showInHeader: true,
    slug: "regalos",
  });

  test("titles the screen with the page's name, offers its blocks, and leaves the store's bar to the home", async () => {
    const { loaded } = setup({
      data: makeData({ page: GIFTS, sections: [] }),
    });

    await loaded();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Christmas gifts$/u
    );
    expect(screen.queryByTestId("announcement-form-submit")).toBeNull();
    expect(
      within(screen.getByTestId("page-add-block"))
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["Choose…", "Best sellers", "Featured", "Rings"]);
  });

  test("a block added and one taken out, not saved yet, stay so when the page is read again", async () => {
    const sections: PageCurationData["sections"] = [
      { categoryId: 4, kind: "category" },
      { kind: "featured" },
    ];
    const { loaded, refresh, user } = setup({
      data: makeData({ page: GIFTS, sections }),
    });
    await loaded();
    const add = screen.getByTestId("page-add-block");

    await user.selectOptions(
      within(add).getByRole("combobox", { name: "Block to add" }),
      "best_sellers"
    );
    await user.click(within(add).getByRole("button", { name: "Add block" }));
    await user.click(screen.getByRole("button", { name: "Remove: Featured" }));
    // Read again (its settings saved, a banner put between its rows): the
    // server still holds the featured row and never held the best sellers.
    await refresh(
      makeData({
        page: { ...GIFTS, showInHeader: false },
        sections: [...sections, { bannerId: 32, kind: "banner" }],
      })
    );

    await waitFor(() => {
      expect(listed("home-layout-rows-item")).toEqual([
        "Rings",
        "Best sellers",
        "Banner: Feria",
      ]);
    });
  });

  test("a block added and not saved goes when the page is read again without what it shows", async () => {
    const sections: PageCurationData["sections"] = [{ kind: "featured" }];
    const { loaded, refresh, user } = setup({
      data: makeData({ page: GIFTS, sections }),
    });
    await loaded();
    const add = screen.getByTestId("page-add-block");
    const block = within(add).getByRole("combobox", { name: "Block to add" });
    const press = within(add).getByRole("button", { name: "Add block" });

    await user.selectOptions(block, "Rings");
    await user.click(press);
    await user.selectOptions(block, "best_sellers");
    await user.click(press);
    // Rings deleted from the catalog in another tab: kept, it would have
    // every save refused.
    await refresh(makeData({ categories: [], page: GIFTS, sections }));

    await waitFor(() => {
      expect(listed("home-layout-rows-item")).toEqual([
        "Featured",
        "Best sellers",
      ]);
    });
  });

  test("saves its settings on their own, with its id, and says so", async () => {
    const { loaded, spies, user } = setup({ data: makeData({ page: GIFTS }) });
    await loaded();
    const settings = screen.getByTestId("page-settings");

    await user.click(
      within(settings).getByRole("checkbox", { name: "Show in the header" })
    );
    await user.click(within(settings).getByTestId("page-form-submit"));

    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
    expect(spies.update).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 2, showInHeader: false, slug: "regalos" })
    );
  });

  test("another admin's new address reaches the settings without undoing what this admin is typing", async () => {
    const { loaded, refresh, spies, user } = setup({
      data: makeData({ page: GIFTS }),
    });
    await loaded();
    const settings = screen.getByTestId("page-settings");
    const nameEs = within(settings).getByRole("textbox", {
      name: "Name in Spanish",
    });
    await user.clear(nameEs);
    await user.type(nameEs, "Mío");

    await refresh(makeData({ page: { ...GIFTS, slug: "navidad" } }));

    await waitFor(() => {
      expect(
        within(settings).getByRole("textbox", { name: "Address" })
      ).toHaveValue("navidad");
    });
    expect(
      within(settings).getByRole("textbox", { name: "Name in Spanish" })
    ).toHaveValue("Mío");
    await user.click(within(settings).getByTestId("page-form-submit"));
    await waitFor(() => {
      expect(spies.update).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: 2, nameEs: "Mío", slug: "navidad" })
      );
    });
  });

  test("an address taken is said under the address, reported to no one", async () => {
    const { loaded, user } = setup({
      data: makeData({ page: GIFTS }),
      write: "conflict",
    });
    await loaded();
    const settings = screen.getByTestId("page-settings");

    await user.click(within(settings).getByTestId("page-form-submit"));

    expect(
      await within(settings).findByText(
        "Another page or a category already has that address."
      )
    ).toBeInTheDocument();
    expect(reportError).not.toHaveBeenCalled();
  });

  test("a failed save is reported and said in the card", async () => {
    const { loaded, user } = setup({
      data: makeData({ page: GIFTS }),
      write: "fail",
    });
    await loaded();
    const settings = screen.getByTestId("page-settings");

    await user.click(within(settings).getByTestId("page-form-submit"));

    expect(await within(settings).findByRole("alert")).toHaveTextContent(
      /We could not save the page/u
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      action: "Pages.update_page",
    });
  });
});
