"use client";

import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";

import { Button } from "@/app/_components/atoms/button";
import { Input } from "@/app/_components/atoms/input";
import { useDictionary } from "@/lib/hooks/i18n";
import { cn } from "@/lib/utils";

export type PasswordInputProps = Omit<ComponentProps<"input">, "type">;

/**
 * A password field with a reveal toggle for what is being typed. The toggle
 * is `type="button"`, so it never submits the form, and it stays out of the
 * tab order: keyboard users go label → field → next field.
 */
function PasswordInput({ className, ...props }: PasswordInputProps) {
  const { common } = useDictionary();
  const [revealed, setRevealed] = useState(false);
  const Icon = revealed ? EyeOff : Eye;

  return (
    <div className="relative" data-slot="password-input">
      <Input
        className={cn("pr-10", className)}
        type={revealed ? "text" : "password"}
        {...props}
      />
      <Button
        aria-label={revealed ? common.hidePassword : common.showPassword}
        aria-pressed={revealed}
        className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        data-testid="password-input-toggle"
        onClick={() => {
          setRevealed((current) => !current);
        }}
        size="icon"
        tabIndex={-1}
        type="button"
        variant="ghost"
      >
        <Icon aria-hidden="true" />
      </Button>
    </div>
  );
}

export { PasswordInput };
