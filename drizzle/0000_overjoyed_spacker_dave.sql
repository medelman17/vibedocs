CREATE TABLE "accounts" (
	"userId" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"activeOrganizationId" uuid
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp with time zone,
	"image" text,
	"password_hash" text,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"last_login_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"invited_by" uuid,
	"invited_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_member_unique" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"section_path" text[],
	"embedding" vector(1024),
	"token_count" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chunk_doc_index" UNIQUE("document_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"uploaded_by" uuid,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer,
	"file_url" text,
	"content_hash" text,
	"raw_text" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"overall_risk_score" real,
	"overall_risk_level" text,
	"summary" text,
	"gap_analysis" jsonb,
	"token_usage" jsonb,
	"estimated_tokens" integer,
	"actual_tokens" integer,
	"estimated_cost" real,
	"was_truncated" boolean DEFAULT false,
	"processing_time_ms" integer,
	"inngest_run_id" text,
	"progress_stage" text,
	"progress_percent" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clause_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"analysis_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_id" uuid,
	"category" text NOT NULL,
	"secondary_categories" text[],
	"clause_text" text NOT NULL,
	"start_position" integer,
	"end_position" integer,
	"confidence" real NOT NULL,
	"risk_level" text NOT NULL,
	"risk_explanation" text,
	"evidence" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clause_analysis_chunk" UNIQUE("analysis_id","chunk_id")
);
--> statement-breakpoint
CREATE TABLE "comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_a_id" uuid NOT NULL,
	"document_b_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"summary" text,
	"clause_alignments" jsonb,
	"key_differences" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_ndas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid,
	"title" text NOT NULL,
	"template_source" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"content" text NOT NULL,
	"content_html" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"table_name" text NOT NULL,
	"record_id" uuid NOT NULL,
	"action" text NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"user_id" uuid,
	"ip_address" text,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_nli_hypotheses" (
	"id" integer PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "cuad_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"risk_weight" real DEFAULT 1,
	"is_nda_relevant" boolean DEFAULT true,
	CONSTRAINT "cuad_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "reference_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"title" text NOT NULL,
	"raw_text" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_documents_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "reference_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"parent_id" uuid,
	"granularity" text NOT NULL,
	"content" text NOT NULL,
	"section_path" text[],
	"category" text,
	"hypothesis_id" integer,
	"nli_label" text,
	"embedding" vector(1024) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_embeddings_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "bootstrap_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"total_records" integer,
	"processed_records" integer DEFAULT 0 NOT NULL,
	"embedded_records" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"last_processed_hash" text,
	"last_batch_index" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"document_id" uuid,
	"title" text NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"attachments" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clause_extractions" ADD CONSTRAINT "clause_extractions_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clause_extractions" ADD CONSTRAINT "clause_extractions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clause_extractions" ADD CONSTRAINT "clause_extractions_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_document_a_id_documents_id_fk" FOREIGN KEY ("document_a_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_document_b_id_documents_id_fk" FOREIGN KEY ("document_b_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_ndas" ADD CONSTRAINT "generated_ndas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_embeddings" ADD CONSTRAINT "reference_embeddings_document_id_reference_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."reference_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_org_members_user" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_org_members_org" ON "organization_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_chunks_document" ON "document_chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "idx_chunks_tenant" ON "document_chunks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_docs_tenant" ON "documents" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_docs_status" ON "documents" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_analyses_document" ON "analyses" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_analyses_tenant" ON "analyses" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_clauses_analysis" ON "clause_extractions" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "idx_clauses_category" ON "clause_extractions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_clauses_tenant" ON "clause_extractions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_comparisons_tenant" ON "comparisons" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_comparisons_docs" ON "comparisons" USING btree ("document_a_id","document_b_id");--> statement-breakpoint
CREATE INDEX "idx_generated_tenant" ON "generated_ndas" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_generated_status" ON "generated_ndas" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_audit_tenant" ON "audit_logs" USING btree ("tenant_id","table_name","performed_at");--> statement-breakpoint
CREATE INDEX "idx_audit_record" ON "audit_logs" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "idx_nli_hypotheses_category" ON "contract_nli_hypotheses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_cuad_categories_name" ON "cuad_categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_ref_docs_source" ON "reference_documents" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_ref_docs_hash" ON "reference_documents" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "idx_ref_embed_document" ON "reference_embeddings" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_ref_embed_granularity" ON "reference_embeddings" USING btree ("granularity");--> statement-breakpoint
CREATE INDEX "idx_ref_embed_category" ON "reference_embeddings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_ref_embed_parent" ON "reference_embeddings" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_tenant_user_last_message" ON "conversations" USING btree ("tenant_id","user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_conversations_tenant_document" ON "conversations" USING btree ("tenant_id","document_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_created" ON "messages" USING btree ("conversation_id","created_at");