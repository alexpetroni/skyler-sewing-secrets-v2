<script lang="ts">
	import type { PageData } from './$types';
	import { Card, Button, Badge, Select } from '$lib/components/ui';
	import OptimizedImage from '$lib/components/ui/OptimizedImage.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let filterModule = $state('');

	const filteredLessons = $derived(() => {
		if (!filterModule) return data.lessons;
		return data.lessons.filter(l => l.module_id === filterModule);
	});

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function formatDuration(minutes: number | null): string {
		if (!minutes) return '-';
		return `${minutes} min`;
	}
</script>

<svelte:head>
	<title>Lessons - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Lessons</h1>
			<p class="mt-1 text-sm text-gray-500">Manage course lessons.</p>
		</div>
		<a href="/admin/lessons/new">
			<Button>
				{#snippet children()}
					<svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
					New Lesson
				{/snippet}
			</Button>
		</a>
	</div>

	<!-- Filter -->
	<Card>
		{#snippet children()}
			<div class="p-4">
				<Select
					label="Filter by Module"
					bind:value={filterModule}
				>
					<option value="">All Modules</option>
					{#each data.modules as module}
						<option value={module.id}>{module.title}</option>
					{/each}
				</Select>
			</div>
		{/snippet}
	</Card>

	<Card>
		{#snippet children()}
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lesson</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Module</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each filteredLessons() as lesson}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										{#if lesson.thumbnail_url}
											<OptimizedImage
												class="h-10 w-10 rounded object-cover"
												src={lesson.thumbnail_url}
												alt=""
												width={40}
											/>
										{:else}
											<div class="h-10 w-10 rounded bg-gray-200 flex items-center justify-center">
												<svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1 1.667-.986V5.653Z" />
												</svg>
											</div>
										{/if}
										<div class="ml-4">
											<div class="text-sm font-medium text-gray-900">{lesson.title}</div>
											<div class="text-sm text-gray-500">/{lesson.slug}</div>
										</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{lesson.module?.title || 'No module'}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{formatDuration(lesson.duration_minutes)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex gap-1">
										{#if lesson.is_published}
											<Badge variant="success">
												{#snippet children()}Published{/snippet}
											</Badge>
										{:else}
											<Badge variant="secondary">
												{#snippet children()}Draft{/snippet}
											</Badge>
										{/if}
										{#if lesson.is_free_preview}
											<Badge variant="primary">
												{#snippet children()}Free{/snippet}
											</Badge>
										{/if}
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
									<a href="/admin/lessons/{lesson.id}" class="text-brand-600 hover:text-brand-900">
										Edit
									</a>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="px-6 py-12 text-center text-sm text-gray-500">
									No lessons found. <a href="/admin/lessons/new" class="text-brand-600 hover:text-brand-500">Create the first one</a>.
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/snippet}
	</Card>
</div>
