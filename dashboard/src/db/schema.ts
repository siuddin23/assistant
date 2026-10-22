import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const money = (name: string) => numeric(name, { precision: 14, scale: 0, mode: "number" });
const created = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updated = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const roleEnum = pgEnum("role", ["admin", "cs", "viewer"]);
// O = order baru, F = follow up, R = repeat order
export const categoryEnum = pgEnum("order_category", ["O", "F", "R"]);
export const shipStatusEnum = pgEnum("ship_status", [
  "belum_kirim",
  "dalam_perjalanan",
  "terkirim",
  "gagal",
  "retur",
  "batal",
]);
export const returnKindEnum = pgEnum("return_kind", ["gagal_kirim", "retur"]);
export const returnStatusEnum = pgEnum("return_status", [
  "baru",
  "proses",
  "kirim_ulang",
  "kembali_ke_gudang",
  "selesai",
]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("cs"),
  csCode: text("cs_code"),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
});

export const csAgents = pgTable("cs_agents", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
});

export const products = pgTable("products", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  price: money("price"),
  active: boolean("active").notNull().default(true),
});

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderDate: date("order_date").notNull(),
    csCode: text("cs_code"),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    address: text("address"),
    city: text("city"),
    productType: text("product_type"),
    paymentMethod: text("payment_method"), // TF / COD / QR / CC
    category: categoryEnum("category"),
    omzet: money("omzet").notNull().default(0),
    courier: text("courier"),
    shippingCost: money("shipping_cost"),
    insurance: money("insurance"),
    awb: text("awb"),
    shipStatus: shipStatusEnum("ship_status").notNull().default("belum_kirim"),
    shipStatusRaw: text("ship_status_raw"),
    shipStatusAt: timestamp("ship_status_at", { withTimezone: true }),
    notes: text("notes"),
    source: text("source").notNull().default("manual"), // manual / sheet / globemerce / import
    sourceRef: text("source_ref"), // kunci deduplikasi per sumber
    editedInApp: boolean("edited_in_app").notNull().default(false),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("orders_source_ref_uq").on(t.sourceRef),
    index("orders_date_idx").on(t.orderDate),
    index("orders_awb_idx").on(t.awb),
    index("orders_cs_idx").on(t.csCode),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productCode: text("product_code").notNull(),
    qty: integer("qty").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const returns = pgTable(
  "returns",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    kind: returnKindEnum("kind").notNull(),
    reason: text("reason"),
    status: returnStatusEnum("status").notNull().default("baru"),
    returnCost: money("return_cost"),
    notes: text("notes"),
    createdAt: created(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("returns_order_idx").on(t.orderId)],
);

export const shipmentUpdates = pgTable(
  "shipment_updates",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    awb: text("awb").notNull(),
    status: shipStatusEnum("status").notNull(),
    statusRaw: text("status_raw"),
    eventAt: timestamp("event_at", { withTimezone: true }),
    source: text("source").notNull(),
    importBatchId: integer("import_batch_id"),
    raw: jsonb("raw"),
    createdAt: created(),
  },
  (t) => [index("shipment_updates_awb_idx").on(t.awb)],
);

export const codSettlements = pgTable(
  "cod_settlements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    awb: text("awb").notNull(),
    settlementDate: date("settlement_date"),
    codAmount: money("cod_amount").notNull().default(0),
    shippingFee: money("shipping_fee").notNull().default(0),
    codFee: money("cod_fee").notNull().default(0),
    otherFee: money("other_fee").notNull().default(0),
    netAmount: money("net_amount").notNull().default(0),
    batchRef: text("batch_ref").notNull().default(""),
    source: text("source").notNull().default("everpro"),
    importBatchId: integer("import_batch_id"),
    raw: jsonb("raw"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("cod_settlements_awb_batch_uq").on(t.awb, t.batchRef), index("cod_settlements_awb_idx").on(t.awb)],
);

export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // orders / shipments / settlements / sheet
  source: text("source").notNull(),
  filename: text("filename"),
  totalRows: integer("total_rows").notNull().default(0),
  inserted: integer("inserted").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  errors: jsonb("errors").$type<string[]>().notNull().default([]),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: created(),
});

export const importMappings = pgTable(
  "import_mappings",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    mapping: jsonb("mapping").$type<Record<string, string>>().notNull(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("import_mappings_kind_name_uq").on(t.kind, t.name)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("baru"), // baru / diproses / belum_dipetakan / error
    error: text("error"),
    orderId: integer("order_id"),
  },
  (t) => [index("webhook_events_source_idx").on(t.source, t.receivedAt)],
);

export const adSpendDaily = pgTable(
  "ad_spend_daily",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    accountId: text("account_id").notNull(),
    accountName: text("account_name"),
    spend: money("spend").notNull().default(0),
    purchases: integer("purchases").notNull().default(0),
    purchaseValue: money("purchase_value").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    linkClicks: integer("link_clicks").notNull().default(0),
  },
  (t) => [uniqueIndex("ad_spend_daily_uq").on(t.date, t.accountId)],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type ShipStatus = (typeof shipStatusEnum.enumValues)[number];
export type Role = (typeof roleEnum.enumValues)[number];
