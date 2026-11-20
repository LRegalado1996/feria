import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import type { PageFormValues } from "@/lib/schemas/page";
import { renderWithI18n } from "@/test/i18n";

import { PageForm, type PageFormOutcome, type PageFormPage } from "./page-form";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

function makePage(overrides: Partial<PageFormPage> = {}): PageFormPage {
  return {
    isHome: false,
    isPublished: true,
    nameEn: "Gifts",
    nameEs: "Regalos",
    seoDescriptionEn: null,
    seoDescriptionEs: "Para regalar.",
    seoTitleEn: null,
    seoTitleEs: null,
    showInHeader: true,
    slug: "regalos",
    ...overrides,
  };
}

function setup({
  cancel = true,
  locale = "en",
  outcome = "saved",
  page = null,
}: {
  cancel?: boolean;
  locale?: Locale;
  outcome?: PageFormOutcome | "hang" | "throw";
  page?: PageFormPage | null;
} = {}) {
  const onSave = vi.fn(
    async (_values: PageFormValues): Promise<PageFormOutcome> => {
      if (outcome === "hang") {
        return await new Promise<never>(() => {});
      }

      if (outcome === "throw") {
        throw new Error("Network down");
      }

      return await Promise.resolve(outcome);
    }
  );
  const onCancel = vi.fn<() => void>();
  const screenFor = (shown: PageFormPage | null) => (
    <PageForm
      onCancel={cancel ? onCancel : undefined}
      onSave={onSave}
      page={shown}
    />
  );
  const { rerender } = renderWithI18n(screenFor(page), { locale });
  /** A later read of the page reaches the form, as a refetch does. */
  const refresh = (stored: PageFormPage) => {
    rerender(screenFor(stored));
  };
  const user = userEvent.setup();
  const field = (name: string) => screen.getByRole("textbox", { name });
  const submit = async () => {
    await user.click(screen.getByTestId("page-form-submit"));
  };

  return { field, onCancel, onSave, refresh, submit, user };
}

describe("PageForm", () => {
  test("a new page: a draft off the header, its address following its Spanish name", async () => {
    const { field, onSave, submit, user } = setup();

    expect(screen.getByRole("form", { name: "New page" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Published" })
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Show in the header" })
    ).not.toBeChecked();

    await user.type(field("Name in Spanish"), "Regalos de Navidad");

    expect(field("Address")).toHaveValue("regalos-de-navidad");
    expect(
      screen.getByText(
        "The page is at /regalos-de-navidad, and in English at /en/regalos-de-navidad. Lowercase letters, numbers and hyphens."
      )
    ).toBeInTheDocument();

    await submit();

    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      isPublished: false,
      nameEn: null,
      nameEs: "Regalos de Navidad",
      seoDescriptionEn: null,
      seoDescriptionEs: null,
      seoTitleEn: null,
      seoTitleEs: null,
      showInHeader: false,
      slug: "regalos-de-navidad",
    });
  });

  test("an address typed by hand stays, whatever the name becomes", async () => {
    const { field, user } = setup();

    await user.type(field("Address"), "navidad");
    await user.type(field("Name in Spanish"), "Regalos");

    expect(field("Address")).toHaveValue("navidad");
  });

  test("an empty address shows an ellipsis in its hint", () => {
    setup();

    expect(
      screen.getByText(
        "The page is at /…, and in English at /en/…. Lowercase letters, numbers and hyphens."
      )
    ).toBeInTheDocument();
  });

  test("an existing page: its settings, its address left alone when its name changes", async () => {
    const { field, onSave, submit, user } = setup({ page: makePage() });

    expect(
      screen.getByRole("form", { name: "Page settings" })
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Published" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Show in the header" })
    ).toBeChecked();

    await user.clear(field("Name in Spanish"));
    await user.type(field("Name in Spanish"), "Navidad");
    await user.click(screen.getByRole("checkbox", { name: "Published" }));
    await submit();

    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      isPublished: false,
      nameEn: "Gifts",
      nameEs: "Navidad",
      seoDescriptionEn: null,
      seoDescriptionEs: "Para regalar.",
      seoTitleEn: null,
      seoTitleEs: null,
      showInHeader: true,
      slug: "regalos",
    });
    expect(
      screen.getByRole("button", { name: "Save settings" })
    ).toBeInTheDocument();
  });

  test("a newer page read after it opened replaces the settings left alone, never what the admin typed", async () => {
    const { field, onSave, refresh, submit, user } = setup({
      page: makePage(),
    });
    await user.clear(field("Name in Spanish"));
    await user.type(field("Name in Spanish"), "Mío");

    // Another admin renamed it in English and unpublished it meanwhile.
    refresh(makePage({ isPublished: false, nameEn: "Theirs", nameEs: "Suyo" }));

    expect(field("Name in English")).toHaveValue("Theirs");
    expect(field("Name in Spanish")).toHaveValue("Mío");
    expect(
      screen.getByRole("checkbox", { name: "Published" })
    ).not.toBeChecked();
    await submit();
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      isPublished: false,
      nameEn: "Theirs",
      nameEs: "Mío",
      seoDescriptionEn: null,
      seoDescriptionEs: "Para regalar.",
      seoTitleEn: null,
      seoTitleEs: null,
      showInHeader: true,
      slug: "regalos",
    });
  });

  test("a setting saved is no longer the admin's edit: a newer page read after the save replaces it", async () => {
    const { field, onSave, refresh, submit, user } = setup({
      page: makePage(),
    });
    await user.clear(field("Name in Spanish"));
    await user.type(field("Name in Spanish"), "Mío");
    await submit();
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        isPublished: true,
        nameEn: "Gifts",
        nameEs: "Mío",
        seoDescriptionEn: null,
        seoDescriptionEs: "Para regalar.",
        seoTitleEn: null,
        seoTitleEs: null,
        showInHeader: true,
        slug: "regalos",
      });
    });
    refresh(makePage({ nameEs: "Mío" }));

    // Another admin then renamed it over this save.
    refresh(makePage({ nameEs: "Suyo" }));

    expect(field("Name in Spanish")).toHaveValue("Suyo");
  });

  test("a save rebases on the page as last read: a read equal to an earlier one still replaces what was sent", async () => {
    const { field, refresh, submit, user } = setup({ page: makePage() });
    await user.clear(field("Name in Spanish"));
    await user.type(field("Name in Spanish"), "Mío");
    await submit();
    await waitFor(() => {
      expect(screen.getByTestId("page-form-submit")).toBeEnabled();
    });

    // The stored page came back as it was before the save (another admin's
    // save landed over it): the same values the form was first given.
    refresh(makePage());

    expect(field("Name in Spanish")).toHaveValue("Regalos");
  });

  test("a newer read while a save travels keeps the controls waiting", async () => {
    const { field, refresh, submit, user } = setup({
      outcome: "hang",
      page: makePage(),
    });
    await user.clear(field("Name in Spanish"));
    await user.type(field("Name in Spanish"), "Mío");
    await submit();

    refresh(makePage({ nameEn: "Gifts again" }));

    expect(screen.getByTestId("page-form-submit")).toBeDisabled();
    expect(screen.getByTestId("page-form-submit")).toHaveTextContent("Saving…");
    expect(field("Name in English")).toBeDisabled();
  });

  test("a page that becomes the home while unticked here is published again, and saves so", async () => {
    const { onSave, refresh, submit, user } = setup({ page: makePage() });
    await user.click(screen.getByRole("checkbox", { name: "Published" }));

    // Another admin chose this page as the home.
    refresh(makePage({ isHome: true }));
    await submit();

    expect(screen.getByRole("checkbox", { name: "Published" })).toBeChecked();
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      isPublished: true,
      nameEn: "Gifts",
      nameEs: "Regalos",
      seoDescriptionEn: null,
      seoDescriptionEs: "Para regalar.",
      seoTitleEn: null,
      seoTitleEs: null,
      showInHeader: true,
      slug: "regalos",
    });
  });

  test("a failed save keeps the admin's edit: a newer page read still leaves it", async () => {
    const { field, refresh, submit, user } = setup({
      outcome: "failed",
      page: makePage(),
    });
    await user.clear(field("Name in Spanish"));
    await user.type(field("Name in Spanish"), "Mío");
    await submit();
    await screen.findByRole("alert");

    refresh(makePage({ nameEs: "Suyo" }));

    expect(field("Name in Spanish")).toHaveValue("Mío");
  });

  test("the home stays published and stays off the header: both said, not offered", () => {
    setup({ locale: "es", page: makePage({ isHome: true, slug: "home" }) });

    expect(screen.getByRole("checkbox", { name: "Publicada" })).toBeDisabled();
    expect(
      screen.getByText(
        "Es la home: sigue publicada. Para despublicarla, elegí otra home primero."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Mostrar en el encabezado" })
    ).toBeNull();
    expect(
      screen.getByText("La home no va en el encabezado: el logo ya lleva ahí.")
    ).toBeInTheDocument();
  });

  test("refuses a missing name and an address the site uses, saving nothing", async () => {
    const { field, onSave, submit, user } = setup();

    await user.type(field("Address"), "productos");
    await submit();

    expect(field("Name in Spanish")).toHaveAccessibleDescription(
      "Write the name."
    );
    expect(field("Address")).toHaveAccessibleDescription(
      expect.stringContaining(
        "Use lowercase letters, numbers and hyphens, and an address the store does not use."
      )
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  test("an address another page or category has is said under the address", async () => {
    const { field, submit } = setup({ outcome: "taken", page: makePage() });

    await submit();

    await waitFor(() => {
      expect(field("Address")).toHaveAccessibleDescription(
        expect.stringContaining(
          "Another page or a category already has that address."
        )
      );
    });
    // Not a failure: what was typed is fine but the address.
    expect(screen.queryByText(/We could not save the page/u)).toBeNull();
  });

  test("a failed save keeps what was typed and says so, until the next try", async () => {
    const { field, submit } = setup({ outcome: "failed", page: makePage() });

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not save the page. What you typed is still here: try again."
    );
    expect(field("Name in Spanish")).toHaveValue("Regalos");
  });

  test("a save whose handler throws is reported, said, and hands the controls back", async () => {
    const { field, submit } = setup({ outcome: "throw", page: makePage() });

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not save the page. What you typed is still here: try again."
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      new Error("Network down"),
      { action: "Pages.save_settings" }
    );
    expect(screen.getByTestId("page-form-submit")).toBeEnabled();
    expect(field("Name in Spanish")).toBeEnabled();
  });

  test("while saving, the fields and the buttons wait", async () => {
    const { submit } = setup({ outcome: "hang", page: makePage() });

    await submit();

    expect(screen.getByTestId("page-form-submit")).toHaveTextContent("Saving…");
    expect(screen.getByTestId("page-form-submit")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(field()).toBeDisabled();

    function field() {
      return screen.getByRole("textbox", { name: "Name in Spanish" });
    }
  });

  test("cancel hands back without saving; without a handler there is no cancel", async () => {
    const { onCancel, onSave, user } = setup();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("without a cancel handler, offers no cancel", () => {
    setup({ cancel: false });

    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});
