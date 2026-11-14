import { ORPCError } from "@orpc/client";

import { type AppErrorData, causeChain } from "@/lib/errors";

/**
 * Postgres SQLSTATEs the user can correct, and what to tell them. Deliberately
 * small: any other code is a bug or an outage and stays a reported 500.
 * https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const TRANSLATIONS: Record<
  string,
  { code: "BAD_REQUEST" | "CONFLICT"; fix: string; message: string }
> = {
  // unique_violation
  "23505": {
    code: "CONFLICT",
    message: "A record with these values already exists.",
    fix: "Use a different value for the field that must be unique.",
  },
  // restrict_violation: how Postgres 18 reports a blocked ON DELETE RESTRICT,
  // where 17 raised 23503.
  "23001": {
    code: "CONFLICT",
    message: "It cannot be deleted while other records use it.",
    fix: "Remove or reassign the records that use it, then try again.",
  },
  // foreign_key_violation
  "23503": {
    code: "BAD_REQUEST",
    message: "It refers to a record that no longer exists.",
    fix: "Refresh the page and pick a record that exists.",
  },
  // check_violation
  "23514": {
    code: "BAD_REQUEST",
    message: "The data breaks one of the rules for this record.",
    fix: "Check the values you entered.",
  },
  // not_null_violation
  "23502": {
    code: "BAD_REQUEST",
    message: "A required field is missing.",
    fix: "Fill in every required field.",
  },
  // numeric_value_out_of_range
  "22003": {
    code: "BAD_REQUEST",
    message: "A number is larger than the field allows.",
    fix: "Check the amounts and quantities you entered.",
  },
};

/**
 * The typed business error for a constraint violation anywhere in the cause
 * chain (Drizzle wraps the driver's error), plus the constraint's name for the
 * log. `undefined` for anything else. The message is curated: Postgres' own
 * detail echoes row values.
 */
export function translatePostgresError(
  error: unknown,
  scope: Pick<AppErrorData, "procedure" | "requestId">
):
  | { constraint: string | undefined; error: ORPCError<string, AppErrorData> }
  | undefined {
  for (const link of causeChain(error)) {
    const translation =
      "code" in link && typeof link.code === "string"
        ? TRANSLATIONS[link.code]
        : undefined;
    if (translation) {
      return {
        constraint:
          "constraint" in link && typeof link.constraint === "string"
            ? link.constraint
            : undefined,
        error: new ORPCError(translation.code, {
          message: translation.message,
          data: { fix: translation.fix, ...scope },
        }),
      };
    }
  }
  return undefined;
}

const UNIQUE_VIOLATION = "23505";

/**
 * Whether `error` is the unique violation of `constraint`, anywhere in its
 * cause chain. For a service that owes the user a better answer than the
 * generic CONFLICT above: which value is taken, and what to do about it.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  return causeChain(error).some(
    (link) =>
      "code" in link &&
      link.code === UNIQUE_VIOLATION &&
      "constraint" in link &&
      link.constraint === constraint
  );
}
