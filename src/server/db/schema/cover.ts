import { type SQL, sql } from "drizzle-orm";
import { type AnyPgColumn, check } from "drizzle-orm/pg-core";

/** One image of a cover: its address and its size. */
interface ImageColumns {
  height: AnyPgColumn;
  url: AnyPgColumn;
  width: AnyPgColumn;
}

/**
 * An image's three columns: all set, with a positive size, or none. Each
 * column is named NOT NULL in the set branch: a CHECK that comes out NULL
 * passes, so `width > 0` alone would let a missing width through.
 */
function imageComplete({ height, url, width }: ImageColumns): SQL {
  return sql`(${url} IS NULL AND ${width} IS NULL AND ${height} IS NULL) OR (${url} IS NOT NULL AND ${width} IS NOT NULL AND ${height} IS NOT NULL AND ${width} > 0 AND ${height} > 0)`;
}

/**
 * The checks that hold a catalog page's cover together (FER-043): the
 * computer image and the phone image are each whole or absent, and a phone
 * image only comes beside a computer one, which stands in for it on a phone
 * when it is missing. Named after `name`, the table that owns the page.
 */
export function coverChecks(
  name: string,
  { computer, phone }: { computer: ImageColumns; phone: ImageColumns }
) {
  return [
    check(`${name}_cover_complete`, imageComplete(computer)),
    check(`${name}_cover_phone_complete`, imageComplete(phone)),
    check(
      `${name}_cover_phone_needs_cover`,
      sql`${phone.url} IS NULL OR ${computer.url} IS NOT NULL`
    ),
  ];
}
