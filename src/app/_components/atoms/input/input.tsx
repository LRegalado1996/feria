"use client";

import { type ComponentProps, useState } from "react";

import { cn } from "@/lib/utils";
import { toPlainNumberText } from "@/lib/utils/format";

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
  /** The parsed number, or `null` once the field is empty. */
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

// An empty field, a leading minus, digits and (for decimals) one dot,
// including the "1." and "-" a user types on the way to a number.
const INTEGER_PATTERN = /^-?\d*$/;
const DECIMAL_PATTERN = /^-?\d*\.?\d*$/;

function formatNumberValue(value: number | null): string {
  return value === null ? "" : String(value);
}

function parseNumberValue(text: string): number | null {
  const parsed = Number(text);
  return text.trim() === "" || !Number.isFinite(parsed) ? null : parsed;
}

function NumberInput({
  allowDecimal = true,
  className,
  onBlur,
  onValueChange,
  value,
  ...props
}: NumberInputProps) {
  // Every "no number" (null, undefined, NaN) is null, so the resync below
  // compares stably: NaN !== NaN would loop.
  const normalized =
    value === null || value === undefined || Number.isNaN(value) ? null : value;
  // The text being typed, so "1." and "-" survive until they are a number.
  const [buffer, setBuffer] = useState(() => formatNumberValue(normalized));
  const [lastValue, setLastValue] = useState(normalized);

  // A new value from outside (a reset, another record) replaces the text,
  // unless the text being typed already reads as that value. Adjusting state
  // during render avoids an effect and its flash of stale text.
  if (normalized !== lastValue) {
    setLastValue(normalized);

    if (parseNumberValue(buffer) !== normalized) {
      setBuffer(formatNumberValue(normalized));
    }
  }

  const pattern = allowDecimal ? DECIMAL_PATTERN : INTEGER_PATTERN;

  return (
    <input
      className={cn(INPUT_CLASS, className)}
      data-slot="input"
      {...props}
      inputMode={allowDecimal ? "decimal" : "numeric"}
      onBlur={(event) => {
        // Dangling text ("1.", "-") settles to the value once focus leaves.
        setBuffer(formatNumberValue(normalized));
        onBlur?.(event);
      }}
      onChange={(event) => {
        // The user types in the app locale's notation ("1,500.5" in en-US).
        const text = toPlainNumberText(event.currentTarget.value);

        if (pattern.test(text)) {
          setBuffer(text);
          onValueChange(parseNumberValue(text));
        }
      }}
      type="text"
      value={buffer}
    />
  );
}

export { Input };
