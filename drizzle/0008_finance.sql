CREATE TYPE "public"."cash_category" AS ENUM('contratto', 'altro_incasso', 'compensi', 'fornitori', 'collaboratori', 'tasse', 'commercialista', 'costi_fissi', 'trasferte', 'attrezzatura', 'imprevisti', 'altro');--> statement-breakpoint
CREATE TYPE "public"."cash_certainty" AS ENUM('sicuro', 'a_rischio');--> statement-breakpoint
CREATE TYPE "public"."cash_direction" AS ENUM('entrata', 'uscita');--> statement-breakpoint
CREATE TYPE "public"."cash_status" AS ENUM('previsto', 'fatturato', 'pagato');--> statement-breakpoint
CREATE TABLE "bank_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"on" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"account" text DEFAULT 'Conto principale' NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction" "cash_direction" NOT NULL,
	"category" "cash_category" NOT NULL,
	"title" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"due_on" date,
	"status" "cash_status" DEFAULT 'previsto' NOT NULL,
	"paid_on" date,
	"certainty" "cash_certainty" DEFAULT 'sicuro' NOT NULL,
	"company_id" uuid,
	"counterparty" text,
	"project_id" uuid,
	"opportunity_id" uuid,
	"user_id" uuid,
	"invoice_ref" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_balances" ADD CONSTRAINT "bank_balances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_balances_on_idx" ON "bank_balances" USING btree ("on");--> statement-breakpoint
CREATE INDEX "cash_movements_due_idx" ON "cash_movements" USING btree ("due_on");--> statement-breakpoint
CREATE INDEX "cash_movements_company_idx" ON "cash_movements" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "cash_movements_opportunity_idx" ON "cash_movements" USING btree ("opportunity_id");--> statement-breakpoint
-- Come in 0003: le tabelle nuove si chiudono all'API pubblica di Supabase
ALTER TABLE "cash_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bank_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "cash_movements" FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON "bank_balances" FROM anon, authenticated';
  END IF;
END $$;
