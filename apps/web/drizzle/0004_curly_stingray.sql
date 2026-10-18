CREATE TYPE "public"."linear_sync_state" AS ENUM('pending', 'synced', 'failed');--> statement-breakpoint
ALTER TABLE "integrations" ALTER COLUMN "encrypted_token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "encrypted_webhook_secret" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "connected_by_id" uuid;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "linear_sync_state" "linear_sync_state";--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "linear_sync_error" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "linear_sync_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "linear_retry_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_connected_by_id_users_id_fk" FOREIGN KEY ("connected_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_ws_linear_issue_idx" ON "tickets" USING btree ("workspace_id","linear_issue_id");