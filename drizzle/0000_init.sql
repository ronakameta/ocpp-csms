CREATE TYPE "public"."charge_point_error_code" AS ENUM('ConnectorLockFailure', 'EVCommunicationError', 'GroundFailure', 'HighTemperature', 'InternalError', 'LocalListConflict', 'NoError', 'OtherError', 'OverCurrentFailure', 'OverVoltage', 'PowerMeterFailure', 'PowerSwitchFailure', 'ReaderFailure', 'ResetFailure', 'UnderVoltage', 'WeakSignal');--> statement-breakpoint
CREATE TYPE "public"."charge_point_status" AS ENUM('Available', 'Preparing', 'Charging', 'SuspendedEVSE', 'SuspendedEV', 'Finishing', 'Reserved', 'Unavailable', 'Faulted');--> statement-breakpoint
CREATE TYPE "public"."connector_type" AS ENUM('Type2', 'CCS2', 'CHAdeMO', 'GBT', 'Type1');--> statement-breakpoint
CREATE TYPE "public"."id_tag_status" AS ENUM('Accepted', 'Blocked', 'Expired', 'Invalid');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('Accepted', 'Pending', 'Rejected');--> statement-breakpoint
CREATE TYPE "public"."stop_reason" AS ENUM('DeAuthorized', 'EmergencyStop', 'EVDisconnected', 'HardReset', 'Local', 'Other', 'PowerLoss', 'Reboot', 'Remote', 'SoftReset', 'UnlockCommand');--> statement-breakpoint
CREATE TABLE "chargers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chargers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"identity" varchar(48) NOT NULL,
	"vendor" varchar(20),
	"model" varchar(20),
	"serial_number" varchar(25),
	"firmware_version" varchar(50),
	"meter_type" varchar(25),
	"registration_status" "registration_status" DEFAULT 'Pending' NOT NULL,
	"status" charge_point_status,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chargers_identity_unique" UNIQUE("identity")
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "connectors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"charger_id" bigint NOT NULL,
	"connector_number" integer NOT NULL,
	"type" "connector_type",
	"status" charge_point_status,
	"error_code" charge_point_error_code,
	"status_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connectors_charger_number_unique" UNIQUE("charger_id","connector_number"),
	CONSTRAINT "connectors_number_positive" CHECK ("connectors"."connector_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "id_tags" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "id_tags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"id_tag" varchar(20) NOT NULL,
	"status" "id_tag_status" DEFAULT 'Accepted' NOT NULL,
	"expires_at" timestamp with time zone,
	"parent_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meter_values" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "meter_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"connector_id" bigint NOT NULL,
	"transaction_id" integer,
	"sampled_at" timestamp with time zone NOT NULL,
	"measurand" varchar(50) DEFAULT 'Energy.Active.Import.Register' NOT NULL,
	"phase" varchar(10),
	"location" varchar(10),
	"context" varchar(30),
	"unit" varchar(10) DEFAULT 'Wh' NOT NULL,
	"value" numeric NOT NULL,
	CONSTRAINT "meter_values_reading_unique" UNIQUE NULLS NOT DISTINCT("connector_id","sampled_at","measurand","phase","location")
);
--> statement-breakpoint
CREATE TABLE "status_notifications" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "status_notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"charger_id" bigint NOT NULL,
	"connector_number" integer NOT NULL,
	"status" charge_point_status NOT NULL,
	"error_code" charge_point_error_code NOT NULL,
	"info" varchar(50),
	"vendor_error_code" varchar(50),
	"reported_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_notifications_number_non_negative" CHECK ("status_notifications"."connector_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"charger_id" bigint NOT NULL,
	"connector_id" bigint NOT NULL,
	"id_tag" varchar(20) NOT NULL,
	"meter_start" bigint NOT NULL,
	"meter_stop" bigint,
	"energy_wh" bigint GENERATED ALWAYS AS (meter_stop - meter_start) STORED,
	"started_at" timestamp with time zone NOT NULL,
	"stopped_at" timestamp with time zone,
	"stop_reason" "stop_reason",
	"reservation_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_connector_started_unique" UNIQUE("connector_id","started_at"),
	CONSTRAINT "transactions_meter_order" CHECK ("transactions"."meter_stop" is null or "transactions"."meter_stop" >= "transactions"."meter_start"),
	CONSTRAINT "transactions_time_order" CHECK ("transactions"."stopped_at" is null or "transactions"."stopped_at" >= "transactions"."started_at")
);
--> statement-breakpoint
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_charger_id_chargers_id_fk" FOREIGN KEY ("charger_id") REFERENCES "public"."chargers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "id_tags" ADD CONSTRAINT "id_tags_parent_id_id_tags_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."id_tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_values" ADD CONSTRAINT "meter_values_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_values" ADD CONSTRAINT "meter_values_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_notifications" ADD CONSTRAINT "status_notifications_charger_id_chargers_id_fk" FOREIGN KEY ("charger_id") REFERENCES "public"."chargers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_charger_id_chargers_id_fk" FOREIGN KEY ("charger_id") REFERENCES "public"."chargers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "id_tags_id_tag_ci_unique" ON "id_tags" USING btree (upper("id_tag"));--> statement-breakpoint
CREATE INDEX "meter_values_transaction_sampled_idx" ON "meter_values" USING btree ("transaction_id","sampled_at");--> statement-breakpoint
CREATE INDEX "status_notifications_charger_connector_idx" ON "status_notifications" USING btree ("charger_id","connector_number","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_one_active_per_connector" ON "transactions" USING btree ("connector_id") WHERE "transactions"."stopped_at" is null;--> statement-breakpoint
CREATE INDEX "transactions_charger_started_idx" ON "transactions" USING btree ("charger_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_id_tag_started_idx" ON "transactions" USING btree ("id_tag","started_at" DESC NULLS LAST);