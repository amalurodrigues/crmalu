CREATE TABLE "offline_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"campaign_ext_id" text,
	"date" date NOT NULL,
	"metric_key" text NOT NULL,
	"value" numeric(18, 6) NOT NULL,
	"source" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offline_results_client_id_campaign_ext_id_date_metric_key_unique" UNIQUE NULLS NOT DISTINCT("client_id","campaign_ext_id","date","metric_key")
);
--> statement-breakpoint
ALTER TABLE "offline_results" ADD CONSTRAINT "offline_results_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;