import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './packages/infrastructure/src/persistence/sqlite/schema.ts',
  out: './packages/infrastructure/src/persistence/sqlite/migrations',
});
