<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { untrack } from 'svelte';
	import AdminPage from '#lib/components/admin/AdminPage.svelte';
	import Form from '#lib/components/admin/Form.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import { slugify } from '#lib/shared/slug.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let title = $state(untrack(() => data.lesson?.title ?? ''));
	let slug = $state(untrack(() => (data.lesson ? slugify(data.lesson.title) : '')));
	// The slug follows the title until the admin edits it.
	let slugEdited = $state(false);

	function onTitleInput() {
		if (!slugEdited) slug = slugify(title);
	}
</script>

<AdminPage
	title="New Product"
	description="Start with the basics; contents, pricing and visibility are on the next page."
>
	{#snippet actions()}
		<a href="/admin/catalogue" class="btn-ghost btn-sm">All products</a>
	{/snippet}

	<Form form={data.form} action="?/create" resetForm={false}>
		{#snippet children({ errors, submitting })}
			<Card>
				<div class="space-y-6">
					{#if data.lesson}
						<input type="hidden" name="lessonId" value={data.lesson.id} />
						<p class="text-sm text-gray-600">
							Sells the video <span class="font-medium text-gray-900">{data.lesson.title}</span>.
						</p>
					{/if}
					<div class="grid grid-cols-1 gap-6 sm:grid-cols-3">
						<Select label="Kind" name="kind" value={data.kind} error={errors.kind?.[0]}>
							<option value="bundle">Bundle (two or more videos)</option>
							<option value="single">Single video</option>
						</Select>
						<Input
							label="Price (£)"
							name="price"
							inputmode="decimal"
							placeholder="29.00"
							required
							error={errors.price?.[0]}
						/>
					</div>
					<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<Input
							label="Title"
							name="title"
							required
							bind:value={title}
							oninput={onTitleInput}
							error={errors.title?.[0]}
						/>
						<Input
							label="Slug"
							name="slug"
							bind:value={slug}
							oninput={() => (slugEdited = true)}
							hint="Filled from the title; lowercase letters, numbers and hyphens"
							error={errors.slug?.[0]}
						/>
					</div>
					{#if errors.lessonId?.[0]}
						<p class="text-[13px] text-red-700">{errors.lessonId[0]}</p>
					{/if}
				</div>
				<div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
					<a href="/admin/catalogue" class="btn-secondary">Cancel</a>
					<Button type="submit" loading={submitting}>Create Product</Button>
				</div>
			</Card>
		{/snippet}
	</Form>
</AdminPage>
