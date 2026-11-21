"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/_components/atoms/button";
import { reportError } from "@/lib/errors/client";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import { localizePath } from "@/lib/i18n/paths";
import { authClient } from "@/server/better-auth/client";

export interface SignOutButtonProps {
  className?: string;
  /** Where to land afterwards, unlocalized (`/admin/sign-in`). */
  redirectTo: string;
}

/**
 * Ends the session, then a full page load to `redirectTo` in the language
 * being read (docs/agents/nextjs.md § Navigation). A failure keeps the
 * session and says so.
 */
function SignOutButton({ className, redirectTo }: SignOutButtonProps) {
  const { auth } = useDictionary();
  const locale = useLocale();
  const [isSigningOut, setIsSigningOut] = useState(false);
  // Disabled until React owns it: a click on the server's HTML would be lost.
  const hydrated = useHydrated();

  const signOut = async () => {
    setIsSigningOut(true);

    try {
      const { error } = await authClient.signOut();

      if (!error) {
        window.location.assign(localizePath(redirectTo, locale));
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
    <Button
      className={className}
      data-slot="sign-out-button"
      disabled={!hydrated || isSigningOut}
      onClick={() => {
        void signOut();
      }}
      size="sm"
      variant="outline"
    >
      <LogOut aria-hidden="true" />
      {isSigningOut ? auth.signOut.pending : auth.signOut.submit}
    </Button>
  );
}

export { SignOutButton };
