/**
 * `rows` in the order of `ids`, positions renumbered. A row whose id is not
 * listed is dropped, so an id the list does not hold leaves no gap.
 */
export function inOrder<Row extends { id: number; position: number }>(
  rows: Row[],
  ids: number[]
): Row[] {
  const byId = new Map(rows.map((row) => [row.id, row]));

  return ids
    .flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    })
    .map((row, position) => ({ ...row, position }));
}
