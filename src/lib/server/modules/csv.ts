/** CSV exports shared by modules (newsletter subscribers, promo redemptions). */

const FORMULA_PREFIXES = ['=', '+', '-', '@'];

/** One CSV cell: always quoted, quotes doubled, leading formula characters prefixed with `'`. */
export function csvCell(value: string | number | boolean | null): string {
	let text = value === null ? '' : String(value);
	if (FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) text = `'${text}`;
	return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(
	rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null>>
): string {
	return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
