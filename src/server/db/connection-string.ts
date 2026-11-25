/**
 * The SSL modes node-postgres already treats as `verify-full`. It warns on
 * every connection-string parse that names one of them, because pg 9 will
 * give them libpq's weaker meaning (`require` stops checking the
 * certificate). Neon's URLs carry `sslmode=require`.
 */
const VERIFY_FULL_ALIASES = new Set(["prefer", "require", "verify-ca"]);

/**
 * The connection string with its SSL mode spelled as what the driver does:
 * `verify-full` in place of an alias for it, so the connection keeps checking
 * the server's certificate and host name, and stays that way when pg 9 changes
 * what the aliases mean. Every other mode (`disable`, `no-verify`, none) and a
 * URL that opted into libpq's semantics (`uselibpqcompat=true`) is the
 * caller's explicit choice and is returned as it came.
 */
export function withExplicitSslMode(connectionString: string): string {
  if (!URL.canParse(connectionString)) {
    return connectionString;
  }

  const url = new URL(connectionString);
  const mode = url.searchParams.get("sslmode");

  if (
    mode === null ||
    !VERIFY_FULL_ALIASES.has(mode) ||
    url.searchParams.get("uselibpqcompat") === "true"
  ) {
    return connectionString;
  }

  url.searchParams.set("sslmode", "verify-full");

  return url.toString();
}
