DROP INDEX `users_username_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_local_username` ON `users` (`username`) WHERE (data ->> 'ldap_entry_uuid') IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_ldap_username` ON `users` (`username`) WHERE (data ->> 'ldap_entry_uuid') IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_ldap_entry_uuid` ON `users` ((data ->> 'ldap_entry_uuid'));