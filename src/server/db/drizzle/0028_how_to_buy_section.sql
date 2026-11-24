ALTER TABLE "page_section" DROP CONSTRAINT "page_section_kind";--> statement-breakpoint
DROP INDEX "page_section_untargeted_once";--> statement-breakpoint
CREATE UNIQUE INDEX "page_section_untargeted_once" ON "page_section" USING btree ("pageId","kind") WHERE "page_section"."kind" IN ('best_sellers', 'featured', 'how_to_buy');--> statement-breakpoint
ALTER TABLE "page_section" ADD CONSTRAINT "page_section_kind" CHECK ("page_section"."kind" IN ('category', 'best_sellers', 'featured', 'banner', 'spotlight', 'how_to_buy'));