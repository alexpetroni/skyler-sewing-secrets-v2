<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** The `id` of the control inside, for the label. */
		id: string;
		label: string;
		error?: string | string[];
		hint?: string;
		children: Snippet;
	}

	let { id, label, error, hint, children }: Props = $props();

	const message = $derived(Array.isArray(error) ? error[0] : error);
</script>

<div>
	<label for={id} class="label">{label}</label>
	{@render children()}
	{#if message}
		<p class="mt-2 text-[13px] text-red-700" id="{id}-error">{message}</p>
	{:else if hint}
		<p class="mt-2 text-[13px] text-charcoal-500" id="{id}-hint">{hint}</p>
	{/if}
</div>
