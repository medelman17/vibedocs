ALTER TABLE "document_chunks" DROP CONSTRAINT "chunk_doc_index";--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "start_position" integer;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "end_position" integer;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "chunk_type" text;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "analysis_id" uuid;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "overlap_tokens" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "chunk_map" jsonb;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "chunk_stats" jsonb;--> statement-breakpoint
CREATE INDEX "idx_chunks_analysis" ON "document_chunks" USING btree ("analysis_id");--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "chunk_doc_analysis_index" UNIQUE("document_id","analysis_id","chunk_index");