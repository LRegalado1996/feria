/**
 * The one definition of "sensitive" for everything that leaves the process as
 * a log line. Every log egress (console writers, log drains, an error
 * tracker's `beforeSend`, Better Auth's logger) goes through
 * {@linkcode sanitizeForLog}: they see different payload shapes but must agree
 * on what is withheld, and a second copy would drift silently.
 */

/**
 * Keys whose value is withheld: credentials, matched anywhere in the key and
 * case-insensitively, and a query's bound values, matched as the whole key (or
 * the last segment of a flattened one such as `error.params`).
 *
 * `params` is there because `DrizzleQueryError` keeps the bound values of a
 * failed query as an own `params` array. The values are positional, so nothing
 * can tell a session token from a row id: all of them are withheld.
 */
const SENSITIVE_KEY_REGEX =
  /password|secret|token|apikey|authorization|cookie|(?:^|\.)params$/i;

export const REDACTED = "[REDACTED]";

/**
 * The bound values Drizzle writes into a failed query's message, which is
 * `Failed query: <sql>\nparams: <values>`. Withheld from the label to the end
 * of the text: a value is free text and can contain anything, a newline and a
 * line that looks like a stack frame included, so nothing after the label can
 * mark where the values stop. {@linkcode scrubStack} keeps a stack's frames by
 * the message's length instead.
 *
 * Key-based redaction never sees these: they live inside strings, under keys
 * (`message`, `stack`) that are not sensitive. That is how a failed session
 * lookup prints the session token it was looking for.
 */
const QUERY_PARAMS_TEXT_REGEX = /\bparams: [\s\S]*/;

/**
 * The row values Postgres echoes in a constraint violation's detail
 * (`Key (token)=(…) already exists.`, `Failing row contains (…).`). Withheld
 * to the end of the text for the same reason: a value can itself contain
 * `) already exists.` or a newline. The column names stay; they say which
 * constraint failed.
 */
const CONSTRAINT_KEY_TEXT_REGEX = /\b(key \(.*?\)=)\([\s\S]*/i;
const FAILING_ROW_TEXT_REGEX = /\bFailing row contains [\s\S]*/;

function scrubSensitiveText(text: string): string {
  return text
    .replace(QUERY_PARAMS_TEXT_REGEX, `params: ${REDACTED}`)
    .replace(CONSTRAINT_KEY_TEXT_REGEX, `$1(${REDACTED})`)
    .replace(FAILING_ROW_TEXT_REGEX, `Failing row contains (${REDACTED})`);
}

/**
 * A stack is `<name>: <message>` followed by the frames the engine generated.
 * Only the message can carry a value, and its exact text is known, so the
 * stack is split at the message's end: the message part is scrubbed on its own
 * and the frames survive. The frames are scrubbed too, so a stack whose header
 * no longer matches its message (a library rewrote `message` after
 * construction) withholds what follows instead of shipping it.
 */
function scrubStack(stack: string, message: unknown): string {
  const start =
    typeof message === "string" && message ? stack.indexOf(message) : -1;
  if (
    typeof message !== "string" ||
    start < 0 ||
    stack.slice(0, start).includes("\n")
  ) {
    return scrubSensitiveText(stack);
  }
  const end = start + message.length;
  return (
    scrubSensitiveText(stack.slice(0, end)) +
    scrubSensitiveText(stack.slice(end))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A condition of Better Auth's adapter `where` clause, `{ field, value }`,
 * which it logs when a query fails. The value is the bound parameter (a
 * session lookup's is the token), so it is withheld like Drizzle's.
 */
function isQueryCondition(record: Record<string, unknown>): boolean {
  return typeof record.field === "string" && "value" in record;
}

/**
 * The stand-in for a value that threw while being read (a getter, a proxy).
 * It cannot be shown to be safe, so it is withheld instead of failing the log
 * line. It names the thrown value's type, never its message, which may be the
 * very value being withheld.
 */
function unreadable(error: unknown): string {
  const kind = error instanceof Error ? error.name : typeof error;
  return `${REDACTED} (unreadable: ${kind})`;
}

function sanitizeRecord(
  record: Record<string, unknown>,
  ancestors: WeakSet<object>
): Record<string, unknown> {
  const withholdValue = isQueryCondition(record);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (SENSITIVE_KEY_REGEX.test(key) || (withholdValue && key === "value")) {
      out[key] = REDACTED;
      continue;
    }
    // One key at a time: a throwing getter costs its own field, not the line.
    try {
      const raw = record[key];
      out[key] =
        key === "stack" && typeof raw === "string"
          ? scrubStack(raw, record.message)
          : sanitizeValue(raw, ancestors);
    } catch (error) {
      out[key] = unreadable(error);
    }
  }
  return out;
}

/**
 * An error reduced to the fields that diagnose it. Allowlisted rather than
 * scrubbed: the rest of an error's own properties are where drivers put the
 * data a query ran with (`params`, `query`, Postgres' `detail`), and a new
 * driver field stays out until somebody decides it is safe.
 */
function summarizeError(
  error: Error,
  ancestors: WeakSet<object>
): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    name: error.name,
    message: scrubSensitiveText(error.message),
  };
  if (typeof error.stack === "string") {
    summary.stack = scrubStack(error.stack, error.message);
  }
  if ("code" in error) {
    const code: unknown = error.code;
    if (typeof code === "string" || typeof code === "number") {
      summary.code = code;
    }
  }
  if (error.cause !== undefined) {
    summary.cause = sanitizeValue(error.cause, ancestors);
  }
  return summary;
}

function sanitizeValue(value: unknown, ancestors: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return scrubSensitiveText(value);
  }
  if (value === null || typeof value !== "object" || value instanceof Date) {
    return value;
  }
  if (ancestors.has(value)) {
    return "[Circular]";
  }
  ancestors.add(value);
  try {
    if (value instanceof Error) {
      return summarizeError(value, ancestors);
    }
    if (Array.isArray(value)) {
      return value.map((item: unknown) => sanitizeValue(item, ancestors));
    }
    return isRecord(value) ? sanitizeRecord(value, ancestors) : REDACTED;
  } catch (error) {
    return unreadable(error);
  } finally {
    ancestors.delete(value);
  }
}

/**
 * A copy of `value` that is safe to hand to any log transport: sensitive keys
 * redacted, query values withheld wherever they appear (under a `params` key,
 * in a Better Auth `where` condition, or in the text of a message or stack),
 * and every `Error`, each nested `cause` included, reduced to name, message,
 * stack, code and cause.
 *
 * Never throws and never mutates its input, so it can sit on a logger's emit
 * path, where a failure would lose the line or let a caller's catch-all print
 * the raw value instead.
 */
export function sanitizeForLog(value: unknown): unknown {
  return sanitizeValue(value, new WeakSet());
}

/**
 * {@linkcode sanitizeForLog} written back into `record`, for a transport whose
 * hook hands over its own private copy to mutate (evlog's `redact.transform`).
 */
export function sanitizeRecordInPlace(record: Record<string, unknown>): void {
  const clean = sanitizeForLog(record);
  if (isRecord(clean)) {
    Object.assign(record, clean);
  }
}
