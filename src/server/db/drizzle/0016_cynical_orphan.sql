-- FER-044: the store's own order of its articles, the catalog's default.
-- Expand only: the build this deploy replaces never names the column, so
-- its inserts take the default, the next number of the sequence, and it
-- reads nothing new. The articles already there are numbered in the order
-- they were created, per store, after any that already have a place, and
-- the sequence starts after the last, so a new article goes last. Every
-- statement can run twice and converge
-- (product-position-migration.integration.test.ts).
CREATE SEQUENCE IF NOT EXISTS "public"."product_position_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "position" integer;--> statement-breakpoint
-- Fill only: a place already set is kept, and the unset ones follow it.
UPDATE "product" SET "position" = "numbered"."position"
FROM (
  SELECT
    "unset"."id",
    (
      coalesce(
        (
          SELECT max("placed"."position")
          FROM "product" AS "placed"
          WHERE "placed"."storeId" = "unset"."storeId"
        ),
        0
      ) + row_number() OVER (
        PARTITION BY "unset"."storeId"
        ORDER BY "unset"."createdAt", "unset"."id"
      )
    )::integer AS "position"
  FROM "product" AS "unset"
  WHERE "unset"."position" IS NULL
) AS "numbered"
WHERE "product"."id" = "numbered"."id" AND "product"."position" IS NULL;--> statement-breakpoint
SELECT setval(
  'product_position_seq',
  coalesce((SELECT max("position") FROM "product"), 0) + 1,
  false
);--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "position" SET DEFAULT nextval('product_position_seq');--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "position" SET NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_position_list_index" ON "product" USING btree ("storeId","status","position","id");
