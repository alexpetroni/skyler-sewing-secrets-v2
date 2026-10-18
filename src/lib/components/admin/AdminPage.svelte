<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		/** Buttons or links beside the heading. */
		actions?: Snippet;
		children: Snippet;
	}

	let { title, description, actions, children }: Props = $props();
</script>

<svelte:head>
	<title>{title} - Admin - Skyler's Sewing Secrets</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">{title}</h1>
			{#if description}
				<p class="mt-1 text-sm text-gray-500">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="flex gap-2">{@render actions()}</div>
		{/if}
	</div>

	{@render children()}
</div>
