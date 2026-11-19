CREATE TABLE `install_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	CONSTRAINT "install_tickets_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
