import { render } from "@testing-library/react";
import { expect, test } from "vitest";

import { required } from "@/test/required";

import { StorePicture, type StorePictureProps } from "./store-picture";

const COMPUTER = { height: 800, url: "/seed/ring-2.jpg", width: 1200 };
const PHONE = { height: 1200, url: "/seed/ring-1.jpg", width: 1000 };

function setup(props: Partial<StorePictureProps> = {}) {
  const { container } = render(
    <div className="relative">
      <StorePicture
        alt="Anillo sello"
        computer={COMPUTER}
        data-testid="picture-image"
        phone={PHONE}
        {...props}
      />
    </div>
  );
  const picture = required(container.querySelector("picture"));

  return {
    image: required(picture.querySelector("img")),
    picture,
    sources: [...picture.querySelectorAll("source")],
  };
}

test("shows the phone's crop below md and the computer's photo from md up", () => {
  const { image, picture, sources } = setup();

  const [source] = sources;
  expect(sources).toHaveLength(1);
  expect(required(source).getAttribute("media")).toBe("(min-width: 768px)");
  expect(required(source).getAttribute("srcset")).toContain(
    encodeURIComponent(COMPUTER.url)
  );
  expect(required(source).getAttribute("srcset")).not.toContain(
    encodeURIComponent(PHONE.url)
  );
  expect(image.getAttribute("src")).toContain(encodeURIComponent(PHONE.url));
  expect(image.getAttribute("srcset")).toContain(encodeURIComponent(PHONE.url));
  expect(picture).toHaveAttribute("data-slot", "store-picture");
});

test.each([null, undefined])(
  "without a phone crop (%s), shows the computer's photo everywhere",
  (phone) => {
    const { image, sources } = setup({ phone });

    expect(sources).toEqual([]);
    expect(image.getAttribute("src")).toContain(
      encodeURIComponent(COMPUTER.url)
    );
  }
);

test("waits until it is near the screen unless told it is the page's first photo", () => {
  const { image } = setup();

  expect(image).toHaveAttribute("loading", "lazy");
  expect(image).not.toHaveAttribute("fetchpriority");
});

test("as the page's priority image, is fetched first and never lazily", () => {
  const { image } = setup({ priority: true });

  expect(image).toHaveAttribute("loading", "eager");
  expect(image).toHaveAttribute("fetchpriority", "high");
});

test("fills its box at the widths it is given, the whole window by default, with its own words and a caller's class", () => {
  const { image, sources } = setup();

  expect(image).toHaveAttribute("sizes", "100vw");
  expect(required(sources[0])).toHaveAttribute("sizes", "100vw");
  expect(image).toHaveAttribute("alt", "Anillo sello");
  expect(image).toHaveAttribute("data-testid", "picture-image");
  expect(image).toHaveClass("absolute", "inset-0", "size-full", "object-cover");

  const { image: narrow, sources: narrowSources } = setup({
    alt: "",
    className: "opacity-60",
    sizes: "50vw",
  });

  expect(narrow).toHaveAttribute("sizes", "50vw");
  // The computer's photo is chosen at the same width as the phone's.
  expect(required(narrowSources[0])).toHaveAttribute("sizes", "50vw");
  expect(narrow).toHaveAttribute("alt", "");
  expect(narrow).toHaveClass("opacity-60", "object-cover");
});
