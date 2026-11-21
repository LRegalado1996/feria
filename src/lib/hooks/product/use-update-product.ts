import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { StoreProduct } from "@/lib/catalog/product-form";
import { resolvePublishGaps } from "@/lib/catalog/publish-gaps";
import { orpc } from "@/lib/orpc/client";
import type { UpdateProductValues } from "@/lib/schemas/catalog";

import { productKey } from "./use-product";
import { productsKey } from "./use-products";

/** The article as it reads once `values` are saved, before the server says. */
function applied(
  current: StoreProduct,
  values: Omit<UpdateProductValues, "id">
): StoreProduct {
  return {
    ...current,
    attributeValueIds: values.attributeValueIds,
    categoryId: values.categoryId,
    // A photo it held keeps its id; a new one has none until it is read.
    images: values.images.map((image, index) => ({
      ...image,
      id:
        current.images.find((held) => held.url === image.url)?.id ??
        -(index + 1),
    })),
    isAvailable: values.isAvailable,
    priceAmount: values.priceAmount,
    publishGaps: resolvePublishGaps({
      categoryId: values.categoryId,
      imageCount: values.images.length,
      priceAmount: values.priceAmount,
      translations: values.translations,
    }),
    translations: values.translations,
  };
}

/**
 * Saves a whole article (FER-017): on screen at once, in the article's
 * cached read, then on the server, whose answer (its slug, its change time,
 * what publishing still needs) replaces the guess; a failed save puts the
 * read back as it was. The list is read again once saved.
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.product.update.mutationOptions(),
    // Its caller says and reports a failure itself, once.
    meta: { suppressGlobalErrorReport: true },
    onMutate: async (values) => {
      // The schema coerces the id (the REST twin reads it from the path), so
      // its input type is `unknown`; the wizard always sends a number.
      const queryKey = productKey(Number(values.id));
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<StoreProduct>(queryKey);

      queryClient.setQueryData<StoreProduct>(queryKey, (current) =>
        current ? applied(current, values) : current
      );

      return { previous };
    },
    onError: (_error, values, context) => {
      queryClient.setQueryData(
        productKey(Number(values.id)),
        context?.previous
      );
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData<StoreProduct>(productKey(saved.id), (current) =>
        current
          ? {
              ...current,
              publishGaps: saved.publishGaps,
              slug: saved.slug,
              status: saved.status,
              updatedAt: saved.updatedAt,
            }
          : current
      );
      await queryClient.invalidateQueries({ queryKey: productsKey() });
    },
  });
}
