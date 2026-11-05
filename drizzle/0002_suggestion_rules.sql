ALTER TYPE "public"."suggestion_reason" ADD VALUE 'ripresa';--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "source_opportunity_id" uuid;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "rule_key" text;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "opportunity_id" uuid;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_source_opportunity_id_opportunities_id_fk" FOREIGN KEY ("source_opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggestions_rule_key_idx" ON "suggestions" USING btree ("rule_key");