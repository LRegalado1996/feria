import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { PostCard, type PostCardProps, PostCardSkeleton } from "./post-card";

const NOW = new Date("2024-06-15T12:00:00Z").getTime();

function setup(overrides: Partial<PostCardProps> = {}) {
  const props: PostCardProps = {
    author: { name: "Alice", image: null },
    content: "Hello world",
    now: NOW,
    timestamp: new Date(NOW - 5 * 60 * 1000),
    ...overrides,
  };

  return render(<PostCard {...props} />);
}

describe("PostCard", () => {
  test("renders an article marked with its slot", () => {
    setup();

    const article = screen.getByRole("article");
    expect(article).toHaveAttribute("data-slot", "post-card");
    expect(article).toHaveAttribute("data-testid", "post-card");
  });

  test("shows the author's name and initial", () => {
    setup({ author: { name: "Bob", image: null } });

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  test("shows the post content", () => {
    setup({ content: "This is my post content" });

    expect(screen.getByText("This is my post content")).toBeInTheDocument();
  });

  test("reads the age against the clock it is given, with a machine-readable time", () => {
    setup({ now: NOW + 60 * 60 * 1000 });

    const time = screen.getByText("1 hour ago");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("dateTime", "2024-06-15T11:55:00.000Z");
  });

  test("shows the row menu it is given", () => {
    setup({ actions: <button type="button">More actions</button> });

    expect(screen.getByRole("article").lastElementChild).toHaveAccessibleName(
      "More actions"
    );
  });

  test("has no actions without them", () => {
    setup();

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("merges a custom className", () => {
    setup({ className: "custom-class" });

    expect(screen.getByRole("article")).toHaveClass("custom-class");
  });
});

function setupSkeleton() {
  return render(<PostCardSkeleton />);
}

describe("PostCardSkeleton", () => {
  test("mirrors the card: avatar, name, time and two content lines", () => {
    setupSkeleton();

    const skeleton = screen.getByTestId("post-card-skeleton");
    expect(skeleton).toHaveAttribute("data-slot", "post-card-skeleton");
    const bars = [...skeleton.querySelectorAll('[data-slot="skeleton"]')];
    expect(bars.map((bar) => bar.tagName)).toEqual([
      "DIV",
      "SPAN",
      "SPAN",
      "DIV",
      "DIV",
    ]);
  });
});
