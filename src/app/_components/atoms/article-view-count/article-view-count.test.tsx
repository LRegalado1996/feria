import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ArticleViewCount } from "./article-view-count";

// When and how the view is counted is `use-count-view.test.tsx`'s.
const { useCountView } = vi.hoisted(() => ({
  useCountView: vi.fn<(productId: number) => void>(),
}));

vi.mock("@/lib/hooks/metrics", () => ({ useCountView }));

describe("ArticleViewCount", () => {
  test("counts the session's view of its article and draws nothing", () => {
    const { container } = render(<ArticleViewCount productId={58} />);

    expect(useCountView).toHaveBeenCalledExactlyOnceWith(58);
    expect(container).toBeEmptyDOMElement();
  });
});
