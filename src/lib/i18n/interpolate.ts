const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Fills the `{name}` placeholders of a dictionary string. Dictionaries hold
 * plain strings, not functions, because they cross from the server to client
 * components. A placeholder with no value is left as written rather than
 * thrown on: copy with a visible gap is a bug to fix, not a page to crash.
 */
export function interpolate(
  template: string,
  values: Record<string, number | string>
): string {
  return template.replaceAll(PLACEHOLDER, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder
  );
}
