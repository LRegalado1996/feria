import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { PhotoRefusal } from "@/lib/hooks/upload";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { ProductPhotoDrop } from "./product-photo-drop";

function makeFile(name: string) {
  return new File(["photo"], name, { type: "image/jpeg" });
}

function setup({
  count = 0,
  locale = "en",
  refusals = [],
  unavailable,
}: {
  count?: number;
  locale?: Locale;
  refusals?: PhotoRefusal[];
  unavailable?: boolean;
} = {}) {
  const onFiles = vi.fn<(files: File[]) => void>();
  const user = userEvent.setup();
  renderWithI18n(
    <ProductPhotoDrop
      count={count}
      max={8}
      onFiles={onFiles}
      refusals={refusals}
      unavailable={unavailable}
    />,
    { locale }
  );
  const zone = screen.getByTestId("product-photo-drop");
  const input = screen.getByTestId<HTMLInputElement>("product-photo-input");

  return { input, onFiles, user, zone };
}

describe("ProductPhotoDrop", () => {
  test.each([
    [
      "en",
      "Photos can't be uploaded for now: uploads aren't set up on this server.",
    ],
    [
      "es",
      "Por ahora no se pueden subir fotos: la subida no está configurada en este servidor.",
    ],
  ] as const)(
    "in %s, says up front that this server cannot store photos, and takes none",
    async (locale, said) => {
      const { input, user, zone } = setup({ locale, unavailable: true });
      const click = vi.spyOn(input, "click");

      expect(screen.getByTestId("product-photo-unavailable")).toHaveTextContent(
        said
      );
      expect(zone).toBeDisabled();
      expect(zone).toHaveAccessibleDescription(new RegExp(`^${said}`, "u"));
      await user.click(zone);
      expect(click).not.toHaveBeenCalled();
    }
  );

  test("says nothing of uploads where the server stores photos", () => {
    const { zone } = setup();

    expect(screen.queryByTestId("product-photo-unavailable")).toBeNull();
    expect(zone).toBeEnabled();
  });

  test("is one button that says what to do, how many photos there are, and the hint", () => {
    const { zone } = setup({ count: 2 });

    expect(zone).toHaveTextContent("Tap to take or choose photos");
    expect(zone).toHaveTextContent(
      "Drop the photos here or click to choose them"
    );
    expect(zone).toHaveTextContent("2 of 8 photos");
    expect(zone).toHaveAccessibleDescription(
      "We suggest 3: the main one cut out, with no background, and two more. Up to 8."
    );
  });

  test("opens the device's picker, several photos at once, any image", async () => {
    const { input, user, zone } = setup();
    const click = vi.spyOn(input, "click");

    await user.click(zone);

    expect(click).toHaveBeenCalledExactlyOnceWith();
    expect(input).toHaveAttribute("accept", "image/*");
    expect(input).toHaveAttribute("multiple");
  });

  test("hands over the chosen files in their order, and lets the same ones be chosen again", async () => {
    const { input, onFiles, user } = setup();
    const files = [makeFile("a.jpg"), makeFile("b.jpg")];

    await user.upload(input, files);

    expect(onFiles).toHaveBeenCalledExactlyOnceWith(files);
    expect(input.value).toBe("");
  });

  test("hands over nothing when the picker comes back empty", () => {
    const { input, onFiles } = setup();

    fireEvent.change(input, { target: { files: [] } });

    expect(onFiles).not.toHaveBeenCalled();
  });

  test("takes photos dropped on it, marked while they hover", () => {
    const { onFiles, zone } = setup();
    const files = [makeFile("a.jpg")];

    fireEvent.dragOver(zone, { dataTransfer: { files } });
    expect(zone.className).toContain("border-foreground");
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain("border-foreground");
    fireEvent.dragOver(zone, { dataTransfer: { files } });
    fireEvent.drop(zone, { dataTransfer: { files } });

    expect(onFiles).toHaveBeenCalledExactlyOnceWith(files);
    expect(zone.className).not.toContain("border-foreground");
  });

  test.each([
    [0, "min-h-56"],
    [1, "min-h-24"],
  ])("with %s photos is %s tall", (count, height) => {
    const { zone } = setup({ count });

    expect(zone.className).toContain(height);
  });

  test.each([
    [7, true, "7 of 8 photos"],
    [8, false, "All 8 photos are in. Remove one to add another."],
  ])("with %s photos takes more: %s", (count, enabled, said) => {
    const { zone } = setup({ count });

    expect(zone).toHaveProperty("disabled", !enabled);
    expect(zone).toHaveTextContent(said);
  });

  test("names each refused file with its reason, in an alert", () => {
    setup({
      refusals: [
        { kind: "notImage", name: "notes.pdf" },
        { kind: "tooBig", name: "big.jpg" },
        { count: 2, kind: "tooMany" },
      ],
    });

    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent)
    ).toEqual([
      "“notes.pdf” is not a photo. Choose a JPEG, PNG, WebP or HEIC.",
      "“big.jpg” weighs more than 25 MB. Choose a lighter one.",
      "Up to 8 photos fit: 2 were left out.",
    ]);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  test("says nothing went wrong when nothing was refused", () => {
    setup();

    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("in Spanish, says it in Spanish, one left out", () => {
    const { zone } = setup({
      locale: "es",
      refusals: [{ count: 1, kind: "tooMany" }],
    });

    expect(zone).toHaveTextContent("Tocá para sacar o elegir fotos");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Entran hasta 8 fotos: quedó afuera 1."
    );
  });
});
