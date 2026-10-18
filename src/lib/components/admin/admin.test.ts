import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DataTable from './DataTable.svelte';
import Stat from './Stat.svelte';
import type { DataTableColumn } from './types.ts';

interface Row {
	email: string;
	total: number;
}

const columns: DataTableColumn<Row>[] = [
	{ key: 'email', label: 'Buyer', sortValue: (row) => row.email },
	{ key: 'status', label: 'Status' },
	{ key: 'total', label: 'Total', align: 'right', sortValue: (row) => row.total }
];

const row = createRawSnippet((item: () => Row) => ({
	render: () => `<tr class="data-row"><td>${item().email}</td><td>${item().total}</td></tr>`
}));

describe('DataTable', () => {
	it('renders the header with sort toggles and one row per item through the row snippet', () => {
		const rows: Row[] = [
			{ email: 'b@example.com', total: 900 },
			{ email: 'a@example.com', total: 2900 }
		];
		const { body } = render(DataTable<Row>, { props: { columns, rows, row } });

		expect(body.match(/<th\b/g)).toHaveLength(3);
		// Sortable columns get a button and aria-sort; the plain one does not.
		expect(body.match(/aria-sort="none"/g)).toHaveLength(2);
		expect(body).toMatch(/<button[^>]*type="button"[^>]*>\s*Buyer/);
		// Svelte's hydration markers (`<!--…-->`) sit around the plain label.
		expect(body).toMatch(/<th[^>]*>(?:<!--[^>]*-->)*Status(?:<!--[^>]*-->)*<\/th>/);
		expect(body).toMatch(/<th[^>]*class="[^"]*\btext-right\b[^"]*"[^>]*>/);
		// Rows keep the server's order until a header is clicked.
		expect([...body.matchAll(/<tr class="data-row"><td>([^<]+)<\/td>/g)].map((m) => m[1])).toEqual([
			'b@example.com',
			'a@example.com'
		]);
		expect(body).not.toContain('aria-label="Pagination"');
	});

	it('shows the empty message across every column when there are no rows', () => {
		const { body } = render(DataTable<Row>, {
			props: { columns, rows: [], row, empty: 'No orders found.' }
		});
		expect(body).toMatch(/<td colspan="3"[^>]*>\s*No orders found\.\s*<\/td>/);
		expect(body).not.toContain('data-row');
	});

	it('renders previous and next links from the pagination props', () => {
		const { body } = render(DataTable<Row>, {
			props: {
				columns,
				rows: [{ email: 'a@example.com', total: 100 }],
				row,
				pagination: {
					page: 2,
					pageCount: 3,
					total: 60,
					href: (page: number) => `/admin/orders?page=${page}`
				}
			}
		});
		expect(body).toContain('Page 2 of 3 · 60 total');
		expect(body).toMatch(/<a[^>]*href="\/admin\/orders\?page=1"[^>]*>Previous<\/a>/);
		expect(body).toMatch(/<a[^>]*href="\/admin\/orders\?page=3"[^>]*>Next<\/a>/);

		const last = render(DataTable<Row>, {
			props: {
				columns,
				rows: [],
				row,
				pagination: { page: 3, pageCount: 3, total: 60, href: (page: number) => `?page=${page}` }
			}
		});
		expect(last.body).toContain('Previous');
		expect(last.body).not.toContain('>Next<');
	});
});

describe('Stat', () => {
	it('renders the label, value and hint, linked when given an href', () => {
		const linked = render(Stat, {
			props: { label: 'Revenue', value: '£192.00', hint: '£13.00 refunded', href: '/admin/orders' }
		}).body;
		expect(linked).toMatch(/<a[^>]*href="\/admin\/orders"/);
		expect(linked).toContain('Revenue');
		expect(linked).toContain('£192.00');
		expect(linked).toContain('£13.00 refunded');

		const plain = render(Stat, { props: { label: 'Orders', value: 4 } }).body;
		expect(plain).not.toContain('<a');
		expect(plain).toContain('>4<');
	});
});
