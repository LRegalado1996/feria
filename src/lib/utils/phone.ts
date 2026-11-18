/**
 * A phone number as typed, in international format (`+59899123456`), or
 * `null` when it is not one we can reach (FER-025). International numbers
 * start with `+` or `00`; a Uruguayan mobile is also accepted in its local
 * form (`099 123 456`, `99 123 456`). Spaces, dots, dashes and parentheses
 * are ignored. A Uruguayan landline in local form is refused: the store
 * writes to the shopper on WhatsApp.
 */
export function normalizePhone(typed: string): string | null {
  const compact = typed.replaceAll(/[\s.\-()]/gu, "");

  // +598 099 123 456: the country code and the national prefix together.
  // WhatsApp reaches no such number, so the 0 drops as it does below.
  const doubled = /^(?:\+|00)5980(9\d{7})$/u.exec(compact);

  if (doubled) {
    return `+598${doubled[1]}`;
  }

  // Country codes never start with 0.
  if (/^(?:\+|00)[1-9]\d{7,14}$/u.test(compact)) {
    return `+${compact.replace(/^(?:\+|00)/u, "")}`;
  }

  // 09X XXX XXX: the national prefix 0 drops for the country code.
  if (/^09\d{7}$/u.test(compact)) {
    return `+598${compact.slice(1)}`;
  }

  if (/^9\d{7}$/u.test(compact)) {
    return `+598${compact}`;
  }

  if (/^5989\d{7}$/u.test(compact)) {
    return `+${compact}`;
  }

  return null;
}
