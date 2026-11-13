"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/_components/atoms/avatar";
import { Button } from "@/app/_components/atoms/button";
import { ThemeToggle } from "@/app/_components/molecules/theme-toggle";
import { reportError } from "@/lib/errors/client";
import { cn } from "@/lib/utils";
import { getInitial } from "@/lib/utils/get-initial";
import { authClient } from "@/server/better-auth/client";

const SIGN_OUT_FAILED = "You are still signed in. Try again.";

export interface NavbarProps {
  className?: string;
  user: { name: string; image: string | null };
}

export function Navbar({ className, user }: NavbarProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);

    try {
      const { error } = await authClient.signOut();

      if (!error) {
        // A full page load, as after signing in (docs/agents/nextjs.md).
        window.location.assign("/");
        return;
      }
    } catch (error) {
      // The request never completed; the session is untouched either way.
      reportError(error, { action: "Auth.sign_out" });
    }

    toast.error(SIGN_OUT_FAILED);
    setIsSigningOut(false);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-3",
        className
      )}
      data-slot="navbar"
      data-testid="navbar"
    >
      <h1 className="text-xl font-bold">Feed</h1>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar size="sm">
          {user.image ? <AvatarImage alt={user.name} src={user.image} /> : null}
          <AvatarFallback>{getInitial(user.name)}</AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-medium">{user.name}</span>
        <ThemeToggle />
        <Button
          disabled={isSigningOut}
          onClick={() => {
            void handleSignOut();
          }}
          size="sm"
          variant="outline"
        >
          {isSigningOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </header>
  );
}
