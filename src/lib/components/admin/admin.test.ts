import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DataTable from './DataTable.svelte';
import MarkdownEditor from './MarkdownEditor.svelte';
import MediaPicker from './MediaPicker.svelte';
import Stat from './Stat.svelte';
import type { DataTableColumn, PickerAsset } from './types.ts';

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

const assets: PickerAsset[] = [
	{
		id: '11111111-1111-4111-8111-111111111111',
		title: 'Bias binding',
		status: 'ready',
		duration_seconds: 845,
		thumbnail_url: 'https://fake.b-cdn.net/a/thumbnail.jpg'
	},
	{
		id: '22222222-2222-4222-8222-222222222222',
		title: 'Collars',
		status: 'processing',
		duration_seconds: null,
		thumbnail_url: null
	},
	{
		id: '33333333-3333-4333-8333-333333333333',
		title: 'Broken upload',
		status: 'failed',
		duration_seconds: null,
		thumbnail_url: null
	}
];

describe('MediaPicker', () => {
	it('shows the selected asset with thumbnail, duration and status in a hidden field', () => {
		const { body } = render(MediaPicker, {
			props: { assets, selectedId: assets[0].id }
		});
		expect(body).toMatch(
			new RegExp(`<input type="hidden" name="mediaAssetId" value="${assets[0].id}"`)
		);
		expect(body).toContain('src="https://fake.b-cdn.net/a/thumbnail.jpg"');
		expect(body).toContain('14:05');
		expect(body).toMatch(/>\s*(?:<!--[^>]*-->)*\s*Ready\s*(?:<!--[^>]*-->)*\s*</);
		// The drawer is closed until asked for.
		expect(body).not.toContain('role="dialog"');
	});

	it('renders a status badge per asset in the open drawer, with import and upload entry points', () => {
		const { body } = render(MediaPicker, { props: { assets, open: true } });
		expect(body).toContain('role="dialog"');
		expect(body).toMatch(/<input type="hidden" name="mediaAssetId" value=""/);
		const badges = [
			...body.matchAll(
				/<span[^>]*ring-1[^>]*>(?:<!--[^>]*-->|\s)*(Ready|Processing|Failed|Uploading)\b/g
			)
		].map((match) => match[1]);
		expect(badges).toEqual(['Ready', 'Processing', 'Failed']);
		expect(body).toContain('href="/admin/media/import"');
		expect(body).toContain('href="/admin/media/upload"');
		expect(body).toContain('No video attached.');
	});
});

describe('MarkdownEditor', () => {
	it('renders the textarea with the saved Markdown and the saved HTML in the preview region', () => {
		const { body } = render(MarkdownEditor, {
			props: {
				name: 'contentMd',
				label: 'Content',
				value: 'Cut on the **bias**.',
				html: '<p>Cut on the <strong>bias</strong>.</p>'
			}
		});
		expect(body).toMatch(
			/<textarea[^>]*name="contentMd"[^>]*>Cut on the \*\*bias\*\*\.<\/textarea>/
		);
		expect(body).toMatch(/<section[^>]*aria-label="Preview"[^>]*data-markdown-preview/);
		expect(body).toContain('<p>Cut on the <strong>bias</strong>.</p>');
	});

	it('shows the placeholder in the preview region and the error under the field', () => {
		const { body } = render(MarkdownEditor, {
			props: { name: 'contentMd', label: 'Content', error: 'Content is too long' }
		});
		expect(body).toMatch(/<textarea[^>]*aria-invalid="true"/);
		expect(body).toContain('The preview appears here as you type.');
		expect(body).toContain('Content is too long');
	});
});
