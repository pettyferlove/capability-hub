import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/infrastructure/src/persistence/postgresql/schema.ts',
  out: './packages/infrastructure/src/persistence/postgresql/migrations',
});
