ALTER TABLE "user" ADD COLUMN "disabledAt" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "mustChangePassword" boolean DEFAULT false NOT NULL;