-- FER-038: one deployment is one store. This build stops reading the
-- multi-store columns and "store_member", but the build a deploy replaces
-- still reads them while this runs, so nothing it reads is dropped here: the
-- columns only lose NOT NULL (this build inserts without them) and the checks
-- tied to them, and FER-041 drops columns and table once no deployed build
-- reads them (docs/agents/database.md § Migrations). Every statement can run
-- twice and converge (single-store-migration.integration.test.ts).
ALTER TABLE "store" DROP CONSTRAINT IF EXISTS "store_slug_unique";--> statement-breakpoint
ALTER TABLE "store" DROP CONSTRAINT IF EXISTS "store_default_is_active";--> statement-breakpoint
ALTER TABLE "store" DROP CONSTRAINT IF EXISTS "store_slug_format";--> statement-breakpoint
ALTER TABLE "store" DROP CONSTRAINT IF EXISTS "store_slug_not_reserved";--> statement-breakpoint
ALTER TABLE "store" DROP CONSTRAINT IF EXISTS "store_color_background_hex";--> statement-breakpoint
ALTER TABLE "store" DROP CONSTRAINT IF EXISTS "store_color_surface_hex";--> statement-breakpoint
ALTER TABLE "store" DROP CONSTRAINT IF EXISTS "store_color_foreground_hex";--> statement-breakpoint
ALTER TABLE "store" DROP CONSTRAINT IF EXISTS "store_color_contrast_hex";--> statement-breakpoint
ALTER TABLE "store" DROP CONSTRAINT IF EXISTS "store_color_accent_hex";--> statement-breakpoint
DROP INDEX IF EXISTS "store_single_default";--> statement-breakpoint
ALTER TABLE "store" ALTER COLUMN "slug" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "store" ALTER COLUMN "isActive" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "store" ALTER COLUMN "colorBackground" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "store" ALTER COLUMN "colorSurface" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "store" ALTER COLUMN "colorForeground" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "store" ALTER COLUMN "colorContrast" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "store" ALTER COLUMN "colorAccent" DROP NOT NULL;--> statement-breakpoint
-- Keep one store before the rule that allows only one: the default store,
-- else the oldest. The others' texts, catalog, orders and members go with
-- them (every reference to a store cascades).
DELETE FROM "store"
WHERE "id" <> (
  SELECT "id" FROM "store" ORDER BY "isDefault" DESC, "id" ASC LIMIT 1
);--> statement-breakpoint
-- A database with no store gets this one's, in pesos; the admin's settings
-- change it (FER-014).
INSERT INTO "store" ("name", "currencyCode", "updatedAt")
SELECT 'LR Market', 'UYU', now()
WHERE NOT EXISTS (SELECT 1 FROM "store");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "store_single_row" ON "store" USING btree ((true));
