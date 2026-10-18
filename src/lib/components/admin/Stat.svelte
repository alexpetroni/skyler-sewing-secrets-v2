<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import Card from '#lib/components/ui/Card.svelte';

	interface Props {
		label: string;
		value: string | number;
		hint?: string;
		href?: string;
	}

	let { label, value, hint, href }: Props = $props();
</script>

{#snippet body()}
	<Card interactive={!!href}>
		<p class="text-sm font-medium text-gray-500">{label}</p>
		<p class="text-2xl font-semibold text-gray-900">{value}</p>
		{#if hint}
			<p class="mt-1 text-xs text-gray-400">{hint}</p>
		{/if}
	</Card>
{/snippet}

{#if href}
	<a {href} class="block">{@render body()}</a>
{:else}
	{@render body()}
{/if}
