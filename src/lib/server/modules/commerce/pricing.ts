import { PRICE_MIN } from '#lib/shared/schemas/catalog.ts';

/**
 * The money math (docs/analysis/05-discounts.md → Cart arithmetic). Pure:
 * no database, no clock. Sale state arrives resolved per line (`onSale`),
 * and the time/cap part of a code's validity is decided by
 * `promo.findValidByCode`; this file decides what a valid rule is worth.
 */

export type PromoRejection =
	| 'not_found'
	| 'inactive'
	| 'not_started'
	| 'expired'
	| 'cap_reached'
	| 'user_cap_reached'
	| 'not_eligible'
	| 'below_minimum';

/** The part of a `promo_codes` row the arithmetic needs. */
export interface PromoRule {
	id: string;
	code: string;
	discountType: 'percentage' | 'fixed';
	/** Whole percent (1–99) or pence (≥ 1). */
	discountValue: number;
	appliesTo: 'all' | 'products';
	/** Scope when `appliesTo = 'products'`; ignored otherwise. */
	productIds: readonly string[];
	/** The eligible-lines subtotal must reach it; null = no minimum. */
	minSubtotal: number | null;
	/** `false` (the default): a line already on sale is not eligible for the code. */
	stackableWithSale: boolean;
}

export interface QuoteInputLine {
	productId: string;
	title: string;
	/** The full price in pence. */
	listPrice: number;
	/** What the buyer pays before any code: the sale price while a sale runs. */
	effectivePrice: number;
	onSale: boolean;
}

export interface QuoteLine extends QuoteInputLine {
	/** Pence the code takes off this line. */
	discount: number;
	/** `effectivePrice − discount`, never below the Stripe minimum. */
	unitAmount: number;
}

export interface Quote {
	lines: QuoteLine[];
	/** Σ `effectivePrice`. */
	subtotal: number;
	/** Σ `discount`. */
	discountTotal: number;
	/** Σ `unitAmount` = `subtotal − discountTotal`. */
	total: number;
	/** The code that was applied; null when none was given or it was rejected. */
	promo: { code: string; id: string } | null;
	rejection: PromoRejection | null;
}

export interface QuoteInput {
	lines: QuoteInputLine[];
	promo?: PromoRule | null;
}

/** Stripe refuses GBP line items under 30p; a discounted line is clamped to it. */
export const STRIPE_MINIMUM_PENCE = PRICE_MIN;

/**
 * Which lines a rule can discount: all of them, or those in its product
 * scope; minus the lines on sale unless the rule stacks with sales. Shared
 * with `promo.findValidByCode` so "eligible" means one thing.
 */
export function eligibleLines<L extends Pick<QuoteInputLine, 'productId' | 'onSale'>>(
	lines: readonly L[],
	rule: Pick<PromoRule, 'appliesTo' | 'productIds' | 'stackableWithSale'>
): L[] {
	const scope = rule.appliesTo === 'products' ? new Set(rule.productIds) : null;
	return lines.filter(
		(line) =>
			(scope === null || scope.has(line.productId)) && (rule.stackableWithSale || !line.onSale)
	);
}

export function sumEffectivePrice(
	lines: readonly Pick<QuoteInputLine, 'effectivePrice'>[]
): number {
	return lines.reduce((sum, line) => sum + line.effectivePrice, 0);
}

/**
 * The scope and minimum checks a rule makes against a cart, with no clock or
 * database: `not_eligible` when no line qualifies, `below_minimum` when the
 * eligible subtotal is under `minSubtotal`. Null when the rule is applicable.
 */
export function checkEligibility(
	lines: readonly Pick<QuoteInputLine, 'productId' | 'onSale' | 'effectivePrice'>[],
	rule: Pick<PromoRule, 'appliesTo' | 'productIds' | 'stackableWithSale' | 'minSubtotal'>
): Extract<PromoRejection, 'not_eligible' | 'below_minimum'> | null {
	const eligible = eligibleLines(lines, rule);
	if (eligible.length === 0) return 'not_eligible';
	if (rule.minSubtotal !== null && sumEffectivePrice(eligible) < rule.minSubtotal) {
		return 'below_minimum';
	}
	return null;
}

function undiscounted(lines: QuoteInputLine[]): QuoteLine[] {
	return lines.map((line) => ({ ...line, discount: 0, unitAmount: line.effectivePrice }));
}

function finish(
	lines: QuoteLine[],
	promo: Quote['promo'],
	rejection: PromoRejection | null
): Quote {
	const subtotal = sumEffectivePrice(lines);
	const discountTotal = lines.reduce((sum, line) => sum + line.discount, 0);
	const total = lines.reduce((sum, line) => sum + line.unitAmount, 0);
	return { lines, subtotal, discountTotal, total, promo, rejection };
}

/**
 * Raw per-line discounts for the eligible lines, before the Stripe floor:
 * percentage rounds each line; fixed caps at the eligible subtotal, splits pro
 * rata with floor, and puts the rounding remainder on the most expensive
 * eligible line so the parts sum to the cap exactly.
 */
function rawDiscounts(eligible: QuoteInputLine[], rule: PromoRule): Map<string, number> {
	const result = new Map<string, number>();
	if (rule.discountType === 'percentage') {
		for (const line of eligible) {
			result.set(line.productId, Math.round((line.effectivePrice * rule.discountValue) / 100));
		}
		return result;
	}
	const eligibleSubtotal = sumEffectivePrice(eligible);
	const cap = Math.min(rule.discountValue, eligibleSubtotal);
	let distributed = 0;
	let dearest = eligible[0];
	for (const line of eligible) {
		const share = Math.floor((cap * line.effectivePrice) / eligibleSubtotal);
		result.set(line.productId, share);
		distributed += share;
		if (line.effectivePrice > dearest.effectivePrice) dearest = line;
	}
	result.set(dearest.productId, (result.get(dearest.productId) ?? 0) + (cap - distributed));
	return result;
}

/**
 * Prices a cart, applying at most one code. The rule is assumed to have
 * passed the time and cap checks; this function decides eligibility, the
 * minimum, the arithmetic and the Stripe floor, and rejects a code that
 * would take nothing off. Invariant: Σ `lines[].unitAmount` = `total`.
 */
export function computeQuote({ lines, promo }: QuoteInput): Quote {
	if (!promo) return finish(undiscounted(lines), null, null);

	const rejection = checkEligibility(lines, promo);
	if (rejection) return finish(undiscounted(lines), null, rejection);

	const eligibleIds = new Set(eligibleLines(lines, promo).map((line) => line.productId));
	const discounts = rawDiscounts(
		lines.filter((line) => eligibleIds.has(line.productId)),
		promo
	);

	const quoted = lines.map((line): QuoteLine => {
		const raw = discounts.get(line.productId) ?? 0;
		// Clamp to the Stripe minimum; the pence that cannot be taken off are dropped.
		const discount = Math.max(0, Math.min(raw, line.effectivePrice - STRIPE_MINIMUM_PENCE));
		return { ...line, discount, unitAmount: line.effectivePrice - discount };
	});

	if (quoted.every((line) => line.discount === 0)) {
		return finish(undiscounted(lines), null, 'not_eligible');
	}
	return finish(quoted, { code: promo.code, id: promo.id }, null);
}
