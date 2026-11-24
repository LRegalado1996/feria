-- FER-080: `/contacto` is the store's contact page, a path of the site
-- from now on (`RESERVED_CATEGORY_SLUGS`). A category or a page built from
-- sections made before could hold that address and would be shadowed by
-- the contact page: nobody could reach it. Each such row takes the first
-- `contacto-2`, `contacto-3`... that neither a category nor a page of its
-- store has, since the two share one address space (FER-060), as
-- `firstFreeSlug` names a new one. Only rows are renamed: the build still
-- serving while this runs can still write the address, and the contact
-- page then wins over it until that row is renamed by hand. Running it
-- twice converges (reserve-contact-address-migration.integration.test.ts).
--
-- First, each such store's category lock, the one `lockStoreCategories`
-- takes before a category or a page picks its address: a category being
-- created while this runs has read the addresses already, and could take
-- the very `contacto-2` a page is renamed to here (each table's unique
-- constraint sees only its own rows). With the lock, that write finishes
-- before the rename, or reads the addresses after it.
DO $$
DECLARE
  held record;
BEGIN
  FOR held IN
    SELECT "storeId" FROM "category" WHERE "slug" = 'contacto'
    UNION
    SELECT "storeId" FROM "page" WHERE "slug" = 'contacto'
    ORDER BY "storeId"
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('category:' || held."storeId"));
  END LOOP;
END $$;--> statement-breakpoint
LOCK TABLE "category", "page" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
DO $$
DECLARE
  clash record;
  suffix integer;
BEGIN
  FOR clash IN
    SELECT 'category' AS "kind", "id", "storeId" FROM "category"
    WHERE "slug" = 'contacto'
    UNION ALL
    SELECT 'page' AS "kind", "id", "storeId" FROM "page"
    WHERE "slug" = 'contacto'
    ORDER BY "kind", "id"
  LOOP
    suffix := 2;
    WHILE EXISTS (
      SELECT 1 FROM "category"
      WHERE "storeId" = clash."storeId" AND "slug" = 'contacto-' || suffix
    ) OR EXISTS (
      SELECT 1 FROM "page"
      WHERE "storeId" = clash."storeId" AND "slug" = 'contacto-' || suffix
    ) LOOP
      suffix := suffix + 1;
    END LOOP;

    IF clash."kind" = 'category' THEN
      UPDATE "category"
      SET "slug" = 'contacto-' || suffix, "updatedAt" = now()
      WHERE "id" = clash."id";
    ELSE
      UPDATE "page"
      SET "slug" = 'contacto-' || suffix, "updatedAt" = now()
      WHERE "id" = clash."id";
    END IF;
  END LOOP;
END $$;
