CREATE TABLE "install_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "install_tickets_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
