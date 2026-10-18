CREATE TYPE "public"."media_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."lesson_kind" AS ENUM('video', 'article');--> statement-breakpoint
CREATE TYPE "public"."promo_scope" AS ENUM('all', 'products');--> statement-breakpoint
CREATE TYPE "public"."access_scope" AS ENUM('all', 'items');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('course', 'bundle', 'single');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'expired', 'refunded', 'partially_refunded', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."entitlement_source" AS ENUM('purchase', 'migration', 'admin_grant', 'gift');--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'bunny' NOT NULL,
	"library_id" text NOT NULL,
	"video_id" text NOT NULL,
	"title" text,
	"duration_seconds" integer,
	"status" "media_status" DEFAULT 'uploading' NOT NULL,
	"thumbnail_url" text,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_library_id_video_id_unique" UNIQUE("library_id","video_id")
);
--> statement-breakpoint
CREATE TABLE "product_items" (
	"product_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_items_product_id_lesson_id_pk" PRIMARY KEY("product_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" "product_kind" NOT NULL,
	"access_scope" "access_scope" DEFAULT 'items' NOT NULL,
	"title" text NOT NULL,
	"tagline" text,
	"description_md" text,
	"description_html" text,
	"cover_image_url" text,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'gbp' NOT NULL,
	"sale_price" integer,
	"sale_starts_at" timestamp with time zone,
	"sale_ends_at" timestamp with time zone,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"stripe_product_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_stripe_product_id_unique" UNIQUE("stripe_product_id")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_title" text NOT NULL,
	"list_price" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"refunded_amount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"currency" text DEFAULT 'gbp' NOT NULL,
	"subtotal" integer NOT NULL,
	"discount_total" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"promo_code_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "orders_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id")
);
--> statement-breakpoint
CREATE TABLE "promo_code_products" (
	"promo_code_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "promo_code_products_promo_code_id_product_id_pk" PRIMARY KEY("promo_code_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "promo_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"discount_total" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_redemptions_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"order_item_id" uuid,
	"source" "entitlement_source" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"granted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "webhook_events_provider_event_id_unique" UNIQUE("provider","event_id")
);
--> statement-breakpoint
ALTER TABLE "lessons" ALTER COLUMN "module_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "media_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "kind" "lesson_kind" DEFAULT 'video' NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "content_md" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "content_html" text;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "is_course_content" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "confirm_token_hash" text;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "applies_to" "promo_scope" DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "max_redemptions" integer;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "max_redemptions_per_user" integer;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "min_subtotal" integer;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "stackable_with_sale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_items" ADD CONSTRAINT "product_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_items" ADD CONSTRAINT "product_items_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_products" ADD CONSTRAINT "promo_code_products_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_products" ADD CONSTRAINT "promo_code_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_granted_by_profiles_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_two_factors_secret" ON "two_factors" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "idx_two_factors_user" ON "two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_product_items_lesson" ON "product_items" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "idx_products_published" ON "products" USING btree ("is_published","sort_order");--> statement-breakpoint
CREATE INDEX "idx_products_kind" ON "products" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_order_items_order" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_orders_user" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "idx_orders_payment_intent" ON "orders" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "idx_promo_redemptions_code_user" ON "promo_redemptions" USING btree ("promo_code_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_entitlements_active" ON "entitlements" USING btree ("user_id","product_id") WHERE "entitlements"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_entitlements_user_revoked" ON "entitlements" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "idx_entitlements_product" ON "entitlements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_entitlements_order_item" ON "entitlements" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "idx_audit_log_entity" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_log_created" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_lessons_standalone_slug" ON "lessons" USING btree ("slug") WHERE "lessons"."module_id" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_lessons_media_asset" ON "lessons" USING btree ("media_asset_id");