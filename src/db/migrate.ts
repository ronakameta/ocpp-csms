// Applies every migration in drizzle/ that has not run yet, in order.
// Drizzle records applied migrations in a table, so running this twice is safe.
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client.js';

try {
  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('Migrations applied.');
} finally {
  await pool.end();
}
