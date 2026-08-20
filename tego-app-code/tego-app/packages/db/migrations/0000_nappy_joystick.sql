CREATE TABLE "ad_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"platform" text DEFAULT 'meta' NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"timezone_name" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_imported_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"segment" text,
	"funnel_type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "conversion_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"conversion_key" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "conversion_mappings_ad_account_id_action_type_unique" UNIQUE("ad_account_id","action_type")
);
--> statement-breakpoint
CREATE TABLE "dim_entity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"level" text NOT NULL,
	"parent_ext_id" text,
	"name" text NOT NULL,
	"status" text,
	"vertical" text,
	"canal" text,
	"temperatura" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dim_entity_ad_account_id_external_id_unique" UNIQUE("ad_account_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "fact_actions_daily" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fact_actions_daily_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entity_id" uuid NOT NULL,
	"date" date NOT NULL,
	"attribution_window" text NOT NULL,
	"action_type" text NOT NULL,
	"conversion_key" text,
	"count" numeric(18, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "fact_actions_daily_entity_id_date_attribution_window_action_type_unique" UNIQUE("entity_id","date","attribution_window","action_type")
);
--> statement-breakpoint
CREATE TABLE "fact_insights_daily" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fact_insights_daily_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ad_account_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"level" text NOT NULL,
	"date" date NOT NULL,
	"attribution_window" text NOT NULL,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"spend" numeric(18, 6) DEFAULT '0' NOT NULL,
	"reach" bigint,
	"currency" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fact_insights_daily_entity_id_date_attribution_window_unique" UNIQUE("entity_id","date","attribution_window")
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"source_file" text NOT NULL,
	"template_version" text NOT NULL,
	"rows_read" integer NOT NULL,
	"entities_upserted" integer NOT NULL,
	"insight_rows_upserted" integer NOT NULL,
	"action_rows_upserted" integer NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_mappings" ADD CONSTRAINT "conversion_mappings_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dim_entity" ADD CONSTRAINT "dim_entity_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_actions_daily" ADD CONSTRAINT "fact_actions_daily_entity_id_dim_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."dim_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_insights_daily" ADD CONSTRAINT "fact_insights_daily_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_insights_daily" ADD CONSTRAINT "fact_insights_daily_entity_id_dim_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."dim_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;