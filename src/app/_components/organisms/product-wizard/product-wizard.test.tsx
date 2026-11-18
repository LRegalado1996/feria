import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { type ReactNode, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PRODUCT_EDITS_MAX_AGE_MS } from "@/lib/admin/product-edits";
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
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

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
const REPLACE_STATE = window.history.replaceState.bind(window.history);

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
  /** Whether the server can store photos. */
  canUpload?: boolean;
  /** `product.get`: answers, refuses, or never answers. */
  get?: "answers" | "fails" | "hangs";
  locale?: Locale;
  /** A copy of changes this browser kept for the article. */
  kept?: {
    baseUpdatedAt: string;
    /** When its first change was kept; now unless said. */
    startedAt?: string;
    values: ProductFormValues;
  };
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
  canUpload = true,
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
  const pushState = vi
    .spyOn(window.history, "pushState")
    .mockImplementation((...args) => {
      PUSH_STATE(...args);
      window.dispatchEvent(new Event("test:address"));
    });
  // Next keeps its router in step with both, as `useSearchParams` here does.
  const replaceState = vi
    .spyOn(window.history, "replaceState")
    .mockImplementation((...args) => {
      REPLACE_STATE(...args);
      window.dispatchEvent(new Event("test:address"));
    });

  if (kept) {
    window.localStorage.setItem(
      "feria:product-edit:12",
      JSON.stringify({
        startedAt: new Date().toISOString(),
        ...kept,
        version: 2,
      })
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
      ? http.post("*/api/orpc/product/get", async ({ request }) => {
          const body: unknown = await request.json();
          void spies.get(
            typeof body === "object" && body !== null && "json" in body
              ? body.json
              : undefined
          );
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
      canUpload={canUpload}
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
    pushState,
    queryClient: wrapper.queryClient,
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

/** Opens a published article's "More actions" menu and picks `name`. */
async function chooseFromMenu(
  user: ReturnType<typeof setup>["user"],
  name: string
) {
  await user.click(await screen.findByRole("button", { name: "More actions" }));
  await user.click(await screen.findByRole("menuitem", { name }));
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
      expect(get.mock.calls).toEqual([[{ id: 12 }], [{ id: 12 }]]);
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

describe("ProductWizard: a failed read again", () => {
  test("keeps an article on screen, with what was typed, when a later read of it fails", async () => {
    const { queryClient, user } = setup({
      url: "/en/admin/products/12?step=details",
    });
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.type(title, "!");
    server.use(
      createOrpcErrorHandler("product.get", {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
        status: 500,
      })
    );

    await act(async () => {
      await queryClient.refetchQueries();
    });

    // The article's read failed this time, keeping what it had read.
    await waitFor(() => {
      expect(
        queryClient
          .getQueryCache()
          .findAll()
          .some(
            (query) =>
              query.state.status === "error" && query.state.data !== undefined
          )
      ).toBe(true);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Anillo de plata!"
    );
  });
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

  test("creates the draft from the first photo, and the address becomes the draft's journey without starting over", async () => {
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
        "/en/admin/products/12?step=photos"
      );
    });
    expect(window.location.pathname).toBe("/en/admin/products/12");
    expect(screen.getByTestId("product-wizard")).toBe(wizard);
    // Still the journey: its steps, not the article's single screen.
    expect(
      screen.getByRole("navigation", { name: "Steps to load the article" })
    ).toBeVisible();
    expect(screen.queryByTestId("product-screen")).not.toBeInTheDocument();
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

  test("frees a removed photo's thumbnail at once, and only its own", async () => {
    const { arrive, user } = setup({ article: null });
    await onStep("Article photos");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    arrive(PHOTO_A, "blob:local-a");
    arrive(PHOTO_B, "blob:local-b");

    await user.click(screen.getByRole("button", { name: "Remove: Photo 1" }));

    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:local-a");
  });

  test("discarding stops the photos on their way, so none creates the draft afterwards", async () => {
    const { setQueued, user } = setup({ article: null });
    await onStep("Article photos");
    setQueued([
      {
        key: "photo-1",
        name: "a.jpg",
        preview: "blob:a",
        state: { percent: 30, status: "uploading" },
      },
    ]);

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
    expect(queue.remove).toHaveBeenCalledExactlyOnceWith("photo-1");
  });

  test("a draft created after the wizard was left does not move the address of the page shown instead", async () => {
    const { arrive, queryClient, replaceState, unmount } = setup({
      article: null,
    });
    let answer = (): void => undefined;
    const create = vi.fn(async (_input: unknown) => {
      await new Promise<void>((resolve) => {
        answer = resolve;
      });
      return savedAnswer();
    });
    server.use(createOrpcHandler("product.create", create));
    await onStep("Article photos");
    arrive(PHOTO_A);
    await waitFor(() => {
      expect(create).toHaveBeenCalledOnce();
    });
    replaceState.mockClear();

    unmount();
    act(() => {
      answer();
    });
    // The create answered and its save went through (the id is known),
    // then whatever was queued after it ran.
    await waitFor(() => {
      expect(
        queryClient
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.status)
      ).toContain("success");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(replaceState).not.toHaveBeenCalled();
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
    const { user } = setup({ url: "/en/admin/products/12?step=photos" });
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
    // The first step keeps its name: an address without one is the
    // article's single screen.
    expect(window.location.pathname).toBe("/en/admin/products/12");
    expect(window.location.search).toBe("?step=photos");
  });

  test("a new article's steps stay on the new article's address, one history entry until the draft exists", async () => {
    const { pushState, replaceState, setQueued, user } = setup({
      article: null,
    });
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
    // Replaced, not pushed: no blank `/new` entry stays behind the draft.
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/en/admin/products/new?step=details"
    );
    expect(pushState).not.toHaveBeenCalled();
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
    await pause();
    await waitFor(() => {
      expect(update).toHaveBeenCalledExactlyOnceWith(
        savedValues(article, (values) => ({
          ...values,
          images: [required(values.images[1]), required(values.images[0])],
        }))
      );
    });

    await user.click(
      screen.getByRole("button", { name: "Use as the main photo: Photo 2" })
    );
    expect(said()).toBe("Photo 2 is now the main photo.");
    await pause();
    await waitFor(() => {
      expect(update).toHaveBeenCalledTimes(2);
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

  test("does not save as a draft and leave while a photo is on its way, and says why", async () => {
    const { toast } = await import("sonner");
    const { setQueued, user } = setup({
      url: "/en/admin/products/12?step=review",
    });
    await onStep("Check how it looks");
    setQueued([
      {
        key: "photo-1",
        name: "a.jpg",
        preview: "blob:a",
        state: { percent: 30, status: "uploading" },
      },
    ]);

    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    expect(toast.info).toHaveBeenCalledExactlyOnceWith(
      "Wait for the photos to finish uploading."
    );
    expect(navigation.push).not.toHaveBeenCalled();
  });

  test("does not save as a draft and leave with a field over its limit, and takes the person to it", async () => {
    const { update, user } = setup({
      url: "/en/admin/products/12?step=details",
    });
    await user.type(
      await screen.findByRole("textbox", { name: "Title" }),
      "a".repeat(121)
    );
    await user.click(screen.getByTestId("product-next"));
    await onStep("Check how it looks");

    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    await onStep("Article details");
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
    });
    expect(navigation.push).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test("saves an edit still waiting before leaving as a draft", async () => {
    const article = makeDraft();
    const { update, user } = setup({
      article,
      url: "/en/admin/products/12?step=details",
    });
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // What the save sent, as it left; the answer waits for `release()`.
    const sent = vi.fn((_input: unknown) => undefined);
    server.use(
      createOrpcHandler("product.update", async (input: unknown) => {
        sent(input);
        await held;
        return update(input);
      })
    );
    await user.type(await screen.findByRole("textbox", { name: "Title" }), "!");
    await user.click(screen.getByTestId("product-next"));
    await onStep("Check how it looks");

    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() => {
      expect(sent).toHaveBeenCalledExactlyOnceWith(
        savedValues(article, (values) => ({
          ...values,
          es: { ...values.es, title: `${values.es.title}!` },
        }))
      );
    });
    expect(navigation.push).not.toHaveBeenCalled();
    release();
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
            description: "a".repeat(4001),
            locale: "es",
            seoDescription: null,
            seoTitle: null,
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
      expect(
        screen.getByRole("textbox", { name: "Description" })
      ).toHaveFocus();
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

  test("sends what was typed before publishing, and publishes only once it is saved", async () => {
    const article = makeReadyDraft();
    const { publish, update, user } = setup({
      article,
      url: "/en/admin/products/12?step=details",
    });
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      createOrpcHandler("product.update", async (input: unknown) => {
        await held;
        return update(input);
      })
    );
    await user.type(await screen.findByRole("textbox", { name: "Title" }), "!");
    await user.click(screen.getByTestId("product-next"));
    await onStep("Check how it looks");

    await user.click(screen.getByTestId("product-publish"));

    // The save is on its way: nothing is published before it lands.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    expect(publish).not.toHaveBeenCalled();
    release();
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

    // A gap the server named is marked at its field.
    await user.click(screen.getByRole("button", { name: "Back" }));
    await onStep("Article details");
    expect(screen.queryByText("Set the price to publish.") !== null).toBe(
      !reported
    );
  });

  test("says why it does not publish while a photo is on its way and nothing else is missing", async () => {
    const { toast } = await import("sonner");
    const { publish, setQueued, user } = setup({
      article: makeReadyDraft(),
      url: "/en/admin/products/12?step=review",
    });
    await onStep("Check how it looks");
    setQueued([
      {
        key: "photo-1",
        name: "a.jpg",
        preview: "blob:a",
        state: { percent: 30, status: "uploading" },
      },
    ]);

    await user.click(screen.getByTestId("product-publish"));

    expect(toast.info).toHaveBeenCalledExactlyOnceWith(
      "Wait for the photos to finish uploading."
    );
    expect(publish).not.toHaveBeenCalled();
  });

  test("shows the success with the store's link from the publish's answer when the draft's own read failed", async () => {
    const { arrive, user } = setup({ article: null, get: "fails" });
    await onStep("Article photos");
    arrive(PHOTO_A);
    await waitFor(() => {
      expect(screen.getByTestId("product-next")).toBeEnabled();
    });
    await user.click(screen.getByTestId("product-next"));
    await onStep("Article details");
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Anillo");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Category" }),
      "4"
    );
    await user.type(screen.getByRole("textbox", { name: "Price" }), "1290");
    await user.click(screen.getByTestId("product-next"));
    await onStep("Check how it looks");

    await user.click(screen.getByTestId("product-publish"));

    const success = await screen.findByTestId("product-publish-success");
    expect(
      within(success).getByRole("link", { name: "View in the store" })
    ).toHaveAttribute("href", "/en/productos/anillo-de-plata");
  });

  test("a publish that ends after the wizard was left does not move the address of the page shown instead", async () => {
    const { queryClient, replaceState, unmount, user } = setup({
      article: makeReadyDraft(),
    });
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      createOrpcHandler("product.publish", async () => {
        await held;
        return { id: 12, slug: "anillo-de-plata", status: "published" };
      })
    );
    await screen.findByTestId("product-screen");
    await user.click(screen.getByTestId("product-publish"));
    await waitFor(() => {
      expect(
        queryClient
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.status)
      ).toContain("pending");
    });
    replaceState.mockClear();

    unmount();
    release();
    await waitFor(() => {
      expect(
        queryClient
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.status)
      ).toContain("success");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(replaceState).not.toHaveBeenCalled();
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

    expect(await screen.findByRole("textbox", { name: "Price" })).toHaveValue(
      "1500"
    );
    // Said once, as a toast; the save line keeps saying it.
    expect(toast.info).toHaveBeenCalledExactlyOnceWith(
      "We brought back changes you hadn't saved.",
      { id: "product-edits-restored" }
    );
    expect(toast.warning).not.toHaveBeenCalled();
    expect(saveStatus()).toHaveTextContent("Unsaved changes");

    await chooseFromMenu(user, "Discard changes");
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Yes, discard",
      })
    );

    expect(toast.success).toHaveBeenCalledWith("Changes discarded.");
    expect(screen.getByRole("textbox", { name: "Price" })).toHaveValue("1290");
    expect(window.localStorage.getItem("feria:product-edit:12")).toBeNull();
    expect(toast.info).toHaveBeenCalledOnce();
    // Nothing left to discard: the menu offers only back to draft.
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual(["Move to draft"]);
  });

  // The owner saw this screen reload over and over (2026-11-18): the
  // wizard itself never moves the address nor reads the article again.
  test("opens a published article with changes kept here without moving the address or reading it again", async () => {
    const { get, pause, pushState, replaceState } = setup({
      article: published(),
      kept: { baseUpdatedAt: UPDATED_AT, values: withPrice(1500) },
    });
    // The address as the test set it, before the wizard ran.
    const addressSet = [...replaceState.mock.calls];
    expect(await screen.findByRole("textbox", { name: "Price" })).toHaveValue(
      "1500"
    );

    await pause();
    await pause();

    expect(replaceState.mock.calls).toEqual(addressSet);
    expect(pushState).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledExactlyOnceWith({ id: 12 });
  });

  test("the confirmation asked from the menu gives focus back to the menu's button", async () => {
    const { user } = setup({
      article: published(),
      kept: { baseUpdatedAt: UPDATED_AT, values: withPrice(1500) },
    });

    await chooseFromMenu(user, "Discard changes");
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      })
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "More actions" })).toHaveFocus();
  });

  test("drops changes kept over an older version of the article, and says so", async () => {
    const { toast } = await import("sonner");
    setup({
      article: published(),
      kept: {
        baseUpdatedAt: "2026-11-14T09:30:00.000Z",
        values: withPrice(1500),
      },
      url: "/en/admin/products/12?step=details",
    });

    expect(await screen.findByRole("textbox", { name: "Price" })).toHaveValue(
      "1290"
    );
    expect(toast.warning).toHaveBeenCalledExactlyOnceWith(
      "We discarded changes you hadn't saved: the article changed since then.",
      { id: "product-edits-stale" }
    );
    expect(toast.info).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("feria:product-edit:12")).toBeNull();
  });

  test("drops changes kept for over a day, whose new photos the cleanup may have deleted, and says so", async () => {
    const { toast } = await import("sonner");
    setup({
      article: published(),
      kept: {
        baseUpdatedAt: UPDATED_AT,
        startedAt: new Date(
          Date.now() - PRODUCT_EDITS_MAX_AGE_MS - 1000
        ).toISOString(),
        values: withPrice(1500),
      },
      url: "/en/admin/products/12?step=details",
    });

    expect(await screen.findByRole("textbox", { name: "Price" })).toHaveValue(
      "1290"
    );
    expect(toast.warning).toHaveBeenCalledExactlyOnceWith(
      "We discarded changes you hadn't saved: they were over a day old.",
      { id: "product-edits-expired" }
    );
    expect(window.localStorage.getItem("feria:product-edit:12")).toBeNull();
  });

  test("brings back kept changes whose title is over its limit, for the field to say so", async () => {
    const long = "a".repeat(121);
    setup({
      article: published(),
      kept: {
        baseUpdatedAt: UPDATED_AT,
        values: {
          ...withPrice(1500),
          es: { description: "", title: long },
        },
      },
      url: "/en/admin/products/12?step=details",
    });

    expect(await screen.findByRole("textbox", { name: "Title" })).toHaveValue(
      long
    );
    expect(screen.getByRole("textbox", { name: "Price" })).toHaveValue("1500");
  });

  test("links to the article in the store from its card's preview, in a new tab, and says nothing else of it", async () => {
    const { toast } = await import("sonner");
    setup({ article: published() });

    const link = within(
      await screen.findByTestId("product-card-preview")
    ).getByRole("link", { name: "View in the store" });
    expect(link).toHaveAttribute("href", "/en/productos/anillo-de-plata");
    expect(link).toHaveAttribute("target", "_blank");
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  test("moves back to draft after asking, and its unsaved changes become the draft's", async () => {
    const article = published();
    const { unpublish, update, user } = setup({
      article,
      kept: { baseUpdatedAt: UPDATED_AT, values: withPrice(1500) },
    });
    await onStep("Article photos");

    await chooseFromMenu(user, "Move to draft");
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
        screen.queryByRole("button", { name: "More actions" })
      ).not.toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId("product-card-preview")).queryByRole("link")
    ).not.toBeInTheDocument();
  });

  test("does not move back to draft with a change the draft cannot hold, and takes the person to it", async () => {
    const { unpublish, update, user } = setup({
      article: published(),
      kept: { baseUpdatedAt: UPDATED_AT, values: withPrice(12.345) },
    });
    await onStep("Article photos");

    await chooseFromMenu(user, "Move to draft");
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Yes, move to draft",
      })
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Price" })).toHaveFocus();
    });
    expect(unpublish).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("feria:product-edit:12")).not.toBeNull();
  });

  test("discarding the changes frees the thumbnail of a photo uploaded meanwhile", async () => {
    const { arrive, user } = setup({ article: published() });
    await onStep("Article photos");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    arrive(PHOTO_B, "blob:local-b");

    await chooseFromMenu(user, "Discard changes");
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Yes, discard",
      })
    );

    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:local-b");
  });

  test("discarding the changes stops the photos on their way, so none lands in them afterwards", async () => {
    const { setQueued, user } = setup({ article: published() });
    await onStep("Article photos");
    await user.type(screen.getByRole("textbox", { name: "Title" }), "!");
    setQueued([
      {
        key: "photo-1",
        name: "a.jpg",
        preview: "blob:a",
        state: { percent: 30, status: "uploading" },
      },
    ]);

    await chooseFromMenu(user, "Discard changes");
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Yes, discard",
      })
    );

    expect(queue.remove).toHaveBeenCalledExactlyOnceWith("photo-1");
  });

  test("moving back to draft with nothing changed saves nothing", async () => {
    const { unpublish, update, user } = setup({ article: published() });
    await onStep("Article photos");

    await chooseFromMenu(user, "Move to draft");
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

    await chooseFromMenu(user, "Move to draft");
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
    expect(screen.getByRole("button", { name: "More actions" })).toBeVisible();
  });
});

describe("ProductWizard: details", () => {
  test("a new filter value is chosen in the choice as it is when the store answers, a chip dropped meanwhile staying dropped", async () => {
    const { user } = setup({ url: "/en/admin/products/12?step=details" });
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      createOrpcHandler("attribute.createValue", async () => {
        await held;
        return { id: 99, position: 1, slug: "lila" };
      })
    );
    const gold = await screen.findByRole("button", { name: "Gold" });
    expect(gold).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Add to Color" }));
    await user.type(
      screen.getByRole("textbox", { name: "Name in Spanish" }),
      "Lila"
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    // Gold dropped while the store has not answered yet.
    await user.click(gold);
    expect(gold).toHaveAttribute("aria-pressed", "false");
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
              id: 31,
              nameEn: "Gold",
              nameEs: "Dorado",
              position: 0,
              productCount: 1,
              slug: "dorado",
              swatchColor: "#d4af37",
            },
            {
              id: 99,
              nameEn: null,
              nameEs: "Lila",
              position: 1,
              productCount: 0,
              slug: "lila",
              swatchColor: null,
            },
          ],
        },
      ])
    );
    release();

    expect(
      await screen.findByRole("button", { name: "Lila", pressed: true })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Gold" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

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
      href: "#preview",
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
      href: "#preview",
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

describe("ProductWizard: one screen for an article from the list", () => {
  /** The level-2 headings in the order they read. */
  const headings = () =>
    screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);

  test("shows a draft with everything on one screen: what is missing, photos, details, filters, then the store's previews, no steps", async () => {
    setup();
    await screen.findByTestId("product-screen");

    expect(
      screen.getByRole("heading", { level: 1, name: "Edit article" })
    ).toBeVisible();
    expect(await screen.findByRole("button", { name: "Gold" })).toBeVisible();
    expect(headings()).toEqual([
      "To publish it still needs:",
      "Article photos",
      "Article details",
      "Filters",
      "Card in the store",
      "Search and sharing",
    ]);
    expect(
      screen.queryByRole("navigation", { name: "Steps to load the article" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Anillo de plata"
    );
    expect(screen.getByTestId("preview-card")).toBeInTheDocument();
    expect(screen.getByTestId("product-publish")).toHaveTextContent("Publish");
    expect(screen.queryByTestId("product-next")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard draft" })).toBeVisible();
  });

  test("an unknown step is the single screen too", async () => {
    setup({ url: "/en/admin/products/12?step=everything" });

    expect(await screen.findByTestId("product-screen")).toBeVisible();
  });

  test("a draft reloaded mid-journey stays on its step, in the journey's words", async () => {
    setup({ url: "/en/admin/products/12?step=details" });

    expect(await onStep("Article details")).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: "New article" })
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Steps to load the article" })
    ).toBeVisible();
    expect(screen.queryByTestId("product-screen")).not.toBeInTheDocument();
  });

  test("autosaves a draft's change on the single screen", async () => {
    const article = makeDraft();
    const { pause, update, user } = setup({ article });
    const title = await screen.findByRole("textbox", { name: "Title" });

    await user.type(title, "!");
    await pause();

    await waitFor(() => {
      expect(update).toHaveBeenCalledExactlyOnceWith(
        savedValues(article, (values) => ({
          ...values,
          es: { ...values.es, title: "Anillo de plata!" },
        }))
      );
    });
  });

  test("publishing with something missing takes the person to the first field that misses, and marks it", async () => {
    const { publish, user } = setup();
    await screen.findByTestId("product-screen");

    await user.click(screen.getByTestId("product-publish"));

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Category" })).toHaveFocus();
    });
    expect(screen.getByText("Choose a category to publish.")).toBeVisible();
    expect(screen.getByText("Set the price to publish.")).toBeVisible();
    expect(publish).not.toHaveBeenCalled();
  });

  test("publishing without a photo brings focus to the photos' heading", async () => {
    const { user } = setup({ article: makeReadyDraft({ images: [] }) });
    await screen.findByTestId("product-screen");

    await user.click(screen.getByTestId("product-publish"));

    expect(
      screen.getByRole("heading", { level: 2, name: "Article photos" })
    ).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Upload at least one photo to publish."
    );
  });

  test("publishes a ready draft and keeps the success on screen, at the article's own address", async () => {
    const { publish, replaceState, user } = setup({
      article: makeReadyDraft(),
    });
    await screen.findByTestId("product-screen");

    await user.click(screen.getByTestId("product-publish"));

    expect(
      await screen.findByRole("heading", { name: "Published!" })
    ).toBeVisible();
    expect(publish).toHaveBeenCalledExactlyOnceWith({ id: 12 });
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/en/admin/products/12"
    );
    expect(screen.queryByTestId("product-screen")).not.toBeInTheDocument();
  });

  test("takes no typing while a draft is being published", async () => {
    const { user } = setup({ article: makeReadyDraft() });
    let answer = (): void => undefined;
    const publish = vi.fn(async (_input: unknown) => {
      await new Promise<void>((resolve) => {
        answer = resolve;
      });
      return { id: 12, slug: "anillo-de-plata", status: "published" };
    });
    server.use(createOrpcHandler("product.publish", publish));
    await screen.findByTestId("product-screen");
    const details = screen.getByTestId("product-section-details");
    expect(details.closest("[inert]")).toBeNull();

    await user.click(screen.getByTestId("product-publish"));

    await waitFor(() => {
      expect(publish).toHaveBeenCalledOnce();
    });
    expect(details.closest("[inert]")).not.toBeNull();
    act(() => {
      answer();
    });
    expect(
      await screen.findByRole("heading", { name: "Published!" })
    ).toBeVisible();
  });

  test("publishing from the journey ends it: the address drops its step", async () => {
    const { replaceState, user } = setup({
      article: makeReadyDraft(),
      url: "/en/admin/products/12?step=review",
    });
    await onStep("Check how it looks");

    await user.click(screen.getByTestId("product-publish"));

    expect(
      await screen.findByRole("heading", { name: "Published!" })
    ).toBeVisible();
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/en/admin/products/12"
    );
  });

  test("shows a published article on the single screen even on a step's address, with its save, discard and back to draft", async () => {
    setup({
      article: makeStoreProduct(),
      url: "/en/admin/products/12?step=review",
    });

    expect(await screen.findByTestId("product-screen")).toBeVisible();
    expect(headings()).toEqual([
      "Article photos",
      "Article details",
      "Filters",
      "Card in the store",
      "Search and sharing",
    ]);
    // No panel (Lucas, 2026-11-18): the other actions are a menu beside
    // the main one.
    expect(screen.queryByText(/changes stay in this browser/u)).toBeNull();
    expect(screen.getByTestId("product-save-changes")).toHaveTextContent(
      "Save changes"
    );
    expect(
      within(screen.getByTestId("product-wizard-actions"))
        .getAllByRole("button")
        .map(
          (button) => button.getAttribute("aria-label") ?? button.textContent
        )
    ).toEqual(["More actions", "Save changes"]);
    expect(screen.queryByTestId("product-publish")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Discard draft" })
    ).not.toBeInTheDocument();
  });
});

describe("ProductWizard: search and sharing", () => {
  test("has no search texts to fill in, and previews the result from the title and the description as they are typed", async () => {
    const { user } = setup();
    const title = await screen.findByRole("textbox", { name: "Title" });

    expect(
      screen.queryByRole("textbox", { name: /search engine/iu })
    ).not.toBeInTheDocument();
    await user.clear(title);
    await user.type(title, "Collar");
    const description = screen.getByRole("textbox", { name: "Description" });
    await user.clear(description);
    await user.type(description, "Cadena de acero dorado.");

    expect(screen.getByTestId("product-seo-preview-google")).toHaveTextContent(
      "Collar · LR Market"
    );
    expect(screen.getByTestId("product-seo-preview-google")).toHaveTextContent(
      "Cadena de acero dorado."
    );
    expect(screen.getByTestId("store-share-preview")).toHaveTextContent(
      "Collar"
    );
  });

  test.each([
    [
      "while English has none, the Spanish texts, as the store shows them",
      [],
      "Anillo de plata · LR Market",
      "es",
    ],
    [
      "once English has some, the English ones",
      [
        {
          description: "",
          locale: "en" as const,
          seoDescription: null,
          seoTitle: null,
          title: "Silver ring",
        },
      ],
      "Silver ring · LR Market",
      "en",
    ],
  ])(
    "on the English tab, previews %s",
    async (_case, english, pageTitle, lang) => {
      const article = makeDraft();
      const { user } = setup({
        article: makeDraft({
          translations: [...article.translations, ...english],
        }),
      });

      await user.click(
        await screen.findByRole("tab", { name: "English (optional)" })
      );

      const google = screen.getByTestId("product-seo-preview-google");
      expect(google).toHaveTextContent(pageTitle);
      expect(google).toHaveAttribute("lang", lang);
    }
  );

  test("saving an article clears the search texts an earlier wizard stored", async () => {
    const article = makeDraft({
      translations: [
        {
          description: "Plata 925.",
          locale: "es",
          seoDescription: "El anillo que buscabas.",
          seoTitle: "Anillo 925",
          title: "Anillo de plata",
        },
      ],
    });
    const { pause, update, user } = setup({ article });

    await user.type(await screen.findByRole("textbox", { name: "Title" }), "!");
    await pause();

    await waitFor(() => {
      expect(update).toHaveBeenCalledOnce();
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        translations: [
          {
            description: "Plata 925.",
            locale: "es",
            seoDescription: null,
            seoTitle: null,
            title: "Anillo de plata!",
          },
        ],
      })
    );
  });
});

describe("ProductWizard: photos", () => {
  test("says up front, where photos come in, that this server cannot store them, and takes none", async () => {
    setup({ article: null, canUpload: false });
    await onStep("Article photos");

    expect(screen.getByTestId("product-photo-unavailable")).toHaveTextContent(
      "Photos can't be uploaded for now: uploads aren't set up on this server."
    );
    expect(screen.getByTestId("product-photo-drop")).toBeDisabled();
  });

  test("says a failed first save of the draft, with its retry, instead of waiting for a photo", async () => {
    const { arrive, create, saveStatus, user } = setup({
      article: null,
      refuse: { "product.create": REFUSED },
    });
    await onStep("Article photos");
    expect(saveStatus()).toHaveTextContent(
      "It saves itself once the first photo is uploaded."
    );

    arrive(PHOTO_A);

    await waitFor(() => {
      expect(saveStatus()).toHaveTextContent("Couldn't save.");
    });
    server.use(createOrpcHandler("product.create", create));
    await user.click(
      within(saveStatus()).getByRole("button", { name: "Retry" })
    );
    await waitFor(() => {
      expect(saveStatus()).toHaveTextContent("Saved");
    });
  });

  test("discarding while the first photo is still creating the draft deletes the draft once it exists", async () => {
    const { arrive, remove, user } = setup({ article: null });
    let answer = (): void => undefined;
    const create = vi.fn(async (_input: unknown) => {
      await new Promise<void>((resolve) => {
        answer = resolve;
      });
      return savedAnswer();
    });
    server.use(createOrpcHandler("product.create", create));
    await onStep("Article photos");
    arrive(PHOTO_A);
    await waitFor(() => {
      expect(create).toHaveBeenCalledOnce();
    });

    await user.click(screen.getByRole("button", { name: "Discard draft" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Discard draft",
      })
    );
    expect(remove).not.toHaveBeenCalled();
    act(() => {
      answer();
    });

    await waitFor(() => {
      expect(remove).toHaveBeenCalledExactlyOnceWith({ id: 12 });
    });
    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith(
        "/en/admin/products"
      );
    });
  });

  test("a first photo that fails creates no draft and leaves the person free to discard it", async () => {
    const { create, pause, setQueued, user } = setup({ article: null });
    await onStep("Article photos");

    setQueued([
      {
        key: "photo-1",
        name: "a.jpg",
        preview: "blob:a",
        state: { reason: "notConfigured", status: "failed" },
      },
    ]);
    await pause();

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByTestId("product-next")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Discard: Photo 1" }));
    expect(queue.remove).toHaveBeenCalledExactlyOnceWith("photo-1");
  });
});
