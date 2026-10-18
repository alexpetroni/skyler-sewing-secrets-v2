#!/usr/bin/env bash
# Vendor the legacy site into this repository as READ-ONLY reference material
# for the phase-runner builders, which can only see this project directory.
#
# Usage: scripts/vendor-legacy.sh [path-to-legacy-repo] [branch]
#   default path:   ../skyler-sewing-secrets
#   default branch: vercel-neon-migration
#
# legacy/drizzle/ becomes v2's migration baseline (PHASE-03), so it must equal the
# migration history applied to the Neon database. The pre-cutover fixes on the
# legacy branch are schema-free by rule; re-run this only if that branch changes.
# Re-running replaces legacy/ and the vendored static assets.
set -euo pipefail

SRC="${1:-../skyler-sewing-secrets}"
BRANCH="${2:-vercel-neon-migration}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

[[ -d "$SRC/.git" ]] || { echo "not a git repository: $SRC" >&2; exit 1; }
git -C "$SRC" rev-parse --verify "$BRANCH" >/dev/null 2>&1 || { echo "no branch $BRANCH in $SRC" >&2; exit 1; }

rm -rf "$HERE/legacy"
mkdir -p "$HERE/legacy" "$HERE/static"

# Source, seeds, migrations, Tailwind/PostCSS config, env example, the old
# constitution — exactly as committed on the branch (no node_modules, no .env).
git -C "$SRC" archive "$BRANCH" \
  src seed drizzle supabase tailwind.config.js postcss.config.js .env.example \
  CLAUDE.md ARCHITECTURE.md DECISIONS.md docs/phase-runner/ENTRY.md \
  | tar -x -C "$HERE/legacy"

# Static assets the new site serves as-is (logo, images, favicon, robots).
# static/originals (unoptimised sources) is left out.
git -C "$SRC" archive "$BRANCH" static \
  | tar -x -C "$HERE" --exclude='static/originals'

cat > "$HERE/legacy/README.md" <<'README'
# legacy/ — read-only reference

Vendored from the `vercel-neon-migration` branch of the previous site with
`scripts/vendor-legacy.sh`. Builders read it to port design tokens, copy, page
structure, access rules and the Drizzle migration history. Nothing here is
imported, built, linted, type-checked or tested; nothing here is edited. The
migration files under `legacy/drizzle/` are the exact history already applied
to the production Neon database and are copied verbatim into `drizzle/` by
PHASE-03.
README

echo "vendored $(git -C "$SRC" rev-parse --short "$BRANCH") of $BRANCH from $SRC into legacy/ and static/"
echo "legacy: $(du -sh "$HERE/legacy" | cut -f1)   static: $(du -sh "$HERE/static" | cut -f1)"
