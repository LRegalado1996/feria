import { DrizzleQueryError } from "drizzle-orm";

/** A credential no real session holds, so finding it anywhere is the leak. */
export const SYNTHETIC_SESSION_TOKEN = "synthetic-session-token-6f1d2c";

export const SESSION_QUERY =
  'select "id", "token", "userId" from "session" where "session"."token" = $1';

/**
 * The error a session lookup raises when the database drops: Drizzle's real
 * class, whose message, stack and `params` carry the bound token, wrapping a
 * driver error the way node-postgres reports one (with a constraint-style
 * `detail` that echoes the token too).
 */
export function makeSessionQueryError(
  params: unknown[] = [SYNTHETIC_SESSION_TOKEN]
): DrizzleQueryError {
  const driverError = Object.assign(
    new Error("Connection terminated unexpectedly"),
    { code: "57P01", detail: `Key (token)=(${SYNTHETIC_SESSION_TOKEN})` }
  );
  return new DrizzleQueryError(SESSION_QUERY, params, driverError);
}
