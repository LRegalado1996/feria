import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();

/**
 * A SQL fragment a service handed to Drizzle (a `where`, a join condition),
 * as the SQL text the driver receives and its bound parameters.
 *
 * The mock database returns whatever a test told it to, so asserting the
 * returned rows proves nothing about the query. The argument the service
 * built is what proves a filter reached it, and the values travel as
 * parameters: the text alone can't tell "filtered by this value" from
 * "filtered by any value".
 */
export function renderQuery(fragment: unknown): {
  params: unknown[];
  sql: string;
} {
  const query = dialect.sqlToQuery(fragment as SQL);
  return { params: query.params, sql: query.sql };
}

/** The SQL text of a fragment, when its parameters don't matter. */
export function renderSql(fragment: unknown): string {
  return renderQuery(fragment).sql;
}

/**
 * The `orderBy` a listing handed to Drizzle (one term or an array), as SQL
 * text. A paginated listing is only correct if the order reaches the query.
 */
export function renderOrderBy(orderBy: unknown): string {
  const terms: unknown[] = Array.isArray(orderBy) ? orderBy : [orderBy];
  return terms.map((term) => renderSql(term)).join(", ");
}
