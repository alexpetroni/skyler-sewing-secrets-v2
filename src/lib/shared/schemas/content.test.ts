import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { lessonInputSchema, moduleInputSchema, reorderSchema } from './content.ts';

const lesson = {
	moduleId: null,
	title: 'Pinning',
	slug: 'pinning',
	kind: 'video',
	mediaAssetId: '5b8c1a8e-2f7c-4c5e-9a43-0f3e6c1d2b7a',
	description: 'How to pin',
	contentMd: '## Pins',
	isFreePreview: false,
	isPublished: true,
	orderIndex: 0
};

const issuesFor = (schema: v.GenericSchema, input: unknown) => {
	const result = v.safeParse(schema, input);
	// Unique paths: an empty slug fails both `nonEmpty` and the pattern.
	return result.success ? [] : [...new Set(result.issues.map((issue) => v.getDotPath(issue)))];
};

describe('lessonInputSchema', () => {
	it('accepts a valid lesson and trims text fields', () => {
		const output = v.parse(lessonInputSchema, { ...lesson, title: '  Pinning  ' });
		expect(output).toEqual({ ...lesson, title: 'Pinning' });
	});

	it('enforces the slug pattern', () => {
		for (const slug of ['Pinning', 'pin ning', 'pin_ning', 'épingle', '']) {
			expect(issuesFor(lessonInputSchema, { ...lesson, slug })).toEqual(['slug']);
		}
		expect(issuesFor(lessonInputSchema, { ...lesson, slug: 'pin-2' })).toEqual([]);
	});

	it('bounds title, description and content length', () => {
		expect(issuesFor(lessonInputSchema, { ...lesson, title: '' })).toEqual(['title']);
		expect(issuesFor(lessonInputSchema, { ...lesson, title: 'x'.repeat(201) })).toEqual(['title']);
		expect(issuesFor(lessonInputSchema, { ...lesson, title: 'x'.repeat(200) })).toEqual([]);
		expect(issuesFor(lessonInputSchema, { ...lesson, description: 'x'.repeat(2001) })).toEqual([
			'description'
		]);
		expect(issuesFor(lessonInputSchema, { ...lesson, contentMd: 'x'.repeat(50_001) })).toEqual([
			'contentMd'
		]);
		expect(issuesFor(lessonInputSchema, { ...lesson, contentMd: 'x'.repeat(50_000) })).toEqual([]);
	});

	it('requires a whole, non-negative order index and uuid ids', () => {
		expect(issuesFor(lessonInputSchema, { ...lesson, orderIndex: -1 })).toEqual(['orderIndex']);
		expect(issuesFor(lessonInputSchema, { ...lesson, orderIndex: 1.5 })).toEqual(['orderIndex']);
		expect(issuesFor(lessonInputSchema, { ...lesson, moduleId: 'basics' })).toEqual(['moduleId']);
		expect(issuesFor(lessonInputSchema, { ...lesson, mediaAssetId: '42' })).toEqual([
			'mediaAssetId'
		]);
		expect(issuesFor(lessonInputSchema, { ...lesson, kind: 'podcast' })).toEqual(['kind']);
	});
});

describe('moduleInputSchema', () => {
	const module = { title: 'Basics', slug: 'basics', orderIndex: 1 };

	it('fills defaults for optional fields', () => {
		expect(v.parse(moduleInputSchema, module)).toEqual({
			...module,
			description: '',
			thumbnailUrl: '',
			isPublished: false,
			isBonus: false,
			isCourseContent: true
		});
	});

	it('accepts only https thumbnails', () => {
		expect(
			issuesFor(moduleInputSchema, { ...module, thumbnailUrl: 'http://cdn.example.com/a.jpg' })
		).toEqual(['thumbnailUrl']);
		expect(
			issuesFor(moduleInputSchema, { ...module, thumbnailUrl: 'https://cdn.example.com/a.jpg' })
		).toEqual([]);
	});
});

describe('reorderSchema', () => {
	it('requires a non-empty list of uuids', () => {
		expect(issuesFor(reorderSchema, { ids: [] })).toEqual(['ids']);
		expect(issuesFor(reorderSchema, { ids: ['nope'] })).toEqual(['ids.0']);
	});
});
