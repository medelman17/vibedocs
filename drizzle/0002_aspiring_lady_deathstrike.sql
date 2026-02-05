ALTER TABLE "analyses" ADD COLUMN "ocr_text" text;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "ocr_confidence" real;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "ocr_warning" text;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "ocr_completed_at" timestamp with time zone;