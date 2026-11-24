import { describe, expect, test } from "vitest";

import { formatLocalPhone, normalizePhone } from "./phone";

describe("formatLocalPhone (FER-078)", () => {
  test.each([
    // A Uruguayan mobile, as people here write it.
    ["+59899123456", "099 123 456"],
    ["+59891000000", "091 000 000"],
    // Anything else keeps its country code: it is what makes it dialable.
    ["+5491112345678", "+5491112345678"],
    ["+12345678", "+12345678"],
    // A Uruguayan landline is not a mobile, nor is a mobile a digit short
    // or long.
    ["+59821234567", "+59821234567"],
    ["+5989912345", "+5989912345"],
    ["+598991234567", "+598991234567"],
  ])("shows %j as %j", (stored, shown) => {
    expect(formatLocalPhone(stored)).toBe(shown);
  });
});

describe("normalizePhone", () => {
  test.each([
    // International, with `+` or `00`: 8 to 15 digits.
    ["+12345678", "+12345678"],
    ["+123456789012345", "+123456789012345"],
    ["0012345678", "+12345678"],
    ["00123456789012345", "+123456789012345"],
    ["+59899123456", "+59899123456"],
    ["0059899123456", "+59899123456"],
    ["+598 099 123 456", "+59899123456"],
    ["00598 099 123 456", "+59899123456"],
    // A Uruguayan mobile in its local forms.
    ["099123456", "+59899123456"],
    ["99123456", "+59899123456"],
    ["59899123456", "+59899123456"],
    // Separators are ignored.
    ["099 123 456", "+59899123456"],
    ["(099) 123-456", "+59899123456"],
    ["+598 99.123.456", "+59899123456"],
    ["  99 123 456  ", "+59899123456"],
  ])("reads %j as %j", (typed, phone) => {
    expect(normalizePhone(typed)).toBe(phone);
  });

  test.each([
    ["+ with 7 digits", "+1234567"],
    ["+ with 16 digits", "+1234567890123456"],
    ["00 with 7 digits", "001234567"],
    ["00 with 16 digits", "001234567890123456"],
    ["+ with country code 0", "+099123456"],
    ["00 with country code 0", "00099123456"],
    ["a local mobile one digit short", "09912345"],
    ["a local mobile one digit long", "0991234567"],
    ["a bare mobile one digit short", "9912345"],
    ["a bare mobile one digit long", "991234567"],
    ["598 and a mobile one digit short", "5989912345"],
    ["598 and a landline", "59824001234"],
    ["a local landline", "24001234"],
    ["a local landline with 0", "024001234"],
    ["letters", "099 ABC 456"],
    ["a + in the middle", "099+123456"],
    ["nothing", ""],
  ])("refuses %s", (_case, typed) => {
    expect(normalizePhone(typed)).toBeNull();
  });
});
