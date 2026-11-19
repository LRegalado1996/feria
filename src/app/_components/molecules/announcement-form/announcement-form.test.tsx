import { zodResolver } from "@hookform/resolvers/zod";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import {
  type AnnouncementFormFields,
  createAnnouncementFormSchema,
  type SaveAnnouncementValues,
} from "@/lib/schemas/home";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import {
  AnnouncementForm,
  type AnnouncementFormAnnouncement,
  announcementFields,
} from "./announcement-form";

function makeAnnouncement(
  overrides: Partial<AnnouncementFormAnnouncement> = {}
): AnnouncementFormAnnouncement {
  return {
    endsOn: "2027-01-05",
    isActive: true,
    linkUrl: "/productos",
    shortTextEn: null,
    shortTextEs: "En la feria · 5/12 al 5/1",
    startsOn: "2026-12-05",
    textEn: "Find us at the fair",
    textEs: "Encontranos en la feria, del 5/12 al 5/1",
    ...overrides,
  };
}

/** The screen's part: it makes the form and hands it over. */
function Harness({
  announcement,
  locale,
  onSave,
}: {
  announcement: AnnouncementFormAnnouncement | null;
  locale: Locale;
  onSave: (values: SaveAnnouncementValues) => Promise<boolean>;
}) {
  const form = useForm<AnnouncementFormFields, unknown, SaveAnnouncementValues>(
    {
      defaultValues: announcementFields(announcement),
      resolver: zodResolver(
        createAnnouncementFormSchema(
          DICTIONARIES[locale].admin.home.announcement.errors
        )
      ),
    }
  );

  return <AnnouncementForm form={form} onSave={onSave} />;
}

function setup({
  announcement = makeAnnouncement(),
  locale = "en",
  saves = true,
}: {
  announcement?: AnnouncementFormAnnouncement | null;
  locale?: Locale;
  /** `held` keeps the save on its way until `finish()`. */
  saves?: "held" | boolean;
} = {}) {
  let finish: (saved: boolean) => void = () => undefined;
  const held = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const onSave = vi.fn(
    async (_values: SaveAnnouncementValues) =>
      await (saves === "held" ? held : Promise.resolve(saves))
  );
  renderWithI18n(
    <Harness announcement={announcement} locale={locale} onSave={onSave} />,
    { locale }
  );
  const user = userEvent.setup();

  return {
    field: (name: string) => screen.getByRole("textbox", { name }),
    finish: (saved: boolean) => {
      finish(saved);
    },
    onSave,
    submit: async () => {
      await user.click(screen.getByTestId("announcement-form-submit"));
    },
    user,
  };
}

describe("announcementFields", () => {
  test("a store with no announcement yet starts blank and switched on", () => {
    expect(announcementFields(null)).toEqual({
      endsOn: "",
      isActive: true,
      linkUrl: "",
      shortTextEn: "",
      shortTextEs: "",
      startsOn: "",
      textEn: "",
      textEs: "",
    });
  });

  test("a saved one fills its fields, `null` as blank", () => {
    expect(
      announcementFields(makeAnnouncement({ isActive: false, linkUrl: null }))
    ).toEqual({
      endsOn: "2027-01-05",
      isActive: false,
      linkUrl: "",
      shortTextEn: "",
      shortTextEs: "En la feria · 5/12 al 5/1",
      startsOn: "2026-12-05",
      textEn: "Find us at the fair",
      textEs: "Encontranos en la feria, del 5/12 al 5/1",
    });
  });
});

describe("AnnouncementForm", () => {
  test("is a card named by its heading, the fields marked with their language", () => {
    const { field } = setup();

    expect(
      screen.getByRole("form", { name: "Announcement" })
    ).toBeInTheDocument();
    expect(field("Text in Spanish")).toHaveAttribute("lang", "es");
    expect(field("Short version in English")).toHaveAttribute("lang", "en");
    expect(screen.getByLabelText("From")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("From")).toHaveValue("2026-12-05");
  });

  test("saves what was typed, read into the announcement, blanks as none", async () => {
    const { field, onSave, submit, user } = setup();

    await user.clear(field("Text in English"));
    await user.clear(field("Link"));
    await user.click(
      screen.getByRole("checkbox", { name: "Show the announcement" })
    );
    await user.clear(screen.getByLabelText("Until"));
    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        endsOn: null,
        isActive: false,
        linkUrl: null,
        shortTextEn: null,
        shortTextEs: "En la feria · 5/12 al 5/1",
        startsOn: "2026-12-05",
        textEn: null,
        textEs: "Encontranos en la feria, del 5/12 al 5/1",
      });
    });
  });

  test("once saved, holds what was saved as its new start", async () => {
    const { field, submit, user } = setup();

    await user.clear(field("Text in Spanish"));
    await user.type(field("Text in Spanish"), "  Nuevo anuncio  ");
    await submit();

    await waitFor(() => {
      expect(field("Text in Spanish")).toHaveValue("Nuevo anuncio");
    });
  });

  test("keeps what was typed when the save fails", async () => {
    const { field, onSave, submit, user } = setup({ saves: false });

    await user.clear(field("Text in Spanish"));
    await user.type(field("Text in Spanish"), "  Nuevo anuncio  ");
    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledOnce();
    });
    expect(field("Text in Spanish")).toHaveValue("  Nuevo anuncio  ");
  });

  test.each([
    ["Text in Spanish", "", "Write the announcement's text."],
    [
      "Link",
      ["javascript", "alert(1)"].join(":"),
      "Write a page of the store, such as /productos, or a full link starting with https://",
    ],
    ["Short version in Spanish", "x".repeat(41), "Use up to 40 characters."],
  ])(
    "refuses %s set to %j under its field, saving nothing",
    async (name, typed, message) => {
      const { field, onSave, submit, user } = setup();

      await user.clear(field(name));

      if (typed !== "") {
        await user.click(field(name));
        await user.paste(typed);
      }

      await submit();

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(field(name)).toHaveAttribute("aria-invalid", "true");
      expect(onSave).not.toHaveBeenCalled();
    }
  );

  test("refuses a last day before the first", async () => {
    const { onSave, submit, user } = setup();

    await user.clear(screen.getByLabelText("Until"));
    await user.type(screen.getByLabelText("Until"), "2026-12-04");
    await submit();

    expect(
      await screen.findByText("The last day comes on or after the first.")
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("says it is saving and holds the fields while it saves", async () => {
    const { field, finish, submit } = setup({ saves: "held" });
    const button = screen.getByTestId("announcement-form-submit");

    await submit();

    await waitFor(() => {
      expect(button).toHaveTextContent(/^Saving…$/u);
    });
    expect(button).toBeDisabled();
    expect(field("Text in Spanish")).toBeDisabled();
    finish(true);
    await waitFor(() => {
      expect(button).toHaveTextContent(/^Save announcement$/u);
    });
  });

  test("speaks Spanish on a Spanish page", () => {
    setup({ locale: "es" });

    expect(screen.getByRole("form", { name: "Anuncio" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Texto en español" })
    ).toHaveValue("Encontranos en la feria, del 5/12 al 5/1");
    expect(screen.getByTestId("announcement-form-submit")).toHaveTextContent(
      /^Guardar anuncio$/u
    );
  });
});
