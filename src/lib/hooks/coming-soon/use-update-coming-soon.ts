import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { comingSoonKey } from "./use-coming-soon";

/**
 * Saves the coming-soon page's texts and day (FER-034). The page the server
 * answers becomes the screen's texts at once, so what it shows next is what
 * was stored (a text trimmed, a blank one gone). Its switch is not trusted:
 * a flip from this screen may have landed while the save travelled, after
 * the save read it. The screen keeps the switch it has, then reads the page
 * again, which brings a flip made anywhere else, before the save settles.
 */
export function useUpdateComingSoon() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.comingSoon.update.mutationOptions(),
    // The screen says the failure in a toast, and reports it.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async (saved) => {
      // A read still on its way was answered before the save: landing
      // later, it would put the old texts back on the screen.
      await queryClient.cancelQueries({ queryKey: comingSoonKey() });
      queryClient.setQueryData(comingSoonKey(), (page) =>
        page ? { ...saved, published: page.published } : saved
      );
      await queryClient.invalidateQueries({ queryKey: comingSoonKey() });
    },
  });
}
