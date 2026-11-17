ALTER TABLE "category" ADD COLUMN "parentId" integer;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "coverUrl" text;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "coverWidth" integer;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "coverHeight" integer;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "coverPhoneUrl" text;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "coverPhoneWidth" integer;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "coverPhoneHeight" integer;--> statement-breakpoint
ALTER TABLE "category_translation" ADD COLUMN "seoTitle" text;--> statement-breakpoint
ALTER TABLE "category_translation" ADD COLUMN "seoDescription" text;--> statement-breakpoint
ALTER TABLE "category_translation" ADD COLUMN "coverAlt" text;--> statement-breakpoint
ALTER TABLE "store" ADD COLUMN "catalogCoverUrl" text;--> statement-breakpoint
ALTER TABLE "store" ADD COLUMN "catalogCoverWidth" integer;--> statement-breakpoint
ALTER TABLE "store" ADD COLUMN "catalogCoverHeight" integer;--> statement-breakpoint
ALTER TABLE "store" ADD COLUMN "catalogCoverPhoneUrl" text;--> statement-breakpoint
ALTER TABLE "store" ADD COLUMN "catalogCoverPhoneWidth" integer;--> statement-breakpoint
ALTER TABLE "store" ADD COLUMN "catalogCoverPhoneHeight" integer;--> statement-breakpoint
ALTER TABLE "store_translation" ADD COLUMN "catalogCoverAlt" text;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_store_parent_fk" FOREIGN KEY ("storeId","parentId") REFERENCES "public"."category"("storeId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_storeId_parentId_index" ON "category" USING btree ("storeId","parentId");--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_parent_not_self" CHECK ("category"."parentId" <> "category"."id");--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_cover_complete" CHECK (("category"."coverUrl" IS NULL AND "category"."coverWidth" IS NULL AND "category"."coverHeight" IS NULL) OR ("category"."coverUrl" IS NOT NULL AND "category"."coverWidth" > 0 AND "category"."coverHeight" > 0));--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_cover_phone_complete" CHECK (("category"."coverPhoneUrl" IS NULL AND "category"."coverPhoneWidth" IS NULL AND "category"."coverPhoneHeight" IS NULL) OR ("category"."coverPhoneUrl" IS NOT NULL AND "category"."coverPhoneWidth" > 0 AND "category"."coverPhoneHeight" > 0));--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_cover_phone_needs_cover" CHECK ("category"."coverPhoneUrl" IS NULL OR "category"."coverUrl" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "category_translation" ADD CONSTRAINT "category_translation_texts_length" CHECK (char_length("category_translation"."seoTitle") <= 70 AND char_length("category_translation"."seoDescription") <= 160 AND char_length("category_translation"."coverAlt") <= 200);--> statement-breakpoint
ALTER TABLE "store" ADD CONSTRAINT "store_catalog_cover_complete" CHECK (("store"."catalogCoverUrl" IS NULL AND "store"."catalogCoverWidth" IS NULL AND "store"."catalogCoverHeight" IS NULL) OR ("store"."catalogCoverUrl" IS NOT NULL AND "store"."catalogCoverWidth" > 0 AND "store"."catalogCoverHeight" > 0));--> statement-breakpoint
ALTER TABLE "store" ADD CONSTRAINT "store_catalog_cover_phone_complete" CHECK (("store"."catalogCoverPhoneUrl" IS NULL AND "store"."catalogCoverPhoneWidth" IS NULL AND "store"."catalogCoverPhoneHeight" IS NULL) OR ("store"."catalogCoverPhoneUrl" IS NOT NULL AND "store"."catalogCoverPhoneWidth" > 0 AND "store"."catalogCoverPhoneHeight" > 0));--> statement-breakpoint
ALTER TABLE "store" ADD CONSTRAINT "store_catalog_cover_phone_needs_cover" CHECK ("store"."catalogCoverPhoneUrl" IS NULL OR "store"."catalogCoverUrl" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "store_translation" ADD CONSTRAINT "store_translation_catalog_cover_alt_length" CHECK (char_length("store_translation"."catalogCoverAlt") <= 200);