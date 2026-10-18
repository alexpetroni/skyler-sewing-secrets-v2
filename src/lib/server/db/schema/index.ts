// Drizzle schema, split by module. Every table, enum, index, constraint and
// relation here is declared exactly as legacy/src/lib/server/db/schema.ts did:
// drizzle/meta/ holds the legacy snapshots, so any deviation would make
// `drizzle-kit generate` emit a migration against the production database.
export * from './auth.ts';
export * from './profiles.ts';
export * from './content.ts';
export * from './marketing.ts';
export * from './legacy-commerce.ts';
export * from './settings.ts';
export * from './relations.ts';
