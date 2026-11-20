import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { ImageUploaderProps } from "@/app/_components/molecules/image-uploader";
import type { Locale } from "@/lib/i18n/config";
import type { BannerFormValues } from "@/lib/schemas/home";
import { renderWithI18n } from "@/test/i18n";

import {
  BannerForm,
  type BannerFormBanner,
  type BannerFormOutcome,
} from "./banner-form";

const UPLOADED = {
  height: 1067,
  url: "https://store9.public.blob.vercel-storage.com/local/banner/0f8e2b9c-1d2a-4b3c-8d4e-5f6a7b8c9d0e.webp",
  width: 1600,
};
const UPLOADED_PHONE = {
  height: 1067,
  url: "https://store9.public.blob.vercel-storage.com/local/banner/1f8e2b9c-1d2a-4b3c-8d4e-5f6a7b8c9d0e.webp",
  width: 854,
};

const STORED_URL =
  "https://store9.public.blob.vercel-storage.com/local/banner/2f8e2b9c-1d2a-4b3c-8d4e-5f6a7b8c9d0e.webp";
const STORED_PHONE_URL =
  "https://store9.public.blob.vercel-storage.com/local/banner/3f8e2b9c-1d2a-4b3c-8d4e-5f6a7b8c9d0e.webp";

// The uploader has its own tests (FER-011); here it is a field whose
// buttons hand the form a photo, take it away, or say one is travelling.
// Its buttons stay pressable while the field is shut, as a photo that was
// on its way when the field shut still lands.
vi.mock("@/app/_components/molecules/image-uploader", () => ({
  ImageUploader: ({
    description,
    disabled,
    label,
    onBusyChange,
    onChange,
    purpose,
    value,
  }: ImageUploaderProps) => (
    <fieldset
      aria-label={label}
      data-disabled={disabled === true}
      data-purpose={purpose}
    >
      <p>{description}</p>
      <output>{value?.url ?? "none"}</output>
      <button
        onClick={() => {
          onChange(label === "Phone photo" ? UPLOADED_PHONE : UPLOADED);
        }}
        type="button"
      >
        {`upload ${label}`}
      </button>
      <button
        onClick={() => {
          onChange(null);
        }}
        type="button"
      >
        {`remove ${label}`}
      </button>
      <button
        onClick={() => {
          onBusyChange?.(true);
        }}
        type="button"
      >
        {`start ${label}`}
      </button>
      <button
        onClick={() => {
          onBusyChange?.(false);
        }}
        type="button"
      >
        {`stop ${label}`}
      </button>
    </fieldset>
  ),
}));

function makeBanner(
  overrides: Partial<BannerFormBanner> = {}
): BannerFormBanner {
  return {
    ctaLabelEn: null,
    ctaLabelEs: "Ver joyas",
    endsOn: "2027-01-05",
    id: 31,
    image: { height: 800, url: STORED_URL, width: 1200 },
    imagePhone: { height: 800, url: STORED_PHONE_URL, width: 800 },
    isActive: true,
    link: { categoryId: 6, kind: "category" },
    placement: "rows",
    startsOn: "2026-12-05",
    titleEn: "Jewelry",
    titleEs: "Joyas",
    ...overrides,
  };
}

function setup({
  banner = null,
  locale = "en",
  rowsIndex = null,
  outcome = "saved",
}: {
  banner?: BannerFormBanner | null;
  locale?: Locale;
  outcome?: BannerFormOutcome;
  rowsIndex?: number | null;
} = {}) {
  const onSave = vi.fn(
    async (_values: BannerFormValues): Promise<BannerFormOutcome> =>
      await Promise.resolve(outcome)
  );
  const onCancel = vi.fn<() => void>();
  renderWithI18n(
    <BannerForm
      articles={[
        { id: 21, label: "Anillo sello" },
        { id: 22, label: "Burbujero pez" },
      ]}
      banner={banner}
      categories={[
        { id: 4, label: "Anillos" },
        { id: 6, label: "Bijouterie" },
      ]}
      onCancel={onCancel}
      onSave={onSave}
      rows={["Best sellers", "Rings", "Featured"]}
      rowsIndex={rowsIndex}
    />,
    { locale }
  );
  const user = userEvent.setup();

  return {
    onCancel,
    onSave,
    select: (name: string) => screen.getByRole("combobox", { name }),
    submit: async () => {
      await user.click(screen.getByTestId("banner-form-submit"));
    },
    user,
  };
}

describe("BannerForm", () => {
  test("a new banner opens in the cover, shown, leading nowhere, and the phone photo waits for the computer one", () => {
    const { select } = setup();

    expect(select("Where it goes")).toHaveValue("cover");
    expect(select("Leads to")).toHaveValue("none");
    expect(
      screen.getByRole("checkbox", { name: "Show the banner" })
    ).toBeChecked();
    expect(screen.queryByRole("combobox", { name: "After" })).toBeNull();
    const phone = screen.getByRole("group", { name: "Phone photo" });
    expect(phone).toHaveAttribute("data-disabled", "true");
    expect(phone).toHaveTextContent("Choose the computer photo first.");
    expect(
      screen.getByRole("group", { name: "Computer photo" })
    ).toHaveAttribute("data-purpose", "banner");
    expect(screen.queryByTestId("banner-form-crop-preview")).toBeNull();
  });

  test("refuses a banner without its title, saving nothing", async () => {
    const { onSave, submit } = setup();

    await submit();

    expect(await screen.findByText("Write the title.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("refuses a titled banner without its computer photo, saving nothing", async () => {
    const { onSave, submit, user } = setup();

    await user.type(
      screen.getByRole("textbox", { name: "Title in Spanish" }),
      "Burbujeros"
    );
    await submit();

    expect(
      await screen.findByText("Choose the computer photo.")
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("saves a new banner between rows, after the first row by default, leading to an article", async () => {
    const { onSave, select, submit, user } = setup();

    await user.click(
      screen.getByRole("button", { name: "upload Computer photo" })
    );
    await user.type(
      screen.getByRole("textbox", { name: "Title in Spanish" }),
      "  Burbujeros  "
    );
    await user.selectOptions(select("Leads to"), "product");
    await user.selectOptions(select("Article"), "22");
    await user.selectOptions(select("Where it goes"), "rows");
    expect(select("After")).toHaveValue("1");
    expect(
      within(select("After"))
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["Before the first row", "Best sellers", "Rings", "Featured"]);
    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        ctaLabelEn: null,
        ctaLabelEs: null,
        endsOn: null,
        image: UPLOADED,
        imagePhone: null,
        isActive: true,
        link: { kind: "product", productId: 22 },
        placement: "rows",
        rowsIndex: 1,
        startsOn: null,
        titleEn: null,
        titleEs: "Burbujeros",
      });
    });
  });

  test("opens a banner as it was saved and sends it back unchanged, its place kept", async () => {
    const banner = makeBanner();
    const { onSave, select, submit } = setup({ banner, rowsIndex: 2 });

    expect(select("Leads to")).toHaveValue("category");
    expect(select("Category")).toHaveValue("6");
    expect(select("After")).toHaveValue("2");
    expect(screen.getByLabelText("From")).toHaveValue("2026-12-05");
    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        ctaLabelEn: null,
        ctaLabelEs: "Ver joyas",
        endsOn: "2027-01-05",
        image: banner.image,
        imagePhone: banner.imagePhone,
        isActive: true,
        link: { categoryId: 6, kind: "category" },
        placement: "rows",
        rowsIndex: 2,
        startsOn: "2026-12-05",
        titleEn: "Jewelry",
        titleEs: "Joyas",
      });
    });
  });

  test("a place past the end of the rows opens at the last one", () => {
    const { select } = setup({ banner: makeBanner(), rowsIndex: 9 });

    expect(select("After")).toHaveValue("3");
  });

  test("shows how each screen crops the photos, the phone its own when there is one", () => {
    setup({ banner: makeBanner() });

    const images = within(
      screen.getByTestId("banner-form-crop-preview")
    ).getAllByRole("presentation");
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      expect.stringContaining("2f8e2b9c"),
      expect.stringContaining("3f8e2b9c"),
    ]);
  });

  test("crops the computer photo for a phone without its own", () => {
    setup({ banner: makeBanner({ imagePhone: null }) });

    const images = within(
      screen.getByTestId("banner-form-crop-preview")
    ).getAllByRole("presentation");
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      expect.stringContaining("2f8e2b9c"),
      expect.stringContaining("2f8e2b9c"),
    ]);
  });

  test("removing the computer photo removes the phone one, and a phone photo landing after it is dropped", async () => {
    const { user } = setup({ banner: makeBanner() });

    await user.click(
      screen.getByRole("button", { name: "remove Computer photo" })
    );
    const phone = screen.getByRole("group", { name: "Phone photo" });
    expect(within(phone).getByRole("status")).toHaveTextContent(/^none$/u);

    await user.click(
      within(phone).getByRole("button", { name: "upload Phone photo" })
    );

    expect(within(phone).getByRole("status")).toHaveTextContent(/^none$/u);
    expect(screen.queryByTestId("banner-form-crop-preview")).toBeNull();
  });

  test("takes a phone photo once there is a computer one", async () => {
    const { onSave, submit, user } = setup({
      banner: makeBanner({ imagePhone: null }),
    });

    await user.click(
      screen.getByRole("button", { name: "upload Phone photo" })
    );
    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ imagePhone: UPLOADED_PHONE })
      );
    });
  });

  test.each([
    ["category", "Category", "Choose the category."],
    ["product", "Article", "Choose the article."],
  ])("leading to a %s, requires one chosen", async (kind, label, message) => {
    const { onSave, select, submit, user } = setup({
      banner: makeBanner({ link: { kind: "none" } }),
    });

    await user.selectOptions(select("Leads to"), kind);
    expect(select(label)).toHaveValue("");
    await submit();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test.each(["/productos?color=dorado", "https://instagram.com/lr-market"])(
    "leading to the address %j, saves it",
    async (url) => {
      const { onSave, select, submit, user } = setup({
        banner: makeBanner({ link: { kind: "none" } }),
      });

      await user.selectOptions(select("Leads to"), "url");
      await user.type(screen.getByRole("textbox", { name: "Address" }), url);
      await submit();

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ link: { kind: "url", url } })
        );
      });
    }
  );

  test.each([
    ["a script", ["javascript", "alert(1)"].join(":")],
    ["another site's path", "//evil.example"],
    ["plain http", "http://evil.example"],
    ["nothing", ""],
  ])("leading to %s, refuses it under its field", async (_case, url) => {
    const { onSave, select, submit, user } = setup({
      banner: makeBanner({ link: { kind: "none" } }),
    });

    await user.selectOptions(select("Leads to"), "url");
    const field = screen.getByRole("textbox", { name: "Address" });
    await user.click(field);
    await user.paste(url);
    await submit();

    expect(
      await screen.findByText(
        "Write a page of the store, such as /productos, or a full link starting with https://"
      )
    ).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(onSave).not.toHaveBeenCalled();
  });

  test("refuses an English button without an English title, and a last day before the first", async () => {
    const { onSave, submit, user } = setup({
      banner: makeBanner({ titleEn: null }),
    });

    await user.type(
      screen.getByRole("textbox", { name: "Button in English" }),
      "See"
    );
    await user.clear(screen.getByLabelText("Until"));
    await user.type(screen.getByLabelText("Until"), "2026-12-04");
    await submit();

    expect(
      await screen.findByText("Write the English title first.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("The last day comes on or after the first.")
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("moved into the cover, sends no place among the rows", async () => {
    const { onSave, select, submit, user } = setup({ banner: makeBanner() });

    await user.selectOptions(select("Where it goes"), "cover");
    expect(screen.queryByRole("combobox", { name: "After" })).toBeNull();
    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledOnce();
    });
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty("rowsIndex");
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ placement: "cover" });
  });

  test("sends a banner switched off as off", async () => {
    const { onSave, submit, user } = setup({ banner: makeBanner() });

    await user.click(screen.getByRole("checkbox", { name: "Show the banner" }));
    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ isActive: false })
      );
    });
  });

  test.each(["Computer photo", "Phone photo"])(
    "waits while the %s is on its way",
    async (label) => {
      setup({ banner: makeBanner() });
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: `start ${label}` }));

      expect(screen.getByTestId("banner-form-submit")).toBeDisabled();
    }
  );

  test("waits while a photo is on its way, saying why, and takes the save once it lands", async () => {
    const banner = makeBanner();
    const { onSave, submit, user } = setup({ banner });
    const save = screen.getByTestId("banner-form-submit");

    await user.click(screen.getByRole("button", { name: "start Phone photo" }));

    expect(save).toBeDisabled();
    expect(
      screen.getByText("Wait for the photo to finish uploading.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "stop Phone photo" }));
    expect(save).toBeEnabled();
    expect(
      screen.queryByText("Wait for the photo to finish uploading.")
    ).toBeNull();
    await submit();

    // The upload stopped: the photos it had are the ones saved.
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        ctaLabelEn: null,
        ctaLabelEs: "Ver joyas",
        endsOn: "2027-01-05",
        image: banner.image,
        imagePhone: banner.imagePhone,
        isActive: true,
        link: { categoryId: 6, kind: "category" },
        placement: "rows",
        rowsIndex: 1,
        startsOn: "2026-12-05",
        titleEn: "Jewelry",
        titleEs: "Joyas",
      });
    });
  });

  test("says a failed save under the form and keeps what was typed", async () => {
    const { submit, user } = setup({
      banner: makeBanner(),
      outcome: "failed",
    });
    const title = screen.getByRole("textbox", { name: "Title in Spanish" });

    await user.clear(title);
    await user.type(title, "Joyas de fiesta");
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't save the banner. What you wrote is still here: try again."
    );
    expect(title).toHaveValue("Joyas de fiesta");
  });

  test("says the cover is full when the save is refused for it, and keeps the form", async () => {
    const { submit } = setup({ banner: makeBanner(), outcome: "coverFull" });

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^The cover already has 6 banners: take one out of the cover or put this one between rows\.$/u
    );
    expect(
      screen.getByRole("textbox", { name: "Title in Spanish" })
    ).toHaveValue("Joyas");
  });

  test("cancels without saving", async () => {
    const { onCancel, onSave, user } = setup({ banner: makeBanner() });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledExactlyOnceWith();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("speaks Spanish on a Spanish page", () => {
    setup({ banner: makeBanner(), locale: "es" });

    expect(
      screen.getByRole("form", { name: "Editar banner" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Dónde va" })
    ).toHaveDisplayValue("Entre dos filas");
    expect(
      screen.getByRole("button", { name: "Guardar banner" })
    ).toBeEnabled();
  });

  test("names a new banner's form as new", () => {
    setup();

    expect(
      screen.getByRole("form", { name: "New banner" })
    ).toBeInTheDocument();
  });
});
