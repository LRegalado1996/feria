import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import {
  CategoryPageForm,
  type CategoryPageFormCategory,
} from "./category-page-form";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

// The upload runs for real but for its two edges: the browser's canvas and
// the Blob store are doubles (`use-image-upload.test.tsx` has the rest).
const blob = vi.hoisted(() => ({
  prepareImage: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({ put: blob.put }));
vi.mock("@/lib/upload/prepare-image", () => ({
  prepareImage: blob.prepareImage,
  UnreadableImageError: class extends Error {},
}));

const UPLOADED =
  "https://store9.public.blob.vercel-storage.com/local/cover/0f8e2b9c-1d2a-4b3c-8d4e-5f6a7b8c9d0e.webp";
const STORED = {
  computer: { height: 800, url: "/seed/ring-2.jpg", width: 1200 },
  phone: { height: 1200, url: "/seed/ring-1.jpg", width: 1200 },
};

function makeCategory(
  overrides: Partial<CategoryPageFormCategory> = {}
): CategoryPageFormCategory {
  return {
    cover: { computer: null, phone: null },
    coverAltEn: null,
    coverAltEs: null,
    id: 3,
    nameEn: "Rings",
    nameEs: "Anillos",
    parentId: null,
    seoDescriptionEn: null,
    seoDescriptionEs: null,
    seoTitleEn: null,
    seoTitleEs: null,
    showInHeader: true,
    ...overrides,
  };
}

function setup({
  category = makeCategory(),
  isGroup = false,
  locale = "en",
  saves = "saved",
}: {
  category?: CategoryPageFormCategory;
  isGroup?: boolean;
  locale?: Locale;
  saves?: "failed" | "saved";
} = {}) {
  const onSave = vi.fn(
    async (_values: unknown) => await Promise.resolve(saves)
  );
  const onCancel = vi.fn<() => void>();
  server.use(
    createOrpcHandler("upload.createToken", () => ({
      pathname: "local/cover/0f8e2b9c-1d2a-4b3c-8d4e-5f6a7b8c9d0e.webp",
      token: "vercel_blob_client_Store9_signed",
    }))
  );
  blob.prepareImage.mockResolvedValue({
    blob: new Blob(["webp"], { type: "image/webp" }),
    contentType: "image/webp",
    height: 800,
    width: 2400,
  });
  blob.put.mockResolvedValue({ url: UPLOADED });
  const wrapper = createQueryWrapper();
  renderWithI18n(
    <CategoryPageForm
      category={category}
      groups={[
        { id: 6, name: "Bijouterie" },
        { id: 1, name: "Burbujeros" },
      ]}
      isGroup={isGroup}
      onCancel={onCancel}
      onSave={onSave}
    />,
    { locale, wrapper }
  );
  const user = userEvent.setup();
  const photo = (name: string) => screen.getByRole("group", { name });

  return {
    field: (name: string) => screen.getByRole("textbox", { name }),
    photo,
    save: async () => {
      await user.click(screen.getByRole("button", { name: "Save the page" }));
    },
    /** Chooses a file in the photo field `name` and waits for its upload. */
    upload: async (name: string) => {
      await user.upload(
        within(photo(name)).getByTestId("image-uploader-input"),
        new File(["photo"], "IMG_0001.jpg", { type: "image/jpeg" })
      );
      await waitFor(() => {
        expect(within(photo(name)).getByRole("status")).toHaveTextContent(
          "Photo uploaded."
        );
      });
    },
    onCancel,
    onSave,
    user,
  };
}

describe("CategoryPageForm", () => {
  test("sends the chosen group and every text, empty ones as none", async () => {
    const { field, onSave, user } = setup({
      category: makeCategory({ seoTitleEn: "Old title" }),
    });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Group" }),
      "Bijouterie"
    );
    await user.clear(field("Title for search engines in English"));
    await user.type(
      field("Description for search engines in Spanish"),
      "  Anillos de la feria  "
    );
    await user.click(screen.getByRole("button", { name: "Save the page" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        coverAltEn: null,
        coverAltEs: null,
        id: 3,
        parentId: 6,
        seoDescriptionEn: null,
        seoDescriptionEs: "Anillos de la feria",
        seoTitleEn: null,
        seoTitleEs: null,
      });
    });
  });

  test("takes a category out of its group with No group", async () => {
    const { onSave, user } = setup({
      category: makeCategory({ parentId: 6 }),
    });
    const group = screen.getByRole("combobox", { name: "Group" });

    expect(group).toHaveValue("6");
    await user.selectOptions(group, "No group");
    await user.click(screen.getByRole("button", { name: "Save the page" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ parentId: null })
      );
    });
  });

  test.each([
    ["Title for search engines in Spanish", "seoTitleEs", 70],
    ["Description for search engines in English", "seoDescriptionEn", 160],
    ["Cover description in Spanish", "coverAltEs", 200],
  ])("sends a %s of exactly its limit unchanged", async (name, key, length) => {
    const { field, onSave, user } = setup({
      category: makeCategory({
        cover: {
          computer: { height: 800, url: "/seed/ring-2.jpg", width: 1200 },
          phone: null,
        },
      }),
    });

    await user.click(field(name));
    await user.paste("x".repeat(length));
    await user.click(screen.getByRole("button", { name: "Save the page" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ [key]: "x".repeat(length) })
      );
    });
  });

  test.each([
    ["Title for search engines in Spanish", 71, "Use up to 70 characters."],
    [
      "Description for search engines in English",
      161,
      "Use up to 160 characters.",
    ],
  ])(
    "refuses a %s of %i characters under its field, sending nothing",
    async (name, length, message) => {
      const { field, onSave, user } = setup();

      await user.click(field(name));
      await user.paste("x".repeat(length));
      await user.click(screen.getByRole("button", { name: "Save the page" }));

      expect(await screen.findByText(message)).toBeVisible();
      expect(field(name)).toHaveAttribute("aria-invalid", "true");
      expect(onSave).not.toHaveBeenCalled();
    }
  );

  test("sends no English text for a category without an English name", async () => {
    const { field, onSave, user } = setup({
      category: makeCategory({ nameEn: null, seoTitleEn: "Stale" }),
    });

    expect(field("Title for search engines in English")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save the page" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ seoTitleEn: null })
      );
    });
  });

  test("says a failed save under the form and keeps what was typed", async () => {
    const { field, user } = setup({ saves: "failed" });

    await user.type(field("Title for search engines in Spanish"), "Anillos");
    await user.click(screen.getByRole("button", { name: "Save the page" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not save the change. Try again."
    );
    expect(field("Title for search engines in Spanish")).toHaveValue("Anillos");
  });

  test("shows the stored cover in its two fields, and asks for its description in both languages", () => {
    const { photo } = setup({
      category: makeCategory({ cover: STORED, coverAltEs: "Anillo sello" }),
    });

    expect(
      within(photo("Computer photo")).getByRole("img", {
        name: "Preview: Computer photo",
      })
    ).toHaveAttribute("width", "1200");
    expect(
      within(photo("Phone photo (optional)")).getByRole("img", {
        name: "Preview: Phone photo (optional)",
      })
    ).toHaveAttribute("height", "1200");
    // next/image serves each through its optimizer, the file as `url`.
    expect(
      ["Computer photo", "Phone photo (optional)"].map((name) =>
        new URL(
          within(photo(name)).getByRole("img").getAttribute("src") ?? "",
          "http://localhost"
        ).searchParams.get("url")
      )
    ).toEqual(["/seed/ring-2.jpg", "/seed/ring-1.jpg"]);
    expect(
      screen.getByRole("textbox", { name: "Cover description in English" })
    ).toBeEnabled();
  });

  test("sends an uploaded computer photo with the page, and leaves the untouched phone one out", async () => {
    const { onSave, save, upload } = setup({
      category: makeCategory({ cover: STORED }),
    });

    await upload("Computer photo");
    await save();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          cover: { height: 800, url: UPLOADED, width: 2400 },
          coverPhone: undefined,
        })
      );
    });
  });

  test("sends an uploaded phone photo, keeping the stored computer one out", async () => {
    const { onSave, save, upload } = setup({
      category: makeCategory({ cover: STORED }),
    });

    await upload("Phone photo (optional)");
    await save();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          cover: undefined,
          coverPhone: { height: 800, url: UPLOADED, width: 2400 },
        })
      );
    });
  });

  test("an untouched cover is not sent at all", async () => {
    const { onSave, save } = setup({
      category: makeCategory({ cover: STORED }),
    });

    await save();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ cover: undefined, coverPhone: undefined })
      );
    });
  });

  test("removing the computer photo removes the phone one too, and sends both as none", async () => {
    const { onSave, photo, save, user } = setup({
      category: makeCategory({ cover: STORED }),
    });

    await user.click(
      within(photo("Computer photo")).getByRole("button", {
        name: "Remove photo: Computer photo",
      })
    );
    await save();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ cover: null, coverPhone: null })
      );
    });
    expect(photo("Phone photo (optional)")).toHaveAccessibleDescription(
      "Choose the computer photo first."
    );
  });

  test("the phone photo waits for a computer one", async () => {
    const { photo, upload } = setup();
    const choosePhone = () =>
      within(photo("Phone photo (optional)")).getByRole("button", {
        name: "Choose a photo: Phone photo (optional)",
      });

    expect(choosePhone()).toBeDisabled();
    expect(
      screen.queryByRole("textbox", { name: "Cover description in Spanish" })
    ).toBeNull();

    await upload("Computer photo");

    expect(choosePhone()).toBeEnabled();
    expect(
      screen.getByRole("textbox", { name: "Cover description in Spanish" })
    ).toBeEnabled();
  });

  test("cancels without saving", async () => {
    const { onCancel, onSave, user } = setup();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledExactlyOnceWith();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("keeps a group's own group shut, in Spanish too", () => {
    setup({ isGroup: true, locale: "es" });

    const group = screen.getByRole("combobox", { name: "Grupo" });
    expect(group).toBeDisabled();
    expect(group).toHaveAccessibleDescription(
      "Esta categoría es un grupo: tiene categorías adentro, así que no puede entrar en otro."
    );
    expect(
      screen.getByRole("form", { name: "Página de «Anillos»" })
    ).toHaveTextContent("Primero elegí la foto para computadora.");
  });

  test.each([
    [true, false],
    [false, true],
  ])(
    "a category in no group stored as shown: %s, sends the header choice toggled to %s",
    async (stored, sent) => {
      const { onSave, save, user } = setup({
        category: makeCategory({ showInHeader: stored }),
      });
      const box = screen.getByRole("checkbox", { name: "Show in the header" });

      expect(box).toHaveProperty("checked", stored);
      expect(box).toHaveAccessibleDescription(
        "Unticked, it leaves the store's menu, but its page stays open."
      );
      await user.click(box);
      await save();

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ parentId: null, showInHeader: sent })
        );
      });
    }
  );

  test("sends the header choice unchanged when it was not touched", async () => {
    const { onSave, save } = setup();

    await save();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ showInHeader: true })
      );
    });
  });

  test("a category put in a group loses the checkbox, says why, and leaves its choice as stored", async () => {
    const { onSave, save, user } = setup({
      category: makeCategory({ showInHeader: false }),
    });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Group" }),
      "Bijouterie"
    );

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByTestId("category-header-in-group")).toHaveTextContent(
      "A category in a group always shows in its group's menu."
    );
    await save();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ parentId: 6 })
      );
    });
    expect(onSave.mock.calls[0]?.[0]).toHaveProperty("showInHeader", undefined);
  });

  test("a group has the checkbox, in Spanish too", () => {
    setup({ isGroup: true, locale: "es" });

    expect(
      screen.getByRole("checkbox", { name: "Mostrar en el encabezado" })
    ).toHaveProperty("checked", true);
    expect(screen.queryByTestId("category-header-in-group")).toBeNull();
  });
});
