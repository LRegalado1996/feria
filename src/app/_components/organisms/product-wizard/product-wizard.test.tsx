import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { type ReactNode, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  productFormValues,
  type StoreProduct,
  toProductValues,
} from "@/lib/catalog/product-form";
import { reportError } from "@/lib/errors/client";
import { AUTOSAVE_DELAY_MS } from "@/lib/hooks/product";
import type {
  QueuedPhoto,
  QueuedPhotoUploaded,
  usePhotoQueue as UsePhotoQueue,
} from "@/lib/hooks/upload";
import type { Locale } from "@/lib/i18n/config";
import type { ProductFormValues } from "@/lib/schemas/catalog";
import { makeStoreCategory } from "@/test/factories/store-category";
import { makeStoreProduct } from "@/test/factories/store-product";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { required } from "@/test/required";
import { createQueryWrapper } from "@/test/setup-helpers";

import { ProductWizard } from "./product-wizard";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// The router: a spy for `push`, and the address read from the page's own
// location, read again whenever the wizard moves it.
const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", async () => {
  const React = await import("react");

  return {
    useRouter: () => ({ bfcacheId: "visit-1", push: navigation.push }),
    useSearchParams: () => {
      const [search, setSearch] = React.useState(window.location.search);

      React.useEffect(() => {
        const read = () => {
          setSearch(window.location.search);
        };
        window.addEventListener("test:address", read);

        return () => {
          window.removeEventListener("test:address", read);
        };
      }, []);

      return new URLSearchParams(search);
    },
  };
});

// The queue of uploads has its own tests: here the test hands photos over
// as they arrive, and sets what is still on its way.
const queue = vi.hoisted(() => ({
  add: vi.fn<ReturnType<typeof UsePhotoQueue>["add"]>(() => []),
  onUploaded: null as ((photo: QueuedPhotoUploaded) => void) | null,
  remove: vi.fn<(key: string) => void>(),
  retry: vi.fn<(key: string) => void>(),
  setItems: null as ((items: QueuedPhoto[]) => void) | null,
}));

vi.mock("@/lib/hooks/upload", () => ({
  usePhotoQueue: ({
    onUploaded,
  }: {
    onUploaded: (photo: QueuedPhotoUploaded) => void;
  }) => {
    const [items, setItems] = useState<QueuedPhoto[]>([]);
    queue.onUploaded = onUploaded;
    queue.setItems = setItems;

    return { add: queue.add, items, remove: queue.remove, retry: queue.retry };
  },
}));

// The storefront's own components draw the previews; they have their tests
// (and a carousel happy-dom cannot measure): here, what they are handed.
vi.mock("@/app/_components/molecules/store-article-preview", () => ({
  StoreArticlePreview: ({
    article,
    href,
    view,
  }: {
    article: { category: unknown; lang: string; title: string };
    href: string;
    view: string;
  }) => (
    <div data-testid={`preview-${view}`}>
      {JSON.stringify({
        category: article.category,
        href,
        lang: article.lang,
        title: article.title,
      })}
    </div>
  ),
}));

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

/** An executor that never settles: a request the server never answers. */
function HANG() {
  // Never resolved, never rejected.
}

// The browser's own, kept before any test spies on it.
const PUSH_STATE = window.history.pushState.bind(window.history);

const PHOTO_A =
  "https://store.public.blob.vercel-storage.com/local/product/11111111-1111-4111-8111-111111111111.webp";
const PHOTO_B =
  "https://store.public.blob.vercel-storage.com/local/product/22222222-2222-4222-8222-222222222222.webp";
const UPDATED_AT = "2026-11-15T09:30:00.000Z";

const STORE = {
  currencyCode: "UYU" as const,
  name: "LR Market",
  taglines: { en: "Jewelry at the fair.", es: "Bijouterie en la feria." },
};

/** A draft with no category, no price and one photo. */
function makeDraft(overrides: Partial<StoreProduct> = {}) {
  return makeStoreProduct({
    categoryId: null,
    priceAmount: null,
    publishGaps: ["category", "price"],
    publishedAt: null,
    status: "draft",
    ...overrides,
  });
}

/** A draft with everything publishing needs. */
function makeReadyDraft(overrides: Partial<StoreProduct> = {}) {
  return makeStoreProduct({
    publishGaps: [],
    publishedAt: null,
    status: "draft",
    ...overrides,
  });
}

function makePhoto(url: string) {
  return { height: 900, id: url === PHOTO_A ? 70 : 71, url, width: 900 };
}

/** What `product.update` is sent for `article` once `change` is typed. */
function savedValues(
  article: StoreProduct,
  change: (values: ProductFormValues) => ProductFormValues = (values) => values
) {
  return { ...toProductValues(change(productFormValues(article))), id: 12 };
}

function savedAnswer(status: "draft" | "published" = "draft") {
  return {
    id: 12,
    publishGaps: [],
    slug: "anillo-de-plata",
    status,
    updatedAt: "2026-11-16T10:00:00.000Z",
  };
}

const REFUSED = {
  code: "INTERNAL_SERVER_ERROR",
  message: "Internal server error",
  status: 500,
};

interface SetupOptions {
  /** The article on the server, or `null` for a new one. */
  article?: StoreProduct | null;
  /** `product.get`: answers, refuses, or never answers. */
  get?: "answers" | "fails" | "hangs";
  locale?: Locale;
  /** A copy of changes this browser kept for the article. */
  kept?: { baseUpdatedAt: string; values: ProductFormValues };
  /** The procedures that refuse, and how. */
  refuse?: Partial<
    Record<
      | "attribute.createValue"
      | "product.create"
      | "product.delete"
      | "product.publish"
      | "product.unpublish"
      | "product.update",
      { code: string; message: string; status: number }
    >
  >;
  /** Where the address starts. */
  url?: string;
}

function setup({
  article = makeDraft(),
  get = "answers",
  kept,
  locale = "en",
  refuse = {},
  url,
}: SetupOptions = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const prefix = locale === "en" ? "/en" : "";
  window.history.replaceState(
    null,
    "",
    url ??
      (article ? `${prefix}/admin/products/12` : `${prefix}/admin/products/new`)
  );
  vi.spyOn(window.history, "pushState").mockImplementation((...args) => {
    PUSH_STATE(...args);
    window.dispatchEvent(new Event("test:address"));
  });
  const replaceState = vi.spyOn(window.history, "replaceState");

  if (kept) {
    window.localStorage.setItem(
      "feria:product-edit:12",
      JSON.stringify({ ...kept, version: 1 })
    );
  }

  let stored = article;
  const spies = {
    create: vi.fn((_input: unknown) => savedAnswer()),
    createValue: vi.fn((_input: unknown) => ({
      id: 99,
      position: 2,
      slug: "x",
    })),
    get: vi.fn(async (_input: unknown) =>
      get === "hangs" ? await new Promise<never>(HANG) : stored
    ),
    publish: vi.fn((_input: unknown) => {
      stored = stored ? { ...stored, status: "published" } : stored;
      return { id: 12, slug: "anillo-de-plata", status: "published" };
    }),
    remove: vi.fn((_input: unknown) => ({ id: 12 })),
    unpublish: vi.fn((_input: unknown) => {
      stored = stored ? { ...stored, status: "draft" } : stored;
      return { id: 12, slug: "anillo-de-plata", status: "draft" };
    }),
    update: vi.fn((_input: unknown) => savedAnswer(stored?.status)),
  };
  const answer = (
    path: keyof NonNullable<SetupOptions["refuse"]>,
    resolve: (input: unknown) => unknown
  ) => {
    const refusal = refuse[path];
    return refusal
      ? createOrpcErrorHandler(path, refusal)
      : createOrpcHandler(path, resolve);
  };
  server.use(
    get === "fails"
      ? http.post("*/api/orpc/product/get", () => {
          void spies.get(undefined);
          return HttpResponse.json(
            {
              code: "INTERNAL_SERVER_ERROR",
              defined: true,
              message: "Internal server error",
              status: 500,
            },
            { status: 500 }
          );
        })
      : createOrpcHandler("product.get", spies.get),
    createOrpcHandler("category.list", () => [
      makeStoreCategory({ id: 3, nameEs: "Bijouterie", slug: "bijouterie" }),
      makeStoreCategory({
        id: 4,
        nameEn: "Rings",
        nameEs: "Anillos",
        parentId: 3,
        slug: "anillos",
      }),
    ]),
    createOrpcHandler("attribute.list", () => [
      {
        id: 1,
        nameEn: "Color",
        nameEs: "Color",
        position: 0,
        slug: "color",
        values: [
          {
            id: 31,
            nameEn: "Gold",
            nameEs: "Dorado",
            position: 0,
            productCount: 1,
            slug: "dorado",
            swatchColor: "#d4af37",
          },
        ],
      },
    ]),
    answer("attribute.createValue", spies.createValue),
    answer("product.create", spies.create),
    answer("product.update", spies.update),
    answer("product.publish", spies.publish),
    answer("product.unpublish", spies.unpublish),
    answer("product.delete", spies.remove)
  );
  const wrapper = createQueryWrapper();
  const user = userEvent.setup({
    advanceTimers: vi.advanceTimersByTime,
    // The picker would hide a file it does not accept; the queue refuses it.
    applyAccept: false,
  });
  const view = renderWithI18n(
    <ProductWizard
      articleId={article ? 12 : null}
      host="lrmarket.uy"
      store={STORE}
    />,
    {
      locale,
      wrapper: ({ children }: { children: ReactNode }) => wrapper({ children }),
    }
  );

  return {
    ...spies,
    /** The photo finishing its upload, as the queue hands it over. */
    arrive: (url: string, preview = "blob:preview-1") => {
      act(() => {
        required(queue.onUploaded)({
          image: { height: 900, url, width: 900 },
          key: "photo-1",
          preview,
        });
      });
    },
    /** Lets the typing pause long enough for the autosave. */
    pause: async () => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      });
    },
    replaceState,
    saveStatus: () => screen.getByTestId("product-save-status"),
    setQueued: (items: QueuedPhoto[]) => {
      act(() => {
        required(queue.setItems)(items);
      });
    },
    unmount: view.unmount,
    user,
  };
}

async function onStep(name: string) {
  return await screen.findByRole("heading", { level: 2, name });
}

describe("ProductWizard: loading", () => {
  test("shows a skeleton while the article is read", () => {
    setup({ get: "hangs" });

    expect(screen.getByTestId("product-wizard-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Edit article"
    );
  });

  test("says a failed read and reads again on retry", async () => {
    const { get, user } = setup({ get: "fails" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the article.");

    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load the article."
    );
  });

  test.each([
    ["en", "New article", "Article photos"],
    ["es", "Nuevo artículo", "Fotos del artículo"],
  ] as const)(
    "in %s, a new article opens on its photos",
    async (locale, title, step) => {
      setup({ article: null, locale });

      expect(
        await screen.findByRole("heading", { level: 1, name: title })
      ).toBeVisible();
      expect(await onStep(step)).toBeVisible();
    }
  );
});

describe("ProductWizard: a new article", () => {
  test("saves nothing before the first photo, and lets nobody past the photos", async () => {
    const { create, pause, saveStatus } = setup({ article: null });
    await onStep("Article photos");

    await pause();

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByTestId("product-next")).toBeDisabled();
    expect(saveStatus()).toHaveTextContent(
      "It saves itself once the first photo is uploaded."
    );
    expect(
      screen.getByText("Upload at least one photo to go on.")
    ).toBeVisible();
  });

  test("creates the draft from the first photo, and the address becomes the article's without starting over", async () => {
    const { arrive, create, replaceState } = setup({ article: null });
    await onStep("Article photos");
    const wizard = screen.getByTestId("product-wizard");

    arrive(PHOTO_A);

    await waitFor(() => {
      expect(create).toHaveBeenCalledExactlyOnceWith({
        attributeValueIds: [],
        categoryId: null,
        images: [{ height: 900, url: PHOTO_A, width: 900 }],
        isAvailable: true,
        priceAmount: null,
        translations: [
          {
            description: "",
            locale: "es",
            seoDescription: null,
            seoTitle: null,
            title: "",
          },
        ],
      });
    });
    await waitFor(() => {
      expect(replaceState).toHaveBeenLastCalledWith(
        null,
        "",
        "/en/admin/products/12"
      );
    });
    expect(window.location.pathname).toBe("/en/admin/products/12");
    expect(screen.getByTestId("product-wizard")).toBe(wizard);
    expect(document.querySelector("output.sr-only")).toHaveTextContent(
      "Photo 1 uploaded."
    );
    expect(screen.getByTestId("product-next")).toBeEnabled();
  });

  test("lets the person on while a photo travels, and says it is saving", async () => {
    const { saveStatus, setQueued } = setup({ article: null });
    await onStep("Article photos");

    setQueued([
      {
        key: "photo-1",
        name: "a.jpg",
        preview: "blob:a",
        state: { percent: 30, status: "uploading" },
      },
    ]);

    expect(screen.getByTestId("product-next")).toBeEnabled();
    expect(saveStatus()).toHaveTextContent("Saving…");
  });

  test("says how many photos are on their way, and why the others were refused", async () => {
    const { user } = setup({ article: null });
    await onStep("Article photos");
    queue.add.mockReturnValueOnce([{ kind: "notImage", name: "notes.pdf" }]);
    const files = [
      new File(["a"], "a.jpg", { type: "image/jpeg" }),
      new File(["b"], "notes.pdf", { type: "application/pdf" }),
    ];

    await user.upload(screen.getByTestId("product-photo-input"), files);

    expect(queue.add).toHaveBeenCalledExactlyOnceWith(files, 0);
    expect(document.querySelector("output.sr-only")).toHaveTextContent(
      "1 photo on its way."
    );
    expect(screen.getByTestId("product-photo-refusals")).toHaveTextContent(
      "“notes.pdf” is not a photo. Choose a JPEG, PNG, WebP or HEIC."
    );
  });

  test.each([
    ["three taken", [], "3 photos on their way."],
    ["none taken", [{ count: 3, kind: "tooMany" } as const], ""],
  ])("with %s, says %j", async (_case, refusals, said) => {
    const { user } = setup({ article: null });
    await onStep("Article photos");
    queue.add.mockReturnValueOnce(refusals);

    await user.upload(screen.getByTestId("product-photo-input"), [
      new File(["a"], "a.jpg", { type: "image/jpeg" }),
      new File(["b"], "b.jpg", { type: "image/jpeg" }),
      new File(["c"], "c.jpg", { type: "image/jpeg" }),
    ]);

    expect(document.querySelector("output.sr-only")?.textContent).toBe(said);
  });

  test("retries and drops a photo that failed, and says so", async () => {
    const { arrive, setQueued, user } = setup({ article: null });
    await onStep("Article photos");
    arrive(PHOTO_A);
    setQueued([
      {
        key: "photo-2",
        name: "b.jpg",
        preview: "blob:b",
        state: { reason: "failed", status: "failed" },
      },
    ]);

    await user.click(screen.getByRole("button", { name: "Retry: Photo 2" }));
    expect(queue.retry).toHaveBeenCalledExactlyOnceWith("photo-2");

    await user.click(screen.getByRole("button", { name: "Discard: Photo 2" }));
    expect(queue.remove).toHaveBeenCalledExactlyOnceWith("photo-2");
    expect(document.querySelector("output.sr-only")).toHaveTextContent(
      "Upload cancelled: Photo 2."
    );
  });

  test("frees the thumbnails drawn from this browser's files on leaving", async () => {
    const { arrive, unmount } = setup({ article: null });
    await onStep("Article photos");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    arrive(PHOTO_A, "blob:local-a");

    unmount();

    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:local-a");
  });

  test("discards an article never saved by going back to the list", async () => {
    const { remove, user } = setup({ article: null });
    await onStep("Article photos");

    await user.click(screen.getByRole("button", { name: "Discard draft" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Discard draft",
      })
    );

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith(
        "/en/admin/products"
      );
    });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("ProductWizard: steps", () => {
  test("moves through the steps in the address and brings focus to each heading", async () => {
    const { user } = setup();
    await onStep("Article photos");

    await user.click(screen.getByTestId("product-next"));

    const details = await onStep("Article details");
    expect(window.location.search).toBe("?step=details");
    expect(details).toHaveFocus();

    await user.click(screen.getByTestId("product-next"));
    const review = await onStep("Check how it looks");
    expect(window.location.search).toBe("?step=review");
    expect(review).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await onStep("Article details")).toHaveFocus();
    expect(screen.getByTestId("product-step-details").className).toContain(
      "animate-wizard-step-back"
    );

    await user.click(
      screen.getByRole("button", { name: "Step 1 of 3: Photos" })
    );
    expect(await onStep("Article photos")).toHaveFocus();
    expect(window.location.pathname).toBe("/en/admin/products/12");
    expect(window.location.search).toBe("");
  });

  test("a new article's steps stay on the new article's address", async () => {
    const { setQueued, user } = setup({ article: null });
    await onStep("Article photos");
    setQueued([
      {
        key: "photo-1",
        name: "a.jpg",
        preview: "blob:a",
        state: { status: "waiting" },
      },
    ]);

    await user.click(screen.getByTestId("product-next"));

    await onStep("Article details");
    expect(`${window.location.pathname}${window.location.search}`).toBe(
      "/en/admin/products/new?step=details"
    );
  });
});

describe("ProductWizard: autosave", () => {
  test("saves a draft once the typing pauses, with the latest text only", async () => {
    const article = makeDraft();
    const { pause, update, user } = setup({
      article,
      url: "/en/admin/products/12?step=details",
    });
    const title = await screen.findByRole("textbox", { name: "Title" });

    await user.clear(title);
    await user.type(title, "Collar");
    expect(update).not.toHaveBeenCalled();
    await pause();

    await waitFor(() => {
      expect(update).toHaveBeenCalledExactlyOnceWith(
        savedValues(article, (values) => ({
          ...values,
          es: { ...values.es, title: "Collar" },
        }))
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("product-save-status")).toHaveTextContent(
        "Saved"
      );
    });
  });

  test("saves nothing while a field is over its limit, and says why", async () => {
    const { pause, saveStatus, update, user } = setup({
      url: "/en/admin/products/12?step=details",
    });
    const title = await screen.findByRole("textbox", { name: "Title" });

    await user.tripleClick(title);
    await user.paste("a".repeat(121));
    await pause();

    expect(saveStatus()).toHaveTextContent(
      "Check the marked fields: it can't be saved like this."
    );
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText("Use up to 120 characters.")).toBeVisible();
  });

  test("says a failed save and sends it again on retry", async () => {
    const { pause, saveStatus, update, user } = setup({
      refuse: { "product.update": REFUSED },
      url: "/en/admin/products/12?step=details",
    });
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.type(title, "!");
    await pause();
    await waitFor(() => {
      expect(saveStatus()).toHaveTextContent("Couldn't save.");
    });
    server.use(createOrpcHandler("product.update", update));

    await user.click(
      within(saveStatus()).getByRole("button", { name: "Retry" })
    );

    await waitFor(() => {
      expect(saveStatus()).toHaveTextContent("Saved");
    });
    expect(update).toHaveBeenCalledOnce();
  });

  test("moves, makes main and removes photos, says each, and saves the new order", async () => {
    const article = makeDraft({
      images: [makePhoto(PHOTO_A), makePhoto(PHOTO_B)],
    });
    const { pause, update, user } = setup({ article });
    await onStep("Article photos");
    const said = () => document.querySelector("output.sr-only")?.textContent;

    expect(screen.getByText("Which is the main photo?")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Move later: Photo 1" })
    );
    expect(said()).toBe("Photo 1 is now in place 2 of 2.");

    await user.click(
      screen.getByRole("button", { name: "Use as the main photo: Photo 2" })
    );
    expect(said()).toBe("Photo 2 is now the main photo.");
    await pause();
    await waitFor(() => {
      expect(update).toHaveBeenCalledOnce();
    });
    expect(update).toHaveBeenLastCalledWith(savedValues(article));

    await user.click(screen.getByRole("button", { name: "Remove: Photo 2" }));
    expect(said()).toBe("You removed Photo 2.");
    await pause();
    await waitFor(() => {
      expect(update).toHaveBeenLastCalledWith(
        savedValues(article, (values) => ({
          ...values,
          images: values.images.slice(0, 1),
        }))
      );
    });
  });

  test("saves as a draft from the review and goes back to the list", async () => {
    const { user } = setup({ url: "/en/admin/products/12?step=review" });
    await onStep("Check how it looks");

    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith(
        "/en/admin/products"
      );
    });
  });

  test("stays when saving as a draft fails, and says so", async () => {
    const { toast } = await import("sonner");
    const { user } = setup({
      refuse: { "product.update": REFUSED },
      url: "/en/admin/products/12?step=details",
    });
    await user.type(await screen.findByRole("textbox", { name: "Title" }), "!");
    await user.click(screen.getByTestId("product-next"));
    await onStep("Check how it looks");

    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Couldn't save.");
    });
    expect(navigation.push).not.toHaveBeenCalled();
  });
});

describe("ProductWizard: publishing", () => {
  test("blocks publishing while something is missing, and marks each field", async () => {
    const { publish, user } = setup({
      url: "/en/admin/products/12?step=review",
    });
    await onStep("Check how it looks");
    const gaps = screen.getByTestId("product-publish-gaps");
    expect(
      within(gaps)
        .getAllByRole("button")
        .map((b) => b.textContent)
    ).toEqual(["The category", "The price"]);

    await user.click(screen.getByTestId("product-publish"));
    expect(publish).not.toHaveBeenCalled();
    expect(screen.getByTestId("product-publish")).toHaveAttribute(
      "aria-disabled",
      "true"
    );

    await user.click(
      within(gaps).getByRole("button", { name: "Complete: The price" })
    );

    await onStep("Article details");
    expect(screen.getByRole("textbox", { name: "Price" })).toHaveFocus();
    expect(screen.getByText("Set the price to publish.")).toBeVisible();
    expect(screen.getByText("Choose a category to publish.")).toBeVisible();
  });

  test("leads a missing photo to the photos step", async () => {
    const { user } = setup({
      article: makeReadyDraft({ images: [] }),
      url: "/en/admin/products/12?step=review",
    });
    await onStep("Check how it looks");

    await user.click(screen.getByTestId("product-publish"));
    await user.click(screen.getByRole("button", { name: "Complete: A photo" }));

    await onStep("Article photos");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Upload at least one photo to publish."
    );
  });

  test("takes a field over its limit to the field before publishing", async () => {
    const { publish, user } = setup({
      article: makeReadyDraft({
        translations: [
          {
            description: "",
            locale: "es",
            seoDescription: null,
            seoTitle: "a".repeat(71),
            title: "Anillo",
          },
        ],
      }),
      url: "/en/admin/products/12?step=review",
    });
    await onStep("Check how it looks");

    await user.click(screen.getByTestId("product-publish"));

    await onStep("Article details");
    expect(publish).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByLabelText("Search engine title")).toHaveFocus();
    });
  });

  test("publishes a ready draft and celebrates with the way to the store and to another", async () => {
    const { publish, user } = setup({
      article: makeReadyDraft(),
      url: "/en/admin/products/12?step=review",
    });
    await onStep("Check how it looks");
    expect(screen.getByTestId("product-publish-ready")).toBeVisible();

    await user.click(screen.getByTestId("product-publish"));

    const heading = await screen.findByRole("heading", { name: "Published!" });
    expect(publish).toHaveBeenCalledExactlyOnceWith({ id: 12 });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    expect(
      screen.getByRole("link", { name: "View in the store" })
    ).toHaveAttribute("href", "/en/productos/anillo-de-plata");
    expect(screen.getByRole("link", { name: "Load another" })).toHaveAttribute(
      "href",
      "/en/admin/products/new"
    );
    expect(screen.queryByTestId("product-publish")).not.toBeInTheDocument();
  });

  test("sends what was typed before publishing", async () => {
    const article = makeReadyDraft();
    const { publish, update, user } = setup({
      article,
      url: "/en/admin/products/12?step=details",
    });
    await user.type(await screen.findByRole("textbox", { name: "Title" }), "!");
    await user.click(screen.getByTestId("product-next"));
    await onStep("Check how it looks");

    await user.click(screen.getByTestId("product-publish"));

    await screen.findByRole("heading", { name: "Published!" });
    expect(update).toHaveBeenCalledExactlyOnceWith(
      savedValues(article, (values) => ({
        ...values,
        es: { ...values.es, title: "Anillo de plata!" },
      }))
    );
    expect(publish).toHaveBeenCalledExactlyOnceWith({ id: 12 });
  });

  test("does not publish when the last save failed", async () => {
    const { toast } = await import("sonner");
    const { publish, user } = setup({
      article: makeReadyDraft(),
      refuse: { "product.update": REFUSED },
      url: "/en/admin/products/12?step=details",
    });
    await user.type(await screen.findByRole("textbox", { name: "Title" }), "!");
    await user.click(screen.getByTestId("product-next"));
    await onStep("Check how it looks");

    await user.click(screen.getByTestId("product-publish"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Couldn't save.");
    });
    expect(publish).not.toHaveBeenCalled();
  });

  test.each([
    [
      "marks the gaps the server names",
      {
        code: "BAD_REQUEST",
        message: "The article cannot be published yet. Missing: price",
        status: 400,
      },
      false,
    ],
    ["reports any other failure", REFUSED, true],
    [
      "reports a refusal that names no gap",
      { code: "BAD_REQUEST", message: "Bad input", status: 400 },
      true,
    ],
  ])("a refused publish %s", async (_case, refusal, reported) => {
    const { toast } = await import("sonner");
    const { user } = setup({
      article: makeReadyDraft(),
      refuse: { "product.publish": refusal },
      url: "/en/admin/products/12?step=review",
    });
    await onStep("Check how it looks");

    await user.click(screen.getByTestId("product-publish"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "We couldn't publish it. Try again."
      );
    });
    expect(
      vi.mocked(reportError).mock.calls.map(([, context]) => context)
    ).toEqual(reported ? [{ action: "Product.publish" }] : []);
    expect(
      screen.queryByRole("heading", { name: "Published!" })
    ).not.toBeInTheDocument();
  });

  test("discards a saved draft after asking, and goes back to the list", async () => {
    const { remove, user } = setup();
    await onStep("Article photos");

    await user.click(screen.getByRole("button", { name: "Discard draft" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "The article is deleted with its photos. This can't be undone."
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Discard draft" })
    );

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith(
        "/en/admin/products"
      );
    });
    expect(remove).toHaveBeenCalledExactlyOnceWith({ id: 12 });
  });

  test("stays when discarding the draft fails, and says so", async () => {
    const { toast } = await import("sonner");
    const { user } = setup({ refuse: { "product.delete": REFUSED } });
    await onStep("Article photos");

    await user.click(screen.getByRole("button", { name: "Discard draft" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Discard draft",
      })
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "We couldn't discard the draft. Try again."
      );
    });
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Product.discard_draft" }
    );
    expect(navigation.push).not.toHaveBeenCalled();
  });

  test("cancelling a confirmation does nothing", async () => {
    const { remove, user } = setup();
    await onStep("Article photos");

    await user.click(screen.getByRole("button", { name: "Discard draft" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" })
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("ProductWizard: a published article", () => {
  const published = () => makeStoreProduct({ updatedAt: new Date(UPDATED_AT) });
  const withPrice = (price: number) => ({
    ...productFormValues(published()),
    price,
  });

  test("keeps changes in this browser, never on the server, until they are saved", async () => {
    const { pause, saveStatus, update, user } = setup({
      article: published(),
      url: "/en/admin/products/12?step=details",
    });
    const title = await screen.findByRole("textbox", { name: "Title" });
    expect(saveStatus()).toHaveTextContent("No changes");

    await user.type(title, "!");
    await pause();

    expect(update).not.toHaveBeenCalled();
    expect(saveStatus()).toHaveTextContent("Unsaved changes");
    expect(
      JSON.parse(window.localStorage.getItem("feria:product-edit:12") ?? "")
    ).toMatchObject({
      baseUpdatedAt: UPDATED_AT,
      values: { es: { title: "Anillo de plata!" } },
    });

    await user.type(title, "{Backspace}");

    expect(saveStatus()).toHaveTextContent("No changes");
    expect(window.localStorage.getItem("feria:product-edit:12")).toBeNull();
  });

  test("saves the changes after warning that customers see them at once", async () => {
    const { toast } = await import("sonner");
    const article = published();
    const { update, user } = setup({
      article,
      url: "/en/admin/products/12?step=details",
    });
    await user.type(await screen.findByRole("textbox", { name: "Title" }), "!");

    await user.click(screen.getByTestId("product-save-changes"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Your customers will see the changes in the store right away."
    );
    await user.click(within(dialog).getByRole("button", { name: "Yes, save" }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Changes saved: the store shows them now."
      );
    });
    expect(update).toHaveBeenCalledExactlyOnceWith(
      savedValues(article, (values) => ({
        ...values,
        es: { ...values.es, title: "Anillo de plata!" },
      }))
    );
    expect(window.localStorage.getItem("feria:product-edit:12")).toBeNull();
    expect(screen.getByTestId("product-save-changes")).toBeDisabled();
  });

  test("leads to what is missing instead of asking to save", async () => {
    const { user } = setup({
      article: published(),
      url: "/en/admin/products/12?step=details",
    });
    await user.clear(await screen.findByRole("textbox", { name: "Price" }));

    await user.click(screen.getByTestId("product-save-changes"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Price" })).toHaveFocus();
    });
    expect(screen.getByText("Set the price to publish.")).toBeVisible();
  });

  test("takes a field over its limit to the field instead of asking to save", async () => {
    const { user } = setup({
      article: published(),
      url: "/en/admin/products/12?step=details",
    });
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.tripleClick(title);
    await user.paste("a".repeat(121));
    await user.click(screen.getByRole("tab", { name: "English (optional)" }));

    await user.click(screen.getByTestId("product-save-changes"));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
    });
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "a".repeat(121)
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("brings focus to the photos' heading when the last photo is removed", async () => {
    const { user } = setup({ article: published() });
    const heading = await onStep("Article photos");

    await user.click(screen.getByRole("button", { name: "Remove: Photo 1" }));
    await user.click(screen.getByTestId("product-save-changes"));

    expect(heading).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test.each([
    [
      "marks the field the server says is missing",
      {
        code: "BAD_REQUEST",
        message: "The article cannot be published yet. Missing: price",
        status: 400,
      },
      false,
    ],
    ["reports any other failure", REFUSED, true],
  ])("a refused save %s", async (_case, refusal, reported) => {
    const { toast } = await import("sonner");
    const { user } = setup({
      article: published(),
      refuse: { "product.update": refusal },
      url: "/en/admin/products/12?step=details",
    });
    await user.type(await screen.findByRole("textbox", { name: "Title" }), "!");

    await user.click(screen.getByTestId("product-save-changes"));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Yes, save",
      })
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "We couldn't save the change. Try again."
      );
    });
    expect(screen.queryByText("Set the price to publish.") !== null).toBe(
      !reported
    );
    expect(
      vi.mocked(reportError).mock.calls.map(([, context]) => context)
    ).toEqual(reported ? [{ action: "Product.save_changes" }] : []);
    expect(window.localStorage.getItem("feria:product-edit:12")).not.toBeNull();
  });

  test("restores the changes this browser kept, and discards them on request", async () => {
    const { toast } = await import("sonner");
    const { saveStatus, user } = setup({
      article: published(),
      kept: { baseUpdatedAt: UPDATED_AT, values: withPrice(1500) },
      url: "/en/admin/products/12?step=details",
    });

    expect(await screen.findByTestId("product-edits-notice")).toHaveTextContent(
      "We brought back changes you hadn't saved."
    );
    expect(screen.getByRole("textbox", { name: "Price" })).toHaveValue("1500");
    expect(saveStatus()).toHaveTextContent("Unsaved changes");

    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Yes, discard",
      })
    );

    expect(toast.success).toHaveBeenCalledWith("Changes discarded.");
    expect(screen.getByRole("textbox", { name: "Price" })).toHaveValue("1290");
    expect(window.localStorage.getItem("feria:product-edit:12")).toBeNull();
    expect(
      screen.queryByTestId("product-edits-notice")
    ).not.toBeInTheDocument();
  });

  test("drops changes kept over an older version of the article, and says so", async () => {
    setup({
      article: published(),
      kept: {
        baseUpdatedAt: "2026-11-14T09:30:00.000Z",
        values: withPrice(1500),
      },
      url: "/en/admin/products/12?step=details",
    });

    expect(await screen.findByTestId("product-edits-notice")).toHaveTextContent(
      "We discarded changes you hadn't saved: the article changed since then."
    );
    expect(screen.getByRole("textbox", { name: "Price" })).toHaveValue("1290");
    expect(window.localStorage.getItem("feria:product-edit:12")).toBeNull();
  });

  test("links to the article in the store", async () => {
    setup({ article: published() });

    expect(
      await screen.findByRole("link", { name: "View in the store" })
    ).toHaveAttribute("href", "/en/productos/anillo-de-plata");
  });

  test("moves back to draft after asking, and its unsaved changes become the draft's", async () => {
    const article = published();
    const { unpublish, update, user } = setup({
      article,
      kept: { baseUpdatedAt: UPDATED_AT, values: withPrice(1500) },
    });
    await onStep("Article photos");

    await user.click(screen.getByRole("button", { name: "Move to draft" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "It stops showing in the store. You can publish it again whenever you want."
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Yes, move to draft" })
    );

    await waitFor(() => {
      expect(update).toHaveBeenCalledExactlyOnceWith(
        savedValues(article, (values) => ({ ...values, price: 1500 }))
      );
    });
    expect(unpublish).toHaveBeenCalledExactlyOnceWith({ id: 12 });
    expect(window.localStorage.getItem("feria:product-edit:12")).toBeNull();
    await waitFor(() => {
      expect(
        screen.queryByTestId("product-published-notice")
      ).not.toBeInTheDocument();
    });
  });

  test("moving back to draft with nothing changed saves nothing", async () => {
    const { unpublish, update, user } = setup({ article: published() });
    await onStep("Article photos");

    await user.click(screen.getByRole("button", { name: "Move to draft" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Yes, move to draft",
      })
    );

    await waitFor(() => {
      expect(unpublish).toHaveBeenCalledExactlyOnceWith({ id: 12 });
    });
    expect(update).not.toHaveBeenCalled();
  });

  test("stays published when moving back to draft fails, and says so", async () => {
    const { toast } = await import("sonner");
    const { user } = setup({
      article: published(),
      refuse: { "product.unpublish": REFUSED },
    });
    await onStep("Article photos");

    await user.click(screen.getByRole("button", { name: "Move to draft" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Yes, move to draft",
      })
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "We couldn't move it back to draft. Try again."
      );
    });
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Product.unpublish" }
    );
    expect(screen.getByTestId("product-published-notice")).toBeVisible();
  });
});

describe("ProductWizard: details", () => {
  test.each([
    [
      "adds the new value and chooses it",
      undefined,
      (chip: HTMLElement | null) => {
        expect(chip).toHaveAttribute("aria-pressed", "true");
      },
      [],
    ],
    [
      "says a name already taken under the field",
      { code: "CONFLICT", message: "Taken", status: 409 },
      () => {
        expect(
          screen.getByText("There is already one with that name here.")
        ).toBeVisible();
      },
      [],
    ],
    [
      "says and reports any other failure",
      REFUSED,
      () => {
        expect(
          screen.getByText("We could not save the change. Try again.")
        ).toBeVisible();
      },
      ["Attribute.create_value"],
    ],
  ])("a new filter value: %s", async (_case, refusal, check, reports) => {
    const { createValue, user } = setup({
      refuse: refusal ? { "attribute.createValue": refusal } : {},
      url: "/en/admin/products/12?step=details",
    });
    await user.click(
      await screen.findByRole("button", { name: "Add to Color" })
    );
    await user.type(
      screen.getByRole("textbox", { name: "Name in Spanish" }),
      "Lila"
    );
    server.use(
      createOrpcHandler("attribute.list", () => [
        {
          id: 1,
          nameEn: "Color",
          nameEs: "Color",
          position: 0,
          slug: "color",
          values: [
            {
              id: 99,
              nameEn: null,
              nameEs: "Lila",
              position: 0,
              productCount: 0,
              slug: "lila",
              swatchColor: null,
            },
          ],
        },
      ])
    );

    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      check(screen.queryByRole("button", { name: "Lila" }));
    });
    expect(
      vi.mocked(reportError).mock.calls.map(([, info]) => info?.action)
    ).toEqual(reports);
    // The value the form sent, when the store's answer was read at all.
    expect(createValue.mock.calls).toEqual(
      refusal
        ? []
        : [
            [
              {
                attributeId: 1,
                nameEn: null,
                nameEs: "Lila",
                swatchColor: null,
              },
            ],
          ]
    );
  });

  test("previews the article in the admin's language and its category under its group", async () => {
    const { user } = setup({
      article: makeReadyDraft({
        translations: [
          {
            description: "",
            locale: "es",
            seoDescription: null,
            seoTitle: null,
            title: "Anillo de plata",
          },
          {
            description: "",
            locale: "en",
            seoDescription: null,
            seoTitle: null,
            title: "Silver ring",
          },
        ],
      }),
      url: "/en/admin/products/12?step=review",
    });
    await onStep("Check how it looks");

    expect(JSON.parse(screen.getByTestId("preview-card").textContent)).toEqual({
      category: {
        group: { name: "Bijouterie", path: "/bijouterie" },
        name: "Rings",
        path: "/bijouterie/anillos",
      },
      href: "/en/productos/anillo-de-plata",
      lang: "en",
      title: "Silver ring",
    });

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(
      await screen.findByRole("tab", { name: "English (optional)" })
    );
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Silver ring"
    );
  });

  test("names an untitled article in the preview, and a category with no group", async () => {
    setup({
      article: makeDraft({
        categoryId: 3,
        translations: [
          {
            description: "",
            locale: "es",
            seoDescription: null,
            seoTitle: null,
            title: "",
          },
        ],
      }),
      url: "/en/admin/products/12?step=review",
    });
    await onStep("Check how it looks");

    expect(JSON.parse(screen.getByTestId("preview-card").textContent)).toEqual({
      category: { group: null, name: "Bijouterie", path: "/bijouterie" },
      href: "/en/productos/anillo-de-plata",
      lang: "es",
      title: "New article",
    });
  });

  test("takes an English title over its limit to the English tab", async () => {
    const { user } = setup({
      article: makeReadyDraft({
        translations: [
          {
            description: "",
            locale: "es",
            seoDescription: null,
            seoTitle: null,
            title: "Anillo",
          },
          {
            description: "",
            locale: "en",
            seoDescription: null,
            seoTitle: null,
            title: "a".repeat(121),
          },
        ],
      }),
      url: "/en/admin/products/12?step=review",
    });
    await onStep("Check how it looks");

    await user.click(screen.getByTestId("product-publish"));

    await onStep("Article details");
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
    });
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "a".repeat(121)
    );
  });
});
