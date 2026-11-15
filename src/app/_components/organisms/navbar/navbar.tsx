"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/_components/atoms/avatar";
import { Button } from "@/app/_components/atoms/button";
import { StoreLogo } from "@/app/_components/atoms/store-logo";
import { LocaleToggle } from "@/app/_components/molecules/locale-toggle";
import { ThemeToggle } from "@/app/_components/molecules/theme-toggle";
import { reportError } from "@/lib/errors/client";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import { getInitial } from "@/lib/utils/get-initial";
import { authClient } from "@/server/better-auth/client";

export interface NavbarProps {
  className?: string;
  user: { name: string; image: string | null };
}

export function Navbar({ className, user }: NavbarProps) {
  const { auth, post } = useDictionary();
  const locale = useLocale();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);

    try {
      const { error } = await authClient.signOut();

      if (!error) {
        // A full page load, as after signing in (docs/agents/nextjs.md), to
        // the sign-in page of the language the visitor was reading.
        window.location.assign(localizePath("/", locale));
        return;
      }
    } catch (error) {
      // The request never completed; the session is untouched either way.
      reportError(error, { action: "Auth.sign_out" });
    }

    toast.error(auth.signOut.failed);
    setIsSigningOut(false);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background px-4 py-3",
        className
      )}
      data-slot="navbar"
      data-testid="navbar"
    >
      <div className="flex items-center gap-3">
        {/* A phone's navbar has no room left: the sign-out button would be cut off. */}
        <StoreLogo className="hidden h-9 sm:block" variant="mark" />
        <h1 className="text-xl font-bold">{post.feed.title}</h1>
      </div>
      <div className="flex min-w-0 items-center gap-1 sm:gap-3">
        <Avatar size="sm">
          {user.image ? <AvatarImage alt={user.name} src={user.image} /> : null}
          <AvatarFallback>{getInitial(user.name)}</AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-medium">{user.name}</span>
        <LocaleToggle />
        <ThemeToggle />
        <Button
          disabled={isSigningOut}
          onClick={() => {
            void handleSignOut();
          }}
          size="sm"
          variant="outline"
        >
          {isSigningOut ? auth.signOut.pending : auth.signOut.submit}
        </Button>
      </div>
    </header>
  );
}
