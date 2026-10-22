CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'globemerce' NOT NULL,
	"external_id" text NOT NULL,
	"name" text,
	"phone" text,
	"province" text,
	"regency" text,
	"district" text,
	"gender" text,
	"total_order" integer DEFAULT 0 NOT NULL,
	"last_order_date" date,
	"join_date" date,
	"product_consume" text,
	"tags" text,
	"customer_source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "product_cost" numeric(14, 0);--> statement-breakpoint
CREATE UNIQUE INDEX "customers_source_ext_uq" ON "customers" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "customers_last_order_idx" ON "customers" USING btree ("last_order_date");