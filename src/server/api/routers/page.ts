import {
  createBannerSchema,
  deleteBannerSchema,
  pageRefSchema,
  saveAnnouncementSchema,
  savePageLayoutInputSchema,
  updateBannerSchema,
} from "@/lib/schemas/page";
import { businessDay } from "@/lib/utils/format";
import { adminProcedure } from "@/server/api/orpc";
import { discardBlobs, readBlobStore } from "@/server/api/utils/blob-store";
import {
  writeToAnnouncement,
  writeToPage,
  writeToPages,
} from "@/server/api/utils/write-to-store";
import {
  createBanner,
  deleteBanner,
  getPageCuration,
  saveAnnouncement,
  savePageLayout,
  updateBanner,
} from "@/server/services/page";

/**
 * The store's pages and what they show (FER-020, FER-058), for the admin:
 * a page's editor (its cover and the blocks under it, in order), the photo
 * banners any page may place and the announcement bar every page's frame
 * shows. Every query is on the store `adminProcedure` puts in the context;
 * every write re-checks the caller's login inside its transaction and
 * drops what it changed from the cache: a page's order its page
 * (`writeToPage`), a banner every page (`writeToPages`), the announcement
 * the bar (`writeToAnnouncement`). A banner's dropped photos are deleted
 * once it is saved (FER-011).
 */
export const pageRouter = {
  get: adminProcedure
    .input(pageRefSchema)
    .handler(
      async ({ context, input }) =>
        await getPageCuration(context.db, {
          pageId: input.pageId,
          storeId: context.store.id,
          today: businessDay(new Date()),
        })
    )
    .route({
      method: "GET",
      path: "/admin/pages/{pageId}",
      summary:
        "A page's cover and blocks, with the store's announcement, banners, categories and articles to pick from",
      tags: ["pages"],
    }),

  saveAnnouncement: adminProcedure
    .input(saveAnnouncementSchema)
    .handler(
      async ({ context, input }) =>
        await writeToAnnouncement(
          context,
          async (tx, storeId) =>
            await saveAnnouncement(tx, { storeId, values: input })
        )
    )
    .route({
      method: "PUT",
      path: "/admin/announcement",
      summary: "Replace the announcement bar's text, link, switch and days",
      tags: ["pages"],
    }),

  createBanner: adminProcedure
    .input(createBannerSchema)
    .handler(
      async ({ context, input }) =>
        await writeToPages(
          context,
          async (tx, storeId) =>
            await createBanner(tx, {
              blobStore: readBlobStore(),
              storeId,
              values: input,
            })
        )
    )
    .route({
      method: "POST",
      path: "/admin/banners",
      summary:
        "Add a photo banner to a page's cover or between two of its rows",
      tags: ["pages"],
    }),

  updateBanner: adminProcedure
    .input(updateBannerSchema)
    .handler(async ({ context, input }) => {
      const { discardedImageUrls, ...updated } = await writeToPages(
        context,
        async (tx, storeId) =>
          await updateBanner(tx, {
            blobStore: readBlobStore(),
            storeId,
            values: input,
          })
      );
      // A replaced or removed photo's file goes once it is saved (FER-011).
      discardBlobs(context.db, discardedImageUrls);

      return updated;
    })
    .route({
      method: "PUT",
      path: "/admin/banners/{id}",
      summary:
        "Edit a photo banner: its photos, words, link, switch, days and its place on a page",
      tags: ["pages"],
    }),

  deleteBanner: adminProcedure
    .input(deleteBannerSchema)
    .handler(async ({ context, input }) => {
      const { discardedImageUrls, ...deleted } = await writeToPages(
        context,
        async (tx, storeId) => await deleteBanner(tx, { id: input.id, storeId })
      );
      // Its photos' files go with it (FER-011).
      discardBlobs(context.db, discardedImageUrls);

      return deleted;
    })
    .route({
      method: "DELETE",
      path: "/admin/banners/{id}",
      summary: "Delete a photo banner from every page",
      tags: ["pages"],
    }),

  saveLayout: adminProcedure
    .input(savePageLayoutInputSchema)
    .handler(async ({ context, input }) => {
      const { curatedChanged: _shared, ...saved } = await writeToPage(
        context,
        input.pageId,
        async (tx, storeId) =>
          await savePageLayout(tx, { storeId, values: input })
      );

      return saved;
    })
    .route({
      method: "PUT",
      path: "/admin/pages/{pageId}/layout",
      summary:
        "Save a page's order: its blocks, its cover, the best sellers and the featured articles",
      tags: ["pages"],
    }),
};
