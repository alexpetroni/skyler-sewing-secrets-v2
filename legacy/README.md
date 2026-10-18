# legacy/ — read-only reference

Vendored from the `vercel-neon-migration` branch of the previous site with
`scripts/vendor-legacy.sh`. Builders read it to port design tokens, copy, page
structure, access rules and the Drizzle migration history. Nothing here is
imported, built, linted, type-checked or tested; nothing here is edited. The
migration files under `legacy/drizzle/` are the exact history already applied
to the production Neon database and are copied verbatim into `drizzle/` by
PHASE-03.
