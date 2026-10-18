ALTER TABLE "orders" ADD COLUMN "admin_notes" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "reference" text;--> statement-breakpoint
CREATE INDEX "idx_webhook_events_reference" ON "webhook_events" USING btree ("provider","reference");