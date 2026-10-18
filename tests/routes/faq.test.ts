import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { load } from '../../src/routes/(marketing)/faq/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { faq_items } = schema;

type LoadEvent = Parameters<typeof load>[0];
/** `load` is typed to allow `void`; this load always returns its page data. */
type FaqData = import('../../src/routes/(marketing)/faq/$types').PageServerData;

function run(services: TestServices) {
	return load(
		fakeEvent({ url: '/faq', locals: { services } }) as unknown as LoadEvent
	) as Promise<FaqData>;
}

describe('/faq load', () => {
	const { db } = useTestDb();
	let services: TestServices;

	beforeEach(() => {
		services = createTestServices(db());
	});

	it('groups published items by category, ordered by category then order_index', async () => {
		await db()
			.insert(faq_items)
			.values([
				{
					question: 'Refunds?',
					answer: 'Yes',
					category: 'Payment',
					order_index: 2,
					is_published: true
				},
				{
					question: 'Devices?',
					answer: 'Any',
					category: 'Access',
					order_index: 1,
					is_published: true
				},
				{
					question: 'Cards?',
					answer: 'All',
					category: 'Payment',
					order_index: 1,
					is_published: true
				},
				{
					question: 'Login?',
					answer: 'Email',
					category: 'Access',
					order_index: 0,
					is_published: true
				},
				{
					question: 'Hidden?',
					answer: 'No',
					category: 'Access',
					order_index: 3,
					is_published: false
				},
				{
					question: 'Anything else?',
					answer: 'Ask',
					category: null,
					order_index: 0,
					is_published: true
				}
			]);

		const data = await run(services);

		expect(
			data.groups.map((group) => [group.category, group.items.map((item) => item.question)])
		).toEqual([
			['Access', ['Login?', 'Devices?']],
			['Payment', ['Cards?', 'Refunds?']],
			[null, ['Anything else?']]
		]);
	});

	it('renders answer_html when present and the sanitised legacy answer otherwise', async () => {
		await db()
			.insert(faq_items)
			.values([
				{
					question: 'Markdown?',
					answer: 'stale legacy text',
					answer_md: '**New**',
					answer_html: '<p><strong>New</strong></p>',
					category: 'General',
					order_index: 0,
					is_published: true
				},
				{
					question: 'Legacy?',
					answer: '<p onclick="steal()">Old <em>answer</em></p><script>steal()</script>',
					category: 'General',
					order_index: 1,
					is_published: true
				}
			]);

		const data = await run(services);
		const [markdown, legacy] = data.groups[0].items;

		expect(markdown.html).toBe('<p><strong>New</strong></p>');
		expect(legacy.html).toContain('<em>answer</em>');
		expect(legacy.html).not.toMatch(/<script|onclick/);
	});
});
