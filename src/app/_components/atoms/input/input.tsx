"use client";

import { type ComponentProps, useId, useState } from "react";

import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import {
  fromPlainNumberText,
  readTypedNumber,
  type TypedNumber,
} from "@/lib/utils/format";

const INPUT_CLASS = [
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
];

// Every native type except "number", as a closed union: React's own type
// includes `string & {}`, which would keep "number" assignable and let a
// numeric field slip through with the text props.
type TextInputType =
  | "date"
  | "datetime-local"
  | "email"
  | "file"
  | "hidden"
  | "month"
  | "password"
  | "search"
  | "tel"
  | "text"
  | "time"
  | "url"
  | "week";

export type TextInputProps = Omit<ComponentProps<"input">, "type"> & {
  type?: TextInputType;
};

export interface NumberInputProps extends Omit<
  ComponentProps<"input">,
  "defaultValue" | "inputMode" | "onChange" | "type" | "value"
> {
  /** Permit a decimal part. Off for counts and years. */
  allowDecimal?: boolean;
  /**
   * The parsed number, or `null` once the field is empty or holds a figure it
   * refuses. The parent keeps `null` when it is reported: clearing the field
   * is how a value is removed, and a refused figure stays on screen only
   * while the value it stands for is `null`.
   */
  onValueChange: (value: number | null) => void;
  type: "number";
  value: number | null | undefined;
}

export type InputProps = NumberInputProps | TextInputProps;

/**
 * A text field, or with `type="number"` a numeric one that holds
 * `number | null`: it can be cleared and retyped freely, and never turns an
 * empty field into 0 (`Number("") === 0`).
 */
function Input(props: InputProps) {
  if (props.type === "number") {
    return <NumberInput {...props} />;
  }

  const { className, ...rest } = props;

  return (
    <input className={cn(INPUT_CLASS, className)} data-slot="input" {...rest} />
  );
}

// What a number field lets through: a minus (or the minus sign U+2212) after
// any spaces, then digits, either separator and spaces. Anything else (a
// letter, a currency sign) is dropped as it is typed; what is let through is
// read, and refused with its reason, by `readTypedNumber`.
const NUMBER_TEXT_PATTERN =
  /^[\s\u00A0\u202F]*[-\u2212]?[\d.,\s\u00A0\u202F]*$/u;

/** The field's text for a value, in the page language's notation. */
function formatNumberValue(value: number | null, locale: Locale): string {
  return value === null ? "" : fromPlainNumberText(String(value), locale);
}

/** The value a field's text stands for: a number, or `null` for none. */
function valueOf(reading: TypedNumber): number | null {
  return reading.kind === "number" ? reading.value : null;
}

function NumberInput({
  allowDecimal = true,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  className,
  onBlur,
  onValueChange,
  value,
  ...props
}: NumberInputProps) {
  const locale = useLocale();
  const dictionary = useDictionary();
  const messageId = useId();
  // Every "no number" (null, undefined, NaN) is null, so the resync below
  // compares stably: NaN !== NaN would loop.
  const normalized =
    value === null || value === undefined || Number.isNaN(value) ? null : value;
  // The text exactly as typed or pasted, so "12," and "-" survive until they
  // are a number and a refused figure stays on screen to be corrected.
  const [buffer, setBuffer] = useState(() =>
    formatNumberValue(normalized, locale)
  );
  const [lastValue, setLastValue] = useState(normalized);
  // A refusal shows once focus leaves and until the next keystroke:
  // "1.234.5" on its way to "1.234.567" is not a mistake yet.
  const [left, setLeft] = useState(false);
  const reading = readTypedNumber(buffer, { allowDecimal });

  // A new value from outside (a reset, another record) replaces the text,
  // unless the text being typed already stands for that value (a refused
  // figure stands for none). Adjusting state during render avoids an effect
  // and its flash of stale text.
  if (normalized !== lastValue) {
    setLastValue(normalized);

    if (valueOf(reading) !== normalized) {
      setBuffer(formatNumberValue(normalized, locale));
      setLeft(false);
    }
  }

  const refusal = left && reading.kind === "refused" ? reading.reason : null;

  return (
    <>
      <input
        className={cn(INPUT_CLASS, className)}
        data-slot="input"
        {...props}
        aria-describedby={
          refusal === null
            ? describedBy
            : [describedBy, messageId].filter(Boolean).join(" ")
        }
        aria-invalid={refusal === null ? ariaInvalid : true}
        inputMode={allowDecimal ? "decimal" : "numeric"}
        onBlur={(event) => {
          // A figure that reads settles to the value the field holds, in the
          // page language's notation, so the person sees how it was read
          // ("1.500" becomes "1500") or that the form kept another value.
          if (reading.kind !== "refused") {
            setBuffer(formatNumberValue(normalized, locale));
          }
          setLeft(true);
          onBlur?.(event);
        }}
        onChange={(event) => {
          const text = event.currentTarget.value;

          if (NUMBER_TEXT_PATTERN.test(text)) {
            setBuffer(text);
            setLeft(false);
            onValueChange(valueOf(readTypedNumber(text, { allowDecimal })));
          }
        }}
        type="text"
        value={buffer}
      />
      {refusal === null ? null : (
        <p
          className="text-sm text-destructive"
          data-slot="input-refusal"
          id={messageId}
          role="alert"
        >
          {dictionary.common.numberInput[refusal]}
        </p>
      )}
    </>
  );
}

export { Input };
