/**
 * Shared Drizzle client for seed scripts (Neon Postgres via DATABASE_URL)
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../src/lib/server/db/schema';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Missing environment variable: DATABASE_URL');
  process.exit(1);
}

export const pool = new Pool({ connectionString: DATABASE_URL });
export const db = drizzle(pool, { schema });
export { schema };
