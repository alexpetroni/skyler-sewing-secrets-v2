import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import LessonResources from './LessonResources.svelte';
import LessonSidebar from './LessonSidebar.svelte';
import LockedLesson from './LockedLesson.svelte';
import VideoPlayer from './VideoPlayer.svelte';
import type { UnlockOffer } from './types.ts';

const SINGLE: UnlockOffer = {
	slug: 'standalone-video',
	title: 'Standalone video',
	kind: 'single',
	pricing: { price: 900, listPrice: 900, onSale: false }
};

const FLAGSHIP: UnlockOffer = {
	slug: 'the-course',
	title: 'The course',
	kind: 'course',
	pricing: { price: 9900, listPrice: 14900, onSale: true }
};

describe('LockedLesson', () => {
	it('shows the cheapest product and the flagship with prices and product links', () => {
		const { body } = render(LockedLesson, {
			props: {
				title: 'Pressing seams',
				description: 'Why the iron matters.',
				cheapest: SINGLE,
				flagship: FLAGSHIP,
				signInHref: '/auth/sign-in?redirectTo=%2Fvideos%2Fpressing'
			}
		});

		expect(body).toContain('Pressing seams');
		expect(body).toContain('Why the iron matters.');
		expect(body).toContain('href="/products/standalone-video"');
		expect(body).toContain('This video');
		expect(body).toContain('£9.00');
		expect(body).toContain('href="/products/the-course"');
		expect(body).toContain('Full course');
		expect(body).toContain('£99.00');
		expect(body).toContain('<s class="text-[13px] text-charcoal-400">£149.00</s>');
		expect(body).toContain('href="/auth/sign-in?redirectTo=%2Fvideos%2Fpressing"');
	});

	it('lists the flagship once when it is the cheapest option and omits sign-in when signed in', () => {
		const { body } = render(LockedLesson, {
			props: {
				title: 'Bonus lesson',
				description: null,
				cheapest: FLAGSHIP,
				flagship: FLAGSHIP,
				signInHref: null
			}
		});

		expect(body.match(/href="\/products\/the-course"/g)).toHaveLength(1);
		expect(body).not.toContain('Sign in');
		expect(body).not.toContain('/checkout');
	});
});

describe('VideoPlayer', () => {
	it('appends the resume point to the signed embed URL', () => {
		const { body } = render(VideoPlayer, {
			props: { embedUrl: 'https://iframe.mediadelivery.net/embed/1/v?token=t', startAt: 95.6 }
		});
		expect(body).toContain('src="https://iframe.mediadelivery.net/embed/1/v?token=t&amp;t=95"');
	});

	it('plays from the start without a resume point', () => {
		const { body } = render(VideoPlayer, {
			props: { embedUrl: 'https://iframe.mediadelivery.net/embed/1/v?token=t' }
		});
		expect(body).toContain('src="https://iframe.mediadelivery.net/embed/1/v?token=t"');
	});
});

describe('LessonResources', () => {
	it('links each resource through the download route, never to the file', () => {
		const { body } = render(LessonResources, {
			props: {
				resources: [
					{ id: 'r1', title: 'Pattern', fileType: 'application/pdf', fileSizeBytes: 2048 }
				]
			}
		});
		expect(body).toContain('href="/download/r1"');
		expect(body).toContain('Pattern');
		expect(body).toContain('2.0 KB');
	});
});

describe('LessonSidebar', () => {
	it('links locked lessons to their page with a lock and drops the link when suspended', () => {
		const { body } = render(LessonSidebar, {
			props: {
				title: 'Basics',
				backHref: '/modules/basics',
				backLabel: 'Back to module',
				currentLessonId: 'a',
				lessons: [
					{
						id: 'a',
						title: 'Open one',
						href: '/modules/basics/a',
						durationSeconds: 600,
						lockState: 'open',
						completed: true
					},
					{
						id: 'b',
						title: 'Locked one',
						href: '/modules/basics/b',
						durationSeconds: 600,
						lockState: 'locked',
						completed: false
					},
					{
						id: 'c',
						title: 'Suspended one',
						href: '/modules/basics/c',
						durationSeconds: null,
						lockState: 'suspended',
						completed: false
					}
				],
				showProgress: true
			}
		});
		expect(body).toContain('href="/modules/basics/a"');
		expect(body).toContain('href="/modules/basics/b"');
		expect(body).not.toContain('href="/modules/basics/c"');
		expect(body.match(/aria-label="Locked"/g)).toHaveLength(2);
		expect(body).toContain('1/3 completed');
	});
});
