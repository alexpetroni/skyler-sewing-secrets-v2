import { schema, type Db } from '../../src/lib/server/db/index.ts';
import type { Product } from '../../src/lib/server/modules/catalog/index.ts';
import type { ProductInput } from '../../src/lib/shared/schemas/catalog.ts';
import { createTestServices, type TestServices } from './services.ts';

const { media_assets } = schema;

/** The password every seeded user signs in with. */
export const FIXTURE_PASSWORD = 'a-good-password';

export interface SeededCatalog {
	services: TestServices;
	/** The all-access course. */
	flagship: Product;
	/** Two course lessons. */
	bundle: Product;
	/** The standalone lesson. */
	single: Product;
	moduleId: string;
	lessons: { first: string; second: string; standalone: string };
	users: {
		/** Owns the flagship through an entitlement (`is_member` synced). */
		member: { id: string; email: string };
		/** Owns the bundle only. */
		bundleOwner: { id: string; email: string };
		/** Signed up, owns nothing. */
		nobody: { id: string; email: string };
	};
}

function productInput(overrides: Partial<ProductInput> & Pick<ProductInput, 'kind' | 'slug'>) {
	return {
		title: overrides.slug,
		tagline: '',
		descriptionMd: `About ${overrides.slug}`,
		coverImageUrl: `https://cdn.example.com/${overrides.slug}.jpg`,
		price: 2900,
		salePrice: null,
		saleStartsAt: null,
		saleEndsAt: null,
		isFeatured: false,
		sortOrder: 0,
		...overrides
	};
}

/**
 * A published catalogue for route tests: the flagship course, one bundle of
 * two course lessons, one single over a standalone lesson, and three users
 * (all-access member, bundle owner, nobody). Every lesson is a published
 * video with a `ready` asset.
 */
export async function seedCatalog(db: Db): Promise<SeededCatalog> {
	const services = createTestServices(db);
	const { catalog, content, entitlements, users } = services;

	let videoSequence = 0;
	async function readyAsset(): Promise<string> {
		videoSequence += 1;
		const [asset] = await db
			.insert(media_assets)
			.values({
				library_id: '100',
				video_id: `fixture-video-${videoSequence}`,
				status: 'ready',
				duration_seconds: 600
			})
			.returning();
		return asset.id;
	}

	async function lesson(moduleId: string | null, slug: string, orderIndex: number) {
		const row = await content.lessons.create({
			moduleId,
			title: slug,
			slug,
			kind: 'video',
			mediaAssetId: await readyAsset(),
			description: '',
			contentMd: '',
			isFreePreview: false,
			isPublished: true,
			orderIndex
		});
		return row.id;
	}

	const module = await content.modules.create({
		title: 'Basics',
		slug: 'basics',
		description: '',
		thumbnailUrl: '',
		orderIndex: 0,
		isPublished: true,
		isBonus: false,
		isCourseContent: true
	});
	const lessons = {
		first: await lesson(module.id, 'first-lesson', 0),
		second: await lesson(module.id, 'second-lesson', 1),
		standalone: await lesson(null, 'standalone-video', 0)
	};

	const flagship = await catalog.create(
		productInput({ kind: 'course', slug: 'the-course', price: 14900, isFeatured: true })
	);
	const bundle = await catalog.create(productInput({ kind: 'bundle', slug: 'basics-bundle' }));
	await catalog.setItems(bundle.id, [lessons.first, lessons.second]);
	const single = await catalog.create(
		productInput({ kind: 'single', slug: 'standalone-video', price: 900 })
	);
	await catalog.setItems(single.id, [lessons.standalone]);

	// Sequential on purpose: PGlite runs one transaction at a time.
	const publishedFlagship = await catalog.publish(flagship.id);
	const publishedBundle = await catalog.publish(bundle.id);
	const publishedSingle = await catalog.publish(single.id);

	async function user(email: string, fullName: string) {
		return {
			id: await users.createCredentialUser({ email, password: FIXTURE_PASSWORD, fullName }),
			email
		};
	}
	const member = await user('member@example.com', 'Member');
	const bundleOwner = await user('bundle-owner@example.com', 'Bundle Owner');
	const nobody = await user('nobody@example.com', 'Nobody');

	await entitlements.grant({ userId: member.id, productId: flagship.id, source: 'migration' });
	await entitlements.grant({ userId: bundleOwner.id, productId: bundle.id, source: 'purchase' });

	return {
		services,
		flagship: publishedFlagship,
		bundle: publishedBundle,
		single: publishedSingle,
		moduleId: module.id,
		lessons,
		users: { member, bundleOwner, nobody }
	};
}
