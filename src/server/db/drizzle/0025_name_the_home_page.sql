-- FER-060: every page is an ordinary page, the home included. Gives each
-- page that has no address yet (the home page 0021 created) one, `home`
-- unless the store already has a category or page there, else
-- `home-<id>`; publishes each store's home page, which `/` already shows;
-- and names a page with no words "Home" in Spanish and English, as Lucas
-- calls it in every language (2026-11-19).
--
-- Fill only and idempotent (docs/agents/database.md § Migrations): an
-- address only where none is set, a translation only where none exists,
-- so a second run, or a page the admin already named, is left alone. 0026
-- then makes the address required.
UPDATE "page" SET "slug" = CASE
	WHEN EXISTS (
		SELECT 1 FROM "category"
		WHERE "category"."storeId" = "page"."storeId" AND "category"."slug" = 'home'
	) OR EXISTS (
		SELECT 1 FROM "page" AS "other"
		WHERE "other"."storeId" = "page"."storeId" AND "other"."slug" = 'home'
	) THEN 'home-' || "page"."id"
	ELSE 'home'
END
WHERE "page"."slug" IS NULL;
--> statement-breakpoint
UPDATE "page" SET "isPublished" = true
FROM "store"
WHERE "store"."homePageId" = "page"."id" AND "page"."isPublished" = false;
--> statement-breakpoint
INSERT INTO "page_translation" ("pageId", "locale", "name", "updatedAt")
SELECT "page"."id", "locale"."value", 'Home', now()
FROM "page"
CROSS JOIN (VALUES ('es'::"locale"), ('en'::"locale")) AS "locale"("value")
WHERE NOT EXISTS (
	SELECT 1 FROM "page_translation" WHERE "page_translation"."pageId" = "page"."id"
);
