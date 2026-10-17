ALTER TABLE "followups" ALTER COLUMN "ticket_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "followups" ADD COLUMN "recipient_id" uuid;--> statement-breakpoint
ALTER TABLE "followups" ADD COLUMN "detail" text;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "followups_due_idx" ON "followups" USING btree ("status","scheduled_for");