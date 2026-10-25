import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../shared/config.js';
import * as schema from './schema.js';

// One connection pool for the whole process. Each query borrows a connection
// and returns it, so we never open a new TCP connection per request.
export const pool = new pg.Pool({ connectionString: config.databaseUrl });

// casing: TypeScript uses camelCase (startedAt), Postgres columns use snake_case (started_at).
export const db = drizzle(pool, { schema, casing: 'snake_case' });

export type Db = typeof db;
