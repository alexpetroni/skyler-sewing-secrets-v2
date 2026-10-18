import { defineConfig } from 'drizzle-kit';

// CLI-only configuration for drizzle-kit (generate / migrate). This is the one
// file in the project allowed to read process.env: it never runs inside the app.
export default defineConfig({
	schema: './src/lib/server/db/schema/index.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? ''
	},
	strict: true,
	verbose: true
});
