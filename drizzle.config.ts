import { defineConfig } from 'drizzle-kit';

// Used by `npm run db:generate` to turn src/db/schema.ts into SQL migrations.
// Generating needs no database connection; applying them is done by src/db/migrate.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
});
