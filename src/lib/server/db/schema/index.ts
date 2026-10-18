// Drizzle schema, split by module. Every legacy table, enum, index, constraint
// and relation here is declared exactly as legacy/src/lib/server/db/schema.ts
// did: drizzle/meta/ holds the legacy snapshots, so any deviation would make
// `drizzle-kit generate` emit a migration against the production database.
// v2 additions (0002_v2_catalogue) are additive: new tables, new columns, one
// dropped NOT NULL (`lessons.module_id`).
export * from './auth.ts';
export * from './profiles.ts';
export * from './media.ts';
export * from './content.ts';
export * from './marketing.ts';
export * from './legacy-commerce.ts';
export * from './catalog.ts';
export * from './commerce.ts';
export * from './entitlements.ts';
export * from './ops.ts';
export * from './settings.ts';
export * from './relations.ts';
