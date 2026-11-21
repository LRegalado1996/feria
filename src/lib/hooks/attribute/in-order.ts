/**
 * `rows` with those listed in `ids` first, in that order, then any row
 * `ids` does not list (one read after the move was made) in its own order;
 * positions renumbered. An id the list does not hold leaves no gap.
 */
export function inOrder<Row extends { id: number; position: number }>(
  rows: Row[],
  ids: number[]
): Row[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const listed = new Set(ids);

  return [
    ...ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    }),
    ...rows.filter((row) => !listed.has(row.id)),
  ].map((row, position) => ({ ...row, position }));
}
