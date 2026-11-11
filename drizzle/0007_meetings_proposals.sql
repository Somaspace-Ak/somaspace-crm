CREATE TYPE "public"."proposal_status" AS ENUM('aperta', 'approvata', 'scartata');--> statement-breakpoint
CREATE TABLE "recontact_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"company_id" uuid,
	"proposed_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"idea" text,
	"status" "proposal_status" DEFAULT 'aperta' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_accounts" ADD COLUMN "calendar_backfill_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "google_event_id" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "meet_link" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "docs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "docs_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "linked_manually" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recontact_proposals" ADD CONSTRAINT "recontact_proposals_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recontact_proposals" ADD CONSTRAINT "recontact_proposals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recontact_proposals" ADD CONSTRAINT "recontact_proposals_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recontact_proposals" ADD CONSTRAINT "recontact_proposals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recontact_proposals" ADD CONSTRAINT "recontact_proposals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recontact_proposals_status_idx" ON "recontact_proposals" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_google_event_idx" ON "meetings" USING btree ("google_event_id");--> statement-breakpoint
CREATE INDEX "meetings_occurred_idx" ON "meetings" USING btree ("occurred_at");--> statement-breakpoint
-- Come in 0003: le tabelle nuove si chiudono all'API pubblica di Supabase
ALTER TABLE "recontact_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "recontact_proposals" FROM anon, authenticated';
  END IF;
END $$;
