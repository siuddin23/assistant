CREATE TYPE "public"."order_category" AS ENUM('O', 'F', 'R');--> statement-breakpoint
CREATE TYPE "public"."return_kind" AS ENUM('gagal_kirim', 'retur');--> statement-breakpoint
CREATE TYPE "public"."return_status" AS ENUM('baru', 'proses', 'kirim_ulang', 'kembali_ke_gudang', 'selesai');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'cs', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."ship_status" AS ENUM('belum_kirim', 'dalam_perjalanan', 'terkirim', 'gagal', 'retur', 'batal');--> statement-breakpoint
CREATE TABLE "ad_spend_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"account_id" text NOT NULL,
	"account_name" text,
	"spend" numeric(14, 0) DEFAULT 0 NOT NULL,
	"purchases" integer DEFAULT 0 NOT NULL,
	"purchase_value" numeric(14, 0) DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"link_clicks" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cod_settlements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"awb" text NOT NULL,
	"settlement_date" date,
	"cod_amount" numeric(14, 0) DEFAULT 0 NOT NULL,
	"shipping_fee" numeric(14, 0) DEFAULT 0 NOT NULL,
	"cod_fee" numeric(14, 0) DEFAULT 0 NOT NULL,
	"other_fee" numeric(14, 0) DEFAULT 0 NOT NULL,
	"net_amount" numeric(14, 0) DEFAULT 0 NOT NULL,
	"batch_ref" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'everpro' NOT NULL,
	"import_batch_id" integer,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cs_agents" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"filename" text,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_code" text NOT NULL,
	"qty" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_date" date NOT NULL,
	"cs_code" text,
	"customer_name" text,
	"customer_phone" text,
	"address" text,
	"city" text,
	"product_type" text,
	"payment_method" text,
	"category" "order_category",
	"omzet" numeric(14, 0) DEFAULT 0 NOT NULL,
	"courier" text,
	"shipping_cost" numeric(14, 0),
	"insurance" numeric(14, 0),
	"awb" text,
	"ship_status" "ship_status" DEFAULT 'belum_kirim' NOT NULL,
	"ship_status_raw" text,
	"ship_status_at" timestamp with time zone,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"edited_in_app" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" numeric(14, 0),
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"kind" "return_kind" NOT NULL,
	"reason" text,
	"status" "return_status" DEFAULT 'baru' NOT NULL,
	"return_cost" numeric(14, 0),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shipment_updates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"awb" text NOT NULL,
	"status" "ship_status" NOT NULL,
	"status_raw" text,
	"event_at" timestamp with time zone,
	"source" text NOT NULL,
	"import_batch_id" integer,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'cs' NOT NULL,
	"cs_code" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'baru' NOT NULL,
	"error" text,
	"order_id" integer
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_spend_daily_uq" ON "ad_spend_daily" USING btree ("date","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cod_settlements_awb_batch_uq" ON "cod_settlements" USING btree ("awb","batch_ref");--> statement-breakpoint
CREATE INDEX "cod_settlements_awb_idx" ON "cod_settlements" USING btree ("awb");--> statement-breakpoint
CREATE UNIQUE INDEX "import_mappings_kind_name_uq" ON "import_mappings" USING btree ("kind","name");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_source_ref_uq" ON "orders" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "orders_date_idx" ON "orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "orders_awb_idx" ON "orders" USING btree ("awb");--> statement-breakpoint
CREATE INDEX "orders_cs_idx" ON "orders" USING btree ("cs_code");--> statement-breakpoint
CREATE INDEX "returns_order_idx" ON "returns" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipment_updates_awb_idx" ON "shipment_updates" USING btree ("awb");--> statement-breakpoint
CREATE INDEX "webhook_events_source_idx" ON "webhook_events" USING btree ("source","received_at");