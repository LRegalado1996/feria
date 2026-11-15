import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { Toaster } from "@/app/_components/molecules/sonner";
import { reportError } from "@/lib/errors/client";
import { POST_NAME_MAX_LENGTH } from "@/lib/schemas/post";
import { renderWithI18n } from "@/test/i18n";

import { ComposeBox } from "./compose-box";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

/** `outcome` decides what the save does: resolve, reject, or never settle. */
function setup(
  outcome: "saved" | "refused" | "pending" = "saved",
  locale: "en" | "es" = "en"
) {
  const onSubmit = vi.fn(async (_values: unknown) => {
    if (outcome === "refused") {
      throw new Error("refused");
    }

    if (outcome === "pending") {
      await new Promise<never>(() => {});
    }
  });
  const user = userEvent.setup();

  renderWithI18n(
    <>
      <ComposeBox
        currentUser={{ name: "Test User", image: null }}
        onSubmit={onSubmit}
      />
      <Toaster />
    </>,
    { locale }
  );

  const textarea = screen.getByRole("textbox");
  const button = () => screen.getByRole("button");

  return { button, onSubmit, textarea, user };
}

describe("ComposeBox", () => {
  test("a labelled box beside the user's avatar, capped at the schema's length", () => {
    const { textarea } = setup();

    expect(textarea).toHaveAccessibleName("New post");
    expect(screen.getByTestId("compose-area")).toHaveAttribute(
      "data-slot",
      "compose-box"
    );
    expect(screen.getByTestId("compose-avatar")).toHaveTextContent("T");
    expect(textarea).toHaveAttribute("placeholder", "What's happening?");
    expect(textarea).toHaveAttribute("maxlength", String(POST_NAME_MAX_LENGTH));
  });

  test("keeps Post disabled until there is something besides spaces", async () => {
    const { button, textarea, user } = setup();

    expect(button()).toBeDisabled();

    await user.type(textarea, "   ");
    expect(button()).toBeDisabled();

    await user.type(textarea, "Hi");
    expect(button()).toBeEnabled();
  });

  test("submits the post trimmed and clears the box once it is saved", async () => {
    const { onSubmit, textarea, user } = setup("saved");

    await user.type(textarea, "  Hello  ");
    await user.click(screen.getByRole("button", { name: "Post" }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ name: "Hello" });
    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });
  });

  test("shows the save in progress and keeps the text meanwhile", async () => {
    const { button, textarea, user } = setup("pending");

    await user.type(textarea, "Hello");
    await user.click(button());

    expect(
      await screen.findByRole("button", { name: "Posting…" })
    ).toBeDisabled();
    expect(textarea).toHaveValue("Hello");
  });

  test("keeps what the user typed when the save fails, and says so", async () => {
    const { button, textarea, user } = setup("refused");

    await user.type(textarea, "Hello");
    await user.click(button());

    expect(
      await screen.findByText("Your post was not published. Try again.")
    ).toBeInTheDocument();
    expect(textarea).toHaveValue("Hello");
    expect(button()).toBeEnabled();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(new Error("refused"), {
      action: "Post.create",
    });
  });

  test("accepts another post after one is saved", async () => {
    const { onSubmit, textarea, user } = setup("saved");
    await user.type(textarea, "First");
    await user.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });

    await user.type(textarea, "Second");
    await user.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });
    expect(onSubmit.mock.calls).toEqual([
      [{ name: "First" }],
      [{ name: "Second" }],
    ]);
  });

  test("speaks Spanish on a Spanish page: label, placeholder, button and failure", async () => {
    const { button, textarea, user } = setup("refused", "es");

    expect(textarea).toHaveAccessibleName("Nueva publicación");
    expect(textarea).toHaveAttribute("placeholder", "¿Qué está pasando?");
    expect(button()).toHaveTextContent("Publicar");

    await user.type(textarea, "Hola");
    await user.click(button());

    expect(
      await screen.findByText("Tu publicación no se publicó. Probá de nuevo.")
    ).toBeInTheDocument();
  });

  test("says in Spanish that the save is in progress", async () => {
    const { textarea, user } = setup("pending", "es");

    await user.type(textarea, "Hola");
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    expect(
      await screen.findByRole("button", { name: "Publicando…" })
    ).toBeDisabled();
  });
});
