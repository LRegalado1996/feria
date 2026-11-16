DROP INDEX "order_item_orderId_index";--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_orderId_productId_unique" UNIQUE("orderId","productId");