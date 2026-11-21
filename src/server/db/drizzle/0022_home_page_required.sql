ALTER TABLE "store" ALTER COLUMN "homePageId" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "store_homePageId_index" ON "store" USING btree ("homePageId");