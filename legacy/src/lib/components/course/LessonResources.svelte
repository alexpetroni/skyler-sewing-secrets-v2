<script lang="ts">
	import type { LessonResource } from '$lib/types';

	interface Props {
		resources: LessonResource[];
	}

	let { resources }: Props = $props();

	function formatFileSize(bytes: number | null): string {
		if (!bytes) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	// Ultra-light line glyphs, drawn on a 16px grid.
	function getFileIcon(fileType: string | null): string {
		const type = fileType?.toLowerCase() || '';
		if (type.includes('image') || type.includes('png') || type.includes('jpg')) {
			return '<rect x="2.25" y="3.25" width="11.5" height="9.5" rx="2" /><path d="m3.5 11 3-3 2.5 2.5L11 8.75l1.5 1.5" /><circle cx="6" cy="6.25" r=".85" />';
		}
		if (type.includes('zip') || type.includes('archive')) {
			return '<rect x="2.75" y="2.75" width="10.5" height="10.5" rx="2" /><path d="M7.25 3v2M8.75 5v2M7.25 7v2M8.75 9v2" />';
		}
		return '<path d="M9 2.75H5.25a1.5 1.5 0 0 0-1.5 1.5v7.5a1.5 1.5 0 0 0 1.5 1.5h5.5a1.5 1.5 0 0 0 1.5-1.5V5.75L9 2.75Z" /><path d="M9 2.75v3h3.25" />';
	}
</script>

{#if resources.length > 0}
	<section class="mt-14">
		<h3 class="flex items-center gap-4 text-[10px] uppercase tracking-eyebrow text-charcoal-400">
			Lesson resources
			<span class="h-px flex-auto bg-charcoal-900/[0.08]"></span>
		</h3>

		<div class="mt-6 grid gap-3 sm:grid-cols-2">
			{#each resources as resource}
				<a
					href={resource.file_url}
					download
					target="_blank"
					rel="noopener noreferrer"
					class="group flex items-center gap-4 rounded-2xl bg-white p-4 shadow-ambient ring-1 ring-inset ring-charcoal-900/[0.06] transition-all duration-600 ease-fluid hover:-translate-y-0.5 hover:shadow-lift"
				>
					<span class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ivory-100 text-charcoal-500 transition-colors duration-400 ease-fluid group-hover:text-charcoal-900">
						<svg class="h-4.5 w-4.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							{@html getFileIcon(resource.file_type)}
						</svg>
					</span>

					<span class="min-w-0 flex-1">
						<span class="block truncate text-[14px] font-medium text-charcoal-900">{resource.title}</span>
						{#if resource.file_size_bytes}
							<span class="mt-0.5 block text-[12px] text-charcoal-400">
								{formatFileSize(resource.file_size_bytes)}
							</span>
						{/if}
					</span>

					<span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-charcoal-900/[0.05] text-charcoal-600 transition-transform duration-400 ease-spring group-hover:translate-y-0.5">
						<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
							<path d="M8 3v7.5M5 7.5 8 10.5l3-3M3.5 13h9" />
						</svg>
					</span>
				</a>
			{/each}
		</div>
	</section>
{/if}
