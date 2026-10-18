/**
 * Money helpers. All amounts in the application are integer pence; this is the
 * only place that formats them for display or parses user-entered pounds.
 */

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
	let f = formatters.get(currency);
	if (!f) {
		f = new Intl.NumberFormat('en-GB', {
			style: 'currency',
			currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
		formatters.set(currency, f);
	}
	return f;
}

/** Formats integer pence as a currency string in en-GB, e.g. `14900` → `'£149.00'`. */
export function formatPence(pence: number, currency = 'GBP'): string {
	return formatter(currency).format(pence / 100);
}

// At most ten whole-pound digits: the largest accepted amount (£9,999,999,999.99) is
// still a safe integer in pence, so every later price form keeps the integer-pence invariant.
const POUNDS = /^(\d{1,10})(?:\.(\d{1,2}))?$/;

/**
 * Parses a pounds amount typed by a user (`'149'`, `'149.5'`, `'149.50'`) into
 * integer pence. Returns `null` for anything else: negatives, more than two
 * decimals, more than ten whole-pound digits, empty or non-numeric input.
 */
export function parsePounds(input: string): number | null {
	const match = POUNDS.exec(input.trim());
	if (!match) return null;
	const [, whole, fraction = ''] = match;
	const pence = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
	return Number.isSafeInteger(pence) ? pence : null;
}
