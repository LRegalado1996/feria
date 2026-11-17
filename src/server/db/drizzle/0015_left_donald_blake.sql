-- FER-043: a category's slug is its page's address, so the database now
-- refuses one the site already answers (`RESERVED_CATEGORY_SLUGS`). The
-- service has kept new slugs clear of them since FER-043, but a category
-- made before can hold one ("Productos" is `productos`, the page of all
-- articles) and would have no page of its own. Each such category first
-- takes the first free `<slug>-2`, `<slug>-3`... of its store, as
-- `firstFreeSlug` names a new one, so the check can be added. Every
-- statement can run twice and converge
-- (reserved-category-slug-migration.integration.test.ts). The lock keeps
-- the build still serving from writing a category between the renames and
-- the check; it lasts until the migrations commit, over a few rows.
LOCK TABLE "category" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
DO $$
DECLARE
  clash record;
  suffix integer;
BEGIN
  FOR clash IN
    SELECT "id", "storeId", "slug" FROM "category"
    WHERE "slug" IN ('admin', 'api', 'apple-icon', 'brand', 'cart', 'coming-soon', 'design', 'en', 'es', 'icon', 'llms', 'monitoring', 'opengraph-image', 'orders', 'productos', 'robots', 'seed', 'sitemap')
    ORDER BY "id"
  LOOP
    suffix := 2;
    WHILE EXISTS (
      SELECT 1 FROM "category"
      WHERE "storeId" = clash."storeId" AND "slug" = clash."slug" || '-' || suffix
    ) LOOP
      suffix := suffix + 1;
    END LOOP;

    UPDATE "category"
    SET "slug" = clash."slug" || '-' || suffix, "updatedAt" = now()
    WHERE "id" = clash."id";
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "category" DROP CONSTRAINT IF EXISTS "category_slug_not_reserved";--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_slug_not_reserved" CHECK ("category"."slug" NOT IN ('admin', 'api', 'apple-icon', 'brand', 'cart', 'coming-soon', 'design', 'en', 'es', 'icon', 'llms', 'monitoring', 'opengraph-image', 'orders', 'productos', 'robots', 'seed', 'sitemap'));