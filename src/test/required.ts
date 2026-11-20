/**
 * What a query found, or a test that fails saying it found nothing: a
 * narrowing for an element a test needs, never a cast that hides its
 * absence.
 *
 *   fireEvent.click(required(document.querySelector("button")));
 */
export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected the element to be there; it was not found.");
  }

  return value;
}
