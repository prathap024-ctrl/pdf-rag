import {
  integer,
  pgTable,
  varchar,
  timestamp,
  serial,
  text,
} from "drizzle-orm/pg-core";

export const pdfLoad = pgTable("load_pdf", {
  id: serial("id").primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  size: integer("size").notNull(),
  collectionName: text("collection_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const pdfResponse = pgTable("pdf_response", {
  id: serial("id").primaryKey(),
  loadId: integer("load_id")
    .references(() => pdfLoad.id, { onDelete: "cascade" })
    .notNull(),
  question: varchar("question", { length: 2000 }),
  answer: varchar("answer", { length: 5000 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
