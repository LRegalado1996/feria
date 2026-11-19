/** One place in a row of page numbers: a page, or the pages left out. */
export type PaginationItem =
  | { kind: "page"; page: number }
  | { kind: "gap"; side: "end" | "start" };

/** Up to this many pages, every one is listed. */
const ALL_PAGES_UP_TO = 7;

/**
 * The page numbers a list's foot shows (FER-019), seven places at most so
 * the row never changes width as it moves: the first and the last page
 * always, the current one with one either side, and a gap for the pages
 * left out. A gap only ever stands for two pages or more: one page would
 * fit in its place. `page` outside 1…`pageCount` is read as the nearest
 * end; no pages, no places.
 */
export function paginationItems(
  page: number,
  pageCount: number
): PaginationItem[] {
  const at = (number: number): PaginationItem => ({
    kind: "page",
    page: number,
  });
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, index) => at(from + index));

  if (pageCount <= ALL_PAGES_UP_TO) {
    return range(1, pageCount);
  }

  const current = Math.min(Math.max(page, 1), pageCount);

  // Near the start: the first five, then the gap and the last.
  if (current <= 4) {
    return [...range(1, 5), { kind: "gap", side: "end" }, at(pageCount)];
  }

  // Near the end: the first, the gap, then the last five.
  if (current >= pageCount - 3) {
    return [
      at(1),
      { kind: "gap", side: "start" },
      ...range(pageCount - 4, pageCount),
    ];
  }

  return [
    at(1),
    { kind: "gap", side: "start" },
    ...range(current - 1, current + 1),
    { kind: "gap", side: "end" },
    at(pageCount),
  ];
}
