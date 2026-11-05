CREATE TYPE "public"."data_status" AS ENUM('da_verificare', 'verificato');--> statement-breakpoint
CREATE TYPE "public"."fact_kind" AS ENUM('bisogno', 'budget', 'tempistica', 'obiezione', 'preferenza', 'contesto');--> statement-breakpoint
CREATE TYPE "public"."fact_source" AS ENUM('email', 'meeting', 'nota', 'chiamata');--> statement-breakpoint
CREATE TYPE "public"."followup_mode" AS ENUM('caldo', 'freddo', 'nessuno');--> statement-breakpoint
CREATE TYPE "public"."grant_origin" AS ENUM('manuale', 'agente');--> statement-breakpoint
CREATE TYPE "public"."health" AS ENUM('verde', 'giallo', 'rosso');--> statement-breakpoint
CREATE TYPE "public"."interaction_type" AS ENUM('email_inviata', 'email_ricevuta', 'meeting', 'chiamata', 'nota_vocale', 'nota', 'modifica_valore');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('it', 'en');--> statement-breakpoint
CREATE TYPE "public"."lost_reason" AS ENUM('prezzo', 'tempistica', 'nessuna_risposta', 'concorrente', 'annullato', 'altro');--> statement-breakpoint
CREATE TYPE "public"."meeting_source" AS ENUM('meet', 'nota_vocale', 'audio', 'manuale');--> statement-breakpoint
CREATE TYPE "public"."met_via" AS ENUM('evento', 'programma', 'passaparola', 'linkedin', 'inbound', 'rete_esistente', 'altro');--> statement-breakpoint
CREATE TYPE "public"."opportunity_origin" AS ENUM('diretta', 'servizio', 'bando', 'segnale');--> statement-breakpoint
CREATE TYPE "public"."origin" AS ENUM('agente', 'utente');--> statement-breakpoint
CREATE TYPE "public"."person_status" AS ENUM('da_approvare', 'attivo', 'archiviato');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('bassa', 'media', 'alta');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('da_avviare', 'attivo', 'in_pausa', 'chiuso');--> statement-breakpoint
CREATE TYPE "public"."relationship" AS ENUM('prospect', 'cliente', 'partner', 'fornitore', 'interno');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('fondatore', 'collaboratore');--> statement-breakpoint
CREATE TYPE "public"."service_status" AS ENUM('nuovo', 'attivo', 'ritirato');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('lead', 'in_progress', 'vinta', 'persa');--> statement-breakpoint
CREATE TYPE "public"."connection_strength" AS ENUM('molto_forte', 'forte', 'media', 'debole', 'nessuna');--> statement-breakpoint
CREATE TYPE "public"."suggestion_reason" AS ENUM('servizio', 'bando', 'segnale', 'dormiente');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('nuovo', 'accettato', 'scartato');--> statement-breakpoint
CREATE TYPE "public"."task_origin" AS ENUM('manuale', 'meeting', 'email', 'agente');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('proposto', 'da_fare', 'in_corso', 'fatto');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('privata', 'team');--> statement-breakpoint
CREATE TABLE "agent_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"outcome" text NOT NULL,
	"detail" text,
	"on_behalf_of" uuid
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domains" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"country" text,
	"website" text,
	"linkedin" text,
	"categories" text[] DEFAULT '{}' NOT NULL,
	"relationship" "relationship" DEFAULT 'prospect' NOT NULL,
	"owner_id" uuid,
	"connection_strength" "connection_strength" DEFAULT 'nessuna' NOT NULL,
	"last_interaction_at" timestamp with time zone,
	"drive_folder_url" text,
	"data_status" "data_status" DEFAULT 'verificato' NOT NULL,
	"sources" text,
	"agent_summary" text,
	"notion_page_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"date" date,
	"kind" text,
	"country" text,
	"notion_page_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "excluded_addresses" (
	"address" text PRIMARY KEY NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"kind" "fact_kind" NOT NULL,
	"company_id" uuid,
	"person_id" uuid,
	"project_id" uuid,
	"resurface_on" date,
	"valid_until" date,
	"source_type" "fact_source" NOT NULL,
	"contributor_id" uuid,
	"retracted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"body" text,
	"url" text,
	"deadline_on" date,
	"amount" text,
	"requirements" text,
	"sectors" text[] DEFAULT '{}' NOT NULL,
	"origin" "grant_origin" DEFAULT 'manuale' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interaction_people" (
	"interaction_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	CONSTRAINT "interaction_people_interaction_id_person_id_pk" PRIMARY KEY("interaction_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "interaction_type" NOT NULL,
	"title" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"summary" text,
	"link" text,
	"source_id" text,
	"visibility" "visibility" DEFAULT 'team' NOT NULL,
	"owner_id" uuid,
	"origin" "origin" DEFAULT 'agente' NOT NULL,
	"company_id" uuid,
	"opportunity_id" uuid,
	"project_id" uuid,
	"meeting_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"person_id" uuid,
	"user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" "meeting_source" NOT NULL,
	"company_id" uuid,
	"project_id" uuid,
	"opportunity_id" uuid,
	"summary" text,
	"decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transcript" text,
	"owner_id" uuid NOT NULL,
	"visibility" "visibility" DEFAULT 'team' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"stage" "stage" DEFAULT 'lead' NOT NULL,
	"company_id" uuid NOT NULL,
	"person_id" uuid,
	"owner_id" uuid,
	"initial_value" numeric(12, 2),
	"final_value" numeric(12, 2),
	"quote_sent_on" date,
	"quote_url" text,
	"followup_step" integer DEFAULT 0 NOT NULL,
	"last_followup_on" date,
	"next_followup_on" date,
	"snooze_until" date,
	"lost_reason" "lost_reason",
	"closed_on" date,
	"origin" "opportunity_origin" DEFAULT 'diretta' NOT NULL,
	"notes" text,
	"draft_url" text,
	"notion_page_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"company_id" uuid,
	"position" text,
	"email" text,
	"other_emails" text[] DEFAULT '{}' NOT NULL,
	"phone" text,
	"linkedin" text,
	"first_meeting_notes" text,
	"met_via" "met_via",
	"event_id" uuid,
	"interests" text[] DEFAULT '{}' NOT NULL,
	"owner_id" uuid,
	"followup_mode" "followup_mode",
	"proposed_mode" "followup_mode",
	"proposed_mode_reason" text,
	"last_interaction_at" timestamp with time zone,
	"next_followup_on" date,
	"snooze_until" date,
	"language" "language",
	"connection_strength" "connection_strength" DEFAULT 'nessuna' NOT NULL,
	"status" "person_status" DEFAULT 'attivo' NOT NULL,
	"draft_url" text,
	"notion_page_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company_id" uuid,
	"opportunity_id" uuid,
	"status" "project_status" DEFAULT 'da_avviare' NOT NULL,
	"owner_id" uuid,
	"start_on" date,
	"due_on" date,
	"health" "health" DEFAULT 'verde' NOT NULL,
	"health_note" text,
	"agent_summary" text,
	"notion_page_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_categories" text[] DEFAULT '{}' NOT NULL,
	"status" "service_status" DEFAULT 'attivo' NOT NULL,
	"launched_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"person_id" uuid,
	"reason" "suggestion_reason" NOT NULL,
	"service_id" uuid,
	"grant_id" uuid,
	"fact_id" uuid,
	"rationale" text NOT NULL,
	"score" integer DEFAULT 50 NOT NULL,
	"status" "suggestion_status" DEFAULT 'nuovo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_assignees" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "task_assignees_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"project_id" uuid,
	"company_id" uuid,
	"person_id" uuid,
	"opportunity_id" uuid,
	"parent_id" uuid,
	"status" "task_status" DEFAULT 'da_fare' NOT NULL,
	"priority" "priority" DEFAULT 'media' NOT NULL,
	"due_on" date,
	"origin" "task_origin" DEFAULT 'manuale' NOT NULL,
	"meeting_id" uuid,
	"rationale" text,
	"created_by" uuid,
	"completed_at" timestamp with time zone,
	"notion_page_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"role" "role" DEFAULT 'fondatore' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_log" ADD CONSTRAINT "agent_log_on_behalf_of_users_id_fk" FOREIGN KEY ("on_behalf_of") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_contributor_id_users_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction_people" ADD CONSTRAINT "interaction_people_interaction_id_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."interactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction_people" ADD CONSTRAINT "interaction_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_fact_id_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."facts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_name_idx" ON "companies" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "interactions_source_owner_idx" ON "interactions" USING btree ("source_id","owner_id");--> statement-breakpoint
CREATE INDEX "interactions_company_idx" ON "interactions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "interactions_occurred_idx" ON "interactions" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "opportunities_stage_idx" ON "opportunities" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "people_company_idx" ON "people" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "people_next_idx" ON "people" USING btree ("next_followup_on");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("due_on");