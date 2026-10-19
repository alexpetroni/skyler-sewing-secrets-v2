// Development seed: a small catalogue and two accounts on a PGlite or Neon dev
// database (never production). Idempotent: every row is looked up first and
// only created when missing, so running it again changes nothing.
//
//   DATABASE_DRIVER=pglite DATABASE_URL=pglite://./.pglite npm run db:seed
//   DATABASE_URL=postgresql://…dev-branch… npm run db:migrate
//   SEED_DEV_CONFIRM=<that branch's host> DATABASE_URL=… npm run db:seed
//
// On PGlite it applies the migrations under drizzle/ first. Two guards keep the
// known-password admin out of a real database: a Neon URL is refused unless
// SEED_DEV_CONFIRM repeats its hostname, and any database that already holds
// an account other than the two seed accounts is refused outright.
//
// Creates, all signing in with SEED_PASSWORD:
//   admin@sewing.local   admin, two-factor off (the admin area asks to turn it on)
//   member@sewing.local  owns the flagship course (a `migration` entitlement)
// and the flagship course (one module, two lessons), two standalone videos
// sold as singles, a bundle, and the promo code WELCOME10 (10% off).
//
// Reads DATABASE_URL and DATABASE_DRIVER from the environment: this is a CLI,
// like scripts/backfill/run.ts, not application code.
import { pathToFileURL } from 'node:url';
import { and, count, eq, isNull, notInArray } from 'drizzle-orm';
import { createDb, schema, type Db } from '#lib/server/db/index.ts';
// The auth index also exports createAuth, which imports `$app/server` and so
// only loads inside SvelteKit; the account service alone runs under tsx.
import { createAuthService } from '#lib/server/modules/auth/service.ts';
import { createCatalogService } from '#lib/server/modules/catalog/index.ts';
import { createContentService } from '#lib/server/modules/content/index.ts';
import { createEntitlementService } from '#lib/server/modules/entitlements/index.ts';
import { createLogger, type Logger } from '#lib/server/platform/logger.ts';
import type { ProductInput } from '#lib/shared/schemas/catalog.ts';

const { lessons, media_assets, modules, products, profiles, promo_codes, users } = schema;

export const SEED_PASSWORD = 'dev-password-123';
export const SEED_ADMIN_EMAIL = 'admin@sewing.local';
export const SEED_MEMBER_EMAIL = 'member@sewing.local';
export const SEED_PROMO_CODE = 'WELCOME10';
export const SEED_EMAILS: readonly string[] = [SEED_ADMIN_EMAIL, SEED_MEMBER_EMAIL];

export interface SeedTarget {
	url: string;
	driver: 'neon' | 'pglite';
	/** `SEED_DEV_CONFIRM`: must repeat the Neon host to seed a remote database. */
	confirm: string | undefined;
}

/**
 * Why the target must not be seeded, or null when it may be. PGlite is always
 * local; a Neon database needs its hostname repeated in `SEED_DEV_CONFIRM`, so
 * a production `DATABASE_URL` left over in the shell (after a backfill, say)
 * cannot plant `admin@sewing.local` with a published password.
 */
export function checkSeedTarget({ url, driver, confirm }: SeedTarget): string | null {
	if (driver === 'pglite') return null;
	let host: string;
	try {
		host = new URL(url).hostname;
	} catch {
		return 'DATABASE_URL is not a valid URL';
	}
	if (!confirm) {
		return `Refusing to seed a remote database. Set SEED_DEV_CONFIRM=${host} to seed this one.`;
	}
	if (confirm !== host) {
		return `SEED_DEV_CONFIRM does not match the DATABASE_URL host (${host}); nothing seeded.`;
	}
	return null;
}
/** Not a real Bunny library: the player shows nothing, the signed URL is still built. */
const FAKE_LIBRARY_ID = '0';

interface LessonSeed {
	slug: string;
	title: string;
}

const COURSE_MODULE = { slug: 'getting-started', title: 'Getting Started' };
const COURSE_LESSONS: LessonSeed[] = [
	{ slug: 'threading-your-machine', title: 'Threading your machine' },
	{ slug: 'your-first-seam', title: 'Your first seam' }
];
const STANDALONE_LESSONS: LessonSeed[] = [
	{ slug: 'perfect-french-seams', title: 'Perfect French seams' },
	{ slug: 'invisible-zips', title: 'Invisible zips' }
];

/** What one run created; empty on a second run over the same database. */
export type SeedDevResult = string[];

function productInput(
	fields: Pick<ProductInput, 'kind' | 'slug' | 'title' | 'price'> & Partial<ProductInput>
): ProductInput {
	return {
		tagline: '',
		descriptionMd: `${fields.title}, seeded for local development.`,
		coverImageUrl: `https://dev.b-cdn.net/covers/${fields.slug}.jpg`,
		salePrice: null,
		saleStartsAt: null,
		saleEndsAt: null,
		isFeatured: false,
		sortOrder: 0,
		...fields
	};
}

export async function seedDev(db: Db, log: Logger): Promise<SeedDevResult> {
	// A database with real accounts is not a development database, whatever the URL says.
	const [foreign] = await db
		.select({ n: count() })
		.from(users)
		.where(notInArray(users.email, [...SEED_EMAILS]));
	if (foreign && foreign.n > 0) {
		throw new Error(
			`Refusing to seed: the database already holds ${foreign.n} account(s) that are not seed accounts.`
		);
	}

	const created: SeedDevResult = [];
	const auth = createAuthService({ db });
	const content = createContentService({ db, log });
	const catalog = createCatalogService({ db, content, log });
	const entitlements = createEntitlementService({ db, log });

	async function account(email: string, fullName: string): Promise<string> {
		const [existing] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email))
			.limit(1);
		if (existing) return existing.id;
		const id = await auth.createCredentialUser({ email, password: SEED_PASSWORD, fullName });
		await auth.markEmailVerified(id);
		created.push(`user ${email}`);
		return id;
	}

	async function moduleId(): Promise<string> {
		const [existing] = await db
			.select({ id: modules.id })
			.from(modules)
			.where(eq(modules.slug, COURSE_MODULE.slug))
			.limit(1);
		if (existing) return existing.id;
		const row = await content.modules.create({
			...COURSE_MODULE,
			description: 'Set up your machine and sew your first seam.',
			thumbnailUrl: '',
			orderIndex: 0,
			isPublished: true,
			isBonus: false,
			isCourseContent: true
		});
		created.push(`module ${COURSE_MODULE.slug}`);
		return row.id;
	}

	async function lesson(module: string | null, seed: LessonSeed, orderIndex: number) {
		const [existing] = await db
			.select({ id: lessons.id })
			.from(lessons)
			.where(
				and(
					eq(lessons.slug, seed.slug),
					module ? eq(lessons.module_id, module) : isNull(lessons.module_id)
				)
			)
			.limit(1);
		if (existing) return existing.id;
		const videoId = `seed-${seed.slug}`;
		const [asset] = await db
			.insert(media_assets)
			.values({
				library_id: FAKE_LIBRARY_ID,
				video_id: videoId,
				title: seed.title,
				status: 'ready',
				duration_seconds: 300
			})
			.returning({ id: media_assets.id });
		const row = await content.lessons.create({
			moduleId: module,
			...seed,
			kind: 'video',
			mediaAssetId: asset.id,
			description: '',
			contentMd: '',
			isFreePreview: false,
			isPublished: true,
			orderIndex
		});
		// The legacy column keeps the `bunny:` reference the old app and the
		// media-assets backfill read.
		await db
			.update(lessons)
			.set({ video_url: `bunny:${FAKE_LIBRARY_ID}/${videoId}` })
			.where(eq(lessons.id, row.id));
		created.push(`lesson ${seed.slug}`);
		return row.id;
	}

	/** The flagship is whichever course exists; a second one would be refused. */
	async function product(input: ProductInput, lessonIds: string[]): Promise<string> {
		const [existing] = await db
			.select({ id: products.id })
			.from(products)
			.where(input.kind === 'course' ? eq(products.kind, 'course') : eq(products.slug, input.slug))
			.limit(1);
		if (existing) return existing.id;
		const row = await catalog.create(input, undefined, lessonIds);
		await catalog.publish(row.id);
		created.push(`product ${input.slug}`);
		return row.id;
	}

	const adminId = await account(SEED_ADMIN_EMAIL, 'Dev Admin');
	await db
		.update(profiles)
		.set({ is_admin: true })
		.where(and(eq(profiles.id, adminId), eq(profiles.is_admin, false)));
	const memberId = await account(SEED_MEMBER_EMAIL, 'Dev Member');

	const module = await moduleId();
	const courseLessons: string[] = [];
	for (const [index, seed] of COURSE_LESSONS.entries()) {
		courseLessons.push(await lesson(module, seed, index));
	}
	const [frenchSeams, invisibleZips] = [
		await lesson(null, STANDALONE_LESSONS[0], 0),
		await lesson(null, STANDALONE_LESSONS[1], 1)
	];

	const flagship = await product(
		productInput({
			kind: 'course',
			slug: 'the-complete-course',
			title: 'The Complete Course',
			price: 14900,
			isFeatured: true
		}),
		[]
	);
	await product(
		productInput({
			kind: 'single',
			slug: 'perfect-french-seams',
			title: 'Perfect French seams',
			price: 900
		}),
		[frenchSeams]
	);
	await product(
		productInput({ kind: 'single', slug: 'invisible-zips', title: 'Invisible zips', price: 1200 }),
		[invisibleZips]
	);
	// The bundle holds a course lesson no single sells, so the bundle is the
	// cheapest unlock for it: the E2E locked-lesson spec (E2E_BUNDLE_LESSON_PATH)
	// relies on that; the lesson page links only the cheapest product and the course.
	await product(
		productInput({
			kind: 'bundle',
			slug: 'finishing-touches',
			title: 'Finishing Touches',
			price: 2900
		}),
		[invisibleZips, courseLessons[1]]
	);

	const before = await entitlements.ownedProductIds(memberId);
	await entitlements.grant({ userId: memberId, productId: flagship, source: 'migration' });
	if (!before.includes(flagship)) created.push(`entitlement ${SEED_MEMBER_EMAIL}`);

	const promo = await db
		.insert(promo_codes)
		.values({
			code: SEED_PROMO_CODE,
			description: '10% off anything, for local development',
			discount_type: 'percentage',
			discount_value: 10
		})
		.onConflictDoNothing({ target: promo_codes.code })
		.returning({ id: promo_codes.id });
	if (promo.length > 0) created.push(`promo ${SEED_PROMO_CODE}`);

	return created;
}

async function closeDb(db: Db): Promise<void> {
	// Same structural narrowing as scripts/backfill/run.ts.
	const client = (
		db as unknown as { $client?: { end?: () => Promise<void>; close?: () => Promise<void> } }
	).$client;
	if (client?.end) await client.end();
	else if (client?.close) await client.close();
}

async function main(): Promise<number> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error('DATABASE_URL is not set');
		return 2;
	}
	const driverValue = process.env.DATABASE_DRIVER;
	const driver =
		driverValue === 'neon' || driverValue === 'pglite'
			? driverValue
			: url.startsWith('pglite://')
				? 'pglite'
				: 'neon';
	const refusal = checkSeedTarget({ url, driver, confirm: process.env.SEED_DEV_CONFIRM });
	if (refusal) {
		console.error(refusal);
		return 2;
	}
	const db = await createDb({ url, driver });
	try {
		if (driver === 'pglite') {
			// A local PGlite directory has no other migration path: bring it up to
			// date first (a no-op when it already is). Neon uses `npm run db:migrate`.
			const { migrate } = await import('drizzle-orm/pglite/migrator');
			await migrate(db as unknown as Parameters<typeof migrate>[0], {
				migrationsFolder: './drizzle'
			});
		}
		const created = await seedDev(db, createLogger({ level: 'warn' }));
		console.log(created.length > 0 ? `Seeded:\n  ${created.join('\n  ')}` : 'Already seeded.');
		console.log(`Sign in as ${SEED_ADMIN_EMAIL} or ${SEED_MEMBER_EMAIL} with ${SEED_PASSWORD}`);
		return 0;
	} finally {
		await closeDb(db);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().then(
		(code) => {
			process.exitCode = code;
		},
		(error: unknown) => {
			console.error(error instanceof Error ? error.message : String(error));
			if (error instanceof Error && error.cause instanceof Error)
				console.error(error.cause.message);
			process.exitCode = 1;
		}
	);
}
