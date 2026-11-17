-- FER-043: a category's slug is its page's address, and since FER-043 the
-- service never gives a new one a path the site already answers
-- (`RESERVED_CATEGORY_SLUGS`). A category made before can hold one
-- ("Productos" is `productos`, the page of all articles) and would have no
-- page of its own. Each such category takes the first free `<slug>-2`,
-- `<slug>-3`... of its store, as `firstFreeSlug` names a new one. Only
-- rows are renamed: the build still serving while this runs can still
-- write such a slug, so the database refuses one only in a later release
-- (FER-048), which renames again first. Running it twice converges
-- (reserved-category-slug-migration.integration.test.ts).
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
END $$;
