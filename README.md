# Skyler's Sewing Secrets v2

The rebuild of [skylersewingsecrets.com](https://skylersewingsecrets.com) as a catalogue: the
flagship sewing course (lifetime, all-access), admin-defined bundles of videos and standalone
videos, bought through a cart and Stripe Checkout with per-product discount codes. Members of
the previous site keep their logins and everything they own. Videos are hosted on Bunny Stream,
email goes through Resend, and the app deploys to Vercel on SvelteKit 3.

The previous site is vendored read-only under `legacy/` for reference. The analysis behind this
rebuild, including the architecture and data model, is in [`docs/analysis/README.md`](docs/analysis/README.md).

## Local setup

Requires Node 24 (see `.nvmrc`) and npm.

```sh
npm ci
cp .env.example .env   # fill in the values you have; see the comments in the file
```

For local development without a Postgres server, point the app at an embedded PGlite database
(available once the database baseline lands in PHASE-03):

```sh
DATABASE_DRIVER=pglite DATABASE_URL=pglite://./.pglite npm run dev
```

## Verification

The four gate commands, run from the project root, must all pass before a change is merged:

```sh
npm run check   # svelte-check with --fail-on-warnings
npm run lint    # prettier --check . && eslint .
npm run build   # production build; also passes with no environment variables set
npm test        # vitest run
```

CI runs the same four commands on every push and pull request.
