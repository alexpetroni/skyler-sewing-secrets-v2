import type { ShopLesson, ShopProduct } from '#lib/components/shop/types.ts';
import type { CatalogProduct, ProductLesson } from '#lib/server/modules/catalog/index.ts';
import type { CartQuote, CartState, CartViewer } from '#lib/server/modules/commerce/index.ts';
import { lessonHref } from '#lib/shared/lessons.ts';

/**
 * Shop page helpers: the catalogue and product views, with the viewer's
 * ownership (one entitlement query) and what the cart cookie already holds.
 * Prices come from the catalog service; nothing is priced here.
 */

export interface ShopCard {
	product: ShopProduct;
	owned: boolean;
	inCart: boolean;
}

export interface CataloguePage {
	flagship: ShopCard | null;
	bundles: ShopCard[];
	singles: ShopCard[];
}

export interface ProductPage extends ShopCard {
	descriptionHtml: string | null;
	isFlagship: boolean;
	/** Bundles and singles: the published lessons the product lists. */
	lessons: ShopLesson[];
	/** The flagship: the course outline, by module. */
	outline: { title: string; lessons: ShopLesson[] }[];
}

function toShopProduct(product: CatalogProduct): ShopProduct {
	return {
		id: product.id,
		slug: product.slug,
		kind: product.kind,
		title: product.title,
		tagline: product.tagline,
		coverImageUrl: product.cover_image_url,
		itemCount: product.itemCount,
		durationSeconds: product.durationSeconds,
		pricing: product.pricing
	};
}

function toShopLesson(lesson: ProductLesson): ShopLesson {
	return {
		id: lesson.id,
		title: lesson.title,
		durationSeconds: lesson.durationSeconds,
		previewHref: lesson.isFreePreview ? lessonHref(lesson.moduleSlug, lesson.slug) : null
	};
}

/**
 * Whether the viewer owns a product: an active entitlement to it, or to the
 * all-access course, which includes everything the catalogue sells. The same
 * rule the cart applies when it drops owned products.
 */
async function ownership(locals: App.Locals): Promise<(productId: string) => boolean> {
	const { user, services } = locals;
	if (!user) return () => false;
	const [ids, allAccess] = await Promise.all([
		services.entitlements.ownedProductIds(user.id),
		services.entitlements.hasAllAccess(user.id)
	]);
	const owned = new Set(ids);
	return (productId) => allAccess || owned.has(productId);
}

/** Published products, the flagship first, then bundles, then singles, in catalogue order. */
export async function cataloguePage(
	locals: App.Locals,
	cartItems: readonly string[],
	now = new Date()
): Promise<CataloguePage> {
	const products = await locals.services.catalog.listPublished({ now });
	const flagship = products.find((product) => product.access_scope === 'all');
	const owns = await ownership(locals);
	const card = (product: CatalogProduct): ShopCard => ({
		product: toShopProduct(product),
		owned: owns(product.id),
		inCart: cartItems.includes(product.id)
	});
	const others = products.filter((product) => product !== flagship);
	return {
		flagship: flagship ? card(flagship) : null,
		bundles: others.filter((product) => product.kind === 'bundle').map(card),
		singles: others.filter((product) => product.kind === 'single').map(card)
	};
}

/** A published product by slug; null when unknown or unpublished. */
export async function productPage(
	locals: App.Locals,
	slug: string,
	cartItems: readonly string[],
	now = new Date()
): Promise<ProductPage | null> {
	const product = await locals.services.catalog.getPublishedBySlug(slug, now);
	if (!product) return null;
	const isFlagship = product.access_scope === 'all';
	const owns = await ownership(locals);
	const published = product.lessons.filter((lesson) => lesson.isPublished);

	const outline: ProductPage['outline'] = [];
	if (isFlagship) {
		for (const lesson of published) {
			const last = outline.at(-1);
			if (last && last.title === lesson.moduleTitle) last.lessons.push(toShopLesson(lesson));
			else outline.push({ title: lesson.moduleTitle ?? '', lessons: [toShopLesson(lesson)] });
		}
	}

	return {
		product: toShopProduct(product),
		owned: owns(product.id),
		inCart: cartItems.includes(product.id),
		descriptionHtml: product.description_html,
		isFlagship,
		lessons: isFlagship ? [] : published.map(toShopLesson),
		outline
	};
}

export interface CartPage {
	quote: CartQuote;
	/** The course the summary suggests, when `quote.suggestFlagship`. */
	flagship: { id: string; slug: string; title: string; price: number } | null;
}

/** The signed-in buyer the cart resolves ownership against. */
export function cartViewer(locals: App.Locals): CartViewer {
	return locals.user ? { id: locals.user.id } : null;
}

/** The quoted cart, plus the course to suggest when the quote asks for it. */
export async function cartPage(
	locals: App.Locals,
	state: CartState,
	now = new Date()
): Promise<CartPage> {
	const { commerce, catalog } = locals.services;
	const quote = await commerce.cart.quote(state, cartViewer(locals), now);
	if (!quote.suggestFlagship) return { quote, flagship: null };
	const courses = await catalog.listPublished({ kind: 'course', now });
	const course = courses.find((product) => product.access_scope === 'all');
	return {
		quote,
		flagship: course
			? { id: course.id, slug: course.slug, title: course.title, price: course.pricing.price }
			: null
	};
}
