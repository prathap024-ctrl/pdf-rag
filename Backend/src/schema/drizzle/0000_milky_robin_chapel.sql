CREATE TABLE "load_pdf" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" varchar(255) NOT NULL,
	"size" integer NOT NULL,
	"collection_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pdf_response" (
	"id" serial PRIMARY KEY NOT NULL,
	"load_id" integer NOT NULL,
	"question" varchar(2000),
	"answer" varchar(5000),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "pdf_response" ADD CONSTRAINT "pdf_response_load_id_load_pdf_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."load_pdf"("id") ON DELETE cascade ON UPDATE no action;