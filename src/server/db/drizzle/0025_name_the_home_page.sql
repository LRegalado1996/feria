-- FER-060: every page is an ordinary page, the home included. Gives each
-- page that has no address yet (the home page 0021 created) the first of
-- `home`, `home-<id>`, `home-<id>-2`, ... that no category or page of its
-- store holds (pages and categories share `/<slug>`); publishes each
-- store's home page, which `/` already shows; and names a page with no
-- words "Home" in Spanish and English, as Lucas calls it in every language
-- (2026-11-19).
--
-- Fill only and idempotent (docs/agents/database.md § Migrations): an
-- address only where none is set, a translation only where none exists,
-- so a second run, or a page the admin already named, is left alone. 0026
-- then makes the address required.
UPDATE "page" SET "slug" = (
	SELECT "free"."slug"
	FROM (
		SELECT 0 AS "n", 'home' AS "slug"
		UNION ALL
		SELECT "n", 'home-' || "page"."id" || CASE WHEN "n" = 1 THEN '' ELSE '-' || "n" END
		FROM generate_series(1, 100) AS "n"
	) AS "free"
	WHERE NOT EXISTS (
		SELECT 1 FROM "category"
		WHERE "category"."storeId" = "page"."storeId" AND "category"."slug" = "free"."slug"
	) AND NOT EXISTS (
		SELECT 1 FROM "page" AS "other"
		WHERE "other"."storeId" = "page"."storeId" AND "other"."slug" = "free"."slug"
	)
	ORDER BY "free"."n"
	LIMIT 1
)
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
