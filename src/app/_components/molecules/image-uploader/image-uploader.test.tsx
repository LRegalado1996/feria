import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { ImageUploadState } from "@/lib/hooks/upload";
import type { Locale } from "@/lib/i18n/config";
import type { UploadedImage } from "@/lib/schemas/upload";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import { ImageUploader } from "./image-uploader";

// The upload itself (preparing, the token, the progress, retry and cancel)
// is `use-image-upload.test.tsx`'s; here the hook is a double the test puts
// in each state, recording what the component asked of it.
const hook = vi.hoisted(() => ({
  cancel: vi.fn(),
  retry: vi.fn(),
  start: vi.fn((_file: Blob) => undefined),
  useImageUpload: vi.fn(),
}));

vi.mock("@/lib/hooks/upload", () => ({ useImageUpload: hook.useImageUpload }));

const LABEL = "Desktop photo";

function makeImage(overrides: Partial<UploadedImage> = {}): UploadedImage {
  return {
    height: 1600,
    url: "https://store9.public.blob.vercel-storage.com/local/cover/a.webp",
    width: 2400,
    ...overrides,
  };
}

function setup({
  locale = "en",
  state = { status: "idle" },
  value = null,
}: {
  locale?: Locale;
  state?: ImageUploadState;
  value?: UploadedImage | null;
} = {}) {
  const copy = DICTIONARIES[locale].admin.imageUpload;
  const onChange = vi.fn((_image: UploadedImage | null) => undefined);
  const onBusyChange = vi.fn((_busy: boolean) => undefined);
  hook.useImageUpload.mockReturnValue({
    cancel: hook.cancel,
    retry: hook.retry,
    start: hook.start,
    state,
  });
  const user = userEvent.setup();
  renderWithI18n(
    <ImageUploader
      aria-describedby="form-error"
      label={LABEL}
      onBusyChange={onBusyChange}
      onChange={onChange}
      purpose="cover"
      value={value}
    />,
    { locale }
  );
  const group = screen.getByRole("group", { name: LABEL });
  const named = (action: string) =>
    within(group).getByRole("button", { name: `${action}: ${LABEL}` });

  return { copy, group, named, onBusyChange, onChange, user };
}

describe("ImageUploader", () => {
  test("offers to choose a photo, the formats under its label, and hands the hook the purpose and the form's setter", () => {
    const { copy, group, named, onBusyChange, onChange } = setup();

    expect(group).toHaveAccessibleDescription(copy.hint);
    expect(group).toHaveAttribute(
      "aria-describedby",
      expect.stringMatching(/ form-error$/)
    );
    expect(named(copy.choose)).toHaveTextContent(copy.choose);
    expect(within(group).queryByRole("progressbar")).toBeNull();
    expect(within(group).queryByRole("img")).toBeNull();
    expect(hook.useImageUpload).toHaveBeenCalledWith({
      onBusyChange,
      onUploaded: onChange,
      purpose: "cover",
    });
  });

  test("choosing a file starts its upload; the same file can be chosen again", async () => {
    const { copy, named, user } = setup();
    const file = new File(["photo"], "IMG_0001.jpg", { type: "image/jpeg" });
    const input = screen.getByTestId("image-uploader-input");

    expect(input).toHaveAttribute("accept", "image/*");
    await user.click(named(copy.choose));
    await user.upload(input, file);

    expect(hook.start).toHaveBeenCalledExactlyOnceWith(file);
    expect(input).toHaveValue("");
  });

  test("a stored photo shows at its size and can be replaced or removed", async () => {
    const { copy, group, named, onChange, user } = setup({
      value: makeImage(),
    });

    const preview = within(group).getByRole("img", {
      name: `Preview: ${LABEL}`,
    });
    expect(preview).toHaveAttribute("width", "2400");
    expect(preview).toHaveAttribute("height", "1600");
    expect(named(copy.replace)).toHaveTextContent(copy.replace);

    await user.click(named(copy.remove));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
    expect(within(group).getByRole("status")).toHaveTextContent(copy.removed);
  });

  test("while uploading: the progress as a bar and in words, and only a cancel", async () => {
    const { copy, group, named, user } = setup({
      state: { percent: 42, status: "uploading" },
    });

    const bar = within(group).getByRole("progressbar", {
      name: `Upload progress: ${LABEL}`,
    });
    expect(bar).toHaveAttribute("value", "42");
    expect(bar).toHaveAttribute("max", "100");
    expect(group).toHaveAttribute("aria-busy", "true");
    expect(within(group).getByRole("status")).toHaveTextContent(
      "Uploading the photo… 42%"
    );
    expect(within(group).getAllByRole("button")).toEqual([named(copy.cancel)]);

    await user.click(named(copy.cancel));

    expect(hook.cancel).toHaveBeenCalledExactlyOnceWith();
  });

  test("while preparing: a bar with no value yet, and the words for it", () => {
    const { copy, group } = setup({ state: { status: "preparing" } });

    // A <progress> without a value is the indeterminate one.
    expect(
      within(group).getByRole("progressbar", {
        name: `Upload progress: ${LABEL}`,
      })
    ).not.toHaveAttribute("value");
    expect(within(group).getByRole("status")).toHaveTextContent(copy.preparing);
  });

  test("a failed upload says so in an alert and offers a retry", async () => {
    const { copy, group, named, user } = setup({
      state: { reason: "failed", status: "failed" },
    });

    expect(within(group).getByRole("alert")).toHaveTextContent(
      copy.errors.failed
    );
    expect(group).not.toHaveAttribute("aria-busy");

    await user.click(named(copy.retry));

    expect(hook.retry).toHaveBeenCalledExactlyOnceWith();
  });

  test("a retry after removing the stored photo no longer says it was removed", async () => {
    const { copy, group, named, user } = setup({
      state: { reason: "failed", status: "failed" },
      value: makeImage(),
    });
    const status = within(group).getByRole("status");

    await user.click(named(copy.remove));
    expect(status).toHaveTextContent(copy.removed);
    await user.click(named(copy.retry));

    expect(hook.retry).toHaveBeenCalledExactlyOnceWith();
    expect(status).toBeEmptyDOMElement();
  });

  test.each([
    [
      "unreadable",
      "We could not read this photo. Try a JPEG, PNG or WebP one.",
    ],
    [
      "tooLarge",
      "The photo is still too heavy after shrinking it. Try another one.",
    ],
  ] as const)("a %s photo asks for another, with no retry", (reason, text) => {
    const { copy, group, named } = setup({
      state: { reason, status: "failed" },
    });

    expect(within(group).getByRole("alert")).toHaveTextContent(text);
    expect(within(group).getAllByRole("button")).toEqual([named(copy.choose)]);
  });

  test.each([
    ["done", "Photo uploaded."],
    ["cancelled", "Upload cancelled."],
  ] as const)("once %s, it says so politely", (status, text) => {
    const { group } = setup({ state: { status } });

    expect(within(group).getByRole("status")).toHaveTextContent(text);
    expect(within(group).queryByRole("alert")).toBeNull();
  });

  test("speaks Spanish on a Spanish page", () => {
    const { group } = setup({
      locale: "es",
      state: { percent: 7, status: "uploading" },
      value: makeImage(),
    });

    expect(within(group).getByRole("status")).toHaveTextContent(
      "Subiendo la foto… 7%"
    );
    expect(
      within(group).getByRole("button", { name: `Cancelar: ${LABEL}` })
    ).toBeVisible();
    expect(
      within(group).getByRole("img", { name: `Vista previa: ${LABEL}` })
    ).toBeVisible();
  });
});
