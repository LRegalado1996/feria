-- FER-058: the home becomes the first page built from sections. Gives every
-- store that has no home yet a page and points the store at it, so there is
-- always exactly one home (0022 then makes `homePageId` required); then
-- copies FER-020's home-only placing into that page: `home_section` into
-- `page_section`, and the banners whose `placement` is the cover, in
-- `coverPosition` order, into `page_cover_banner`. A banner between rows
-- that had no place of its own yet goes after the rest, and the categories
-- with no place of their own go before it, in their own order: FER-020's
-- home showed the saved places, then those categories, then those banners,
-- and the new build shows a banner only where a section places it, so
-- copying the banner alone would put it ahead of those categories.
--
-- Fill only and idempotent (docs/agents/database.md § Migrations): a page
-- is added only for a store with no home, and each copy only into a home
-- page that has none of it yet, so a second run adds nothing. It is for the
-- migrator's one run: a home whose cover or sequence the new build later
-- emptied would be filled again from FER-020's columns, so it is never
-- replayed by hand. Positions are renumbered from 0 in their order. The old table and columns stay for the build that still
-- reads them while this deploys; FER-061 drops them.
WITH "created" AS (
	INSERT INTO "page" ("storeId", "updatedAt")
	SELECT "store"."id", now() FROM "store" WHERE "store"."homePageId" IS NULL
	RETURNING "id", "storeId"
)
UPDATE "store" SET "homePageId" = "created"."id"
FROM "created"
WHERE "store"."id" = "created"."storeId";
--> statement-breakpoint
WITH "unplaced_banner" AS (
	SELECT "banner"."storeId", "banner"."id"
	FROM "banner"
	WHERE "banner"."placement" = 'rows'
		AND NOT EXISTS (
			SELECT 1 FROM "home_section" WHERE "home_section"."bannerId" = "banner"."id"
		)
), "placed" AS (
	SELECT "home_section"."storeId", 0 AS "grp", "home_section"."position"::bigint AS "ord",
		"home_section"."kind"::text AS "kind", "home_section"."categoryId", "home_section"."bannerId"
	FROM "home_section"
	WHERE "home_section"."kind" <> 'banner'
		OR EXISTS (
			SELECT 1 FROM "banner"
			WHERE "banner"."id" = "home_section"."bannerId" AND "banner"."placement" = 'rows'
		)
	UNION ALL
	SELECT "category"."storeId", 1,
		row_number() OVER (PARTITION BY "category"."storeId" ORDER BY "category"."position", "category"."id"),
		'category', "category"."id", NULL
	FROM "category"
	WHERE EXISTS (
			SELECT 1 FROM "unplaced_banner" WHERE "unplaced_banner"."storeId" = "category"."storeId"
		)
		AND NOT EXISTS (
			SELECT 1 FROM "home_section" WHERE "home_section"."categoryId" = "category"."id"
		)
	UNION ALL
	SELECT "unplaced_banner"."storeId", 2, "unplaced_banner"."id"::bigint, 'banner', NULL, "unplaced_banner"."id"
	FROM "unplaced_banner"
)
INSERT INTO "page_section" ("storeId", "pageId", "position", "kind", "categoryId", "bannerId", "updatedAt")
SELECT "placed"."storeId", "store"."homePageId",
	(row_number() OVER (PARTITION BY "store"."homePageId" ORDER BY "placed"."grp", "placed"."ord") - 1)::integer,
	"placed"."kind", "placed"."categoryId", "placed"."bannerId", now()
FROM "placed"
JOIN "store" ON "store"."id" = "placed"."storeId"
WHERE NOT EXISTS (
	SELECT 1 FROM "page_section" WHERE "page_section"."pageId" = "store"."homePageId"
);
--> statement-breakpoint
INSERT INTO "page_cover_banner" ("pageId", "bannerId", "position", "updatedAt")
SELECT "store"."homePageId", "banner"."id",
	(row_number() OVER (PARTITION BY "store"."homePageId" ORDER BY "banner"."coverPosition", "banner"."id") - 1)::integer,
	now()
FROM "banner"
JOIN "store" ON "store"."id" = "banner"."storeId"
WHERE "banner"."placement" = 'cover'
	AND NOT EXISTS (
		SELECT 1 FROM "page_cover_banner" WHERE "page_cover_banner"."pageId" = "store"."homePageId"
	);
