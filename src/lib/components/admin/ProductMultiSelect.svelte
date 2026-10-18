<script lang="ts">
	import { untrack } from 'svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import type { PickerProduct } from './types.ts';

	interface Props {
		/** Published products, plus any already in the scope. */
		products: PickerProduct[];
		/** The ids in the saved scope. */
		selectedIds?: string[];
		/** One checkbox per product under this name; the form posts the checked ids. */
		name?: string;
		label?: string;
		error?: string;
	}

	let {
		products,
		selectedIds = [],
		name = 'productIds',
		label = 'Products',
		error
	}: Props = $props();

	let chosen = $state<string[]>(untrack(() => [...selectedIds]));
	let filter = $state('');

	const needle = $derived(filter.trim().toLowerCase());
	const chosenProducts = $derived(products.filter((product) => chosen.includes(product.id)));

	function toggle(id: string, checked: boolean) {
		chosen = checked ? [...chosen, id] : chosen.filter((other) => other !== id);
	}
</script>

<fieldset>
	<legend class="label">
		{label}
		<span class="font-normal text-gray-500">· {chosen.length} selected</span>
	</legend>
	{#if chosenProducts.length > 0}
		<div class="mb-3 flex flex-wrap gap-2">
			{#each chosenProducts as product (product.id)}
				<Badge variant="brand" removable onremove={() => toggle(product.id, false)}>
					{product.title}
				</Badge>
			{/each}
		</div>
	{/if}
	<input
		type="search"
		class="input"
		placeholder="Filter products..."
		aria-label="Filter products"
		bind:value={filter}
	/>
	<ul
		class="mt-2 max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-xl ring-1 {error
			? 'ring-red-300'
			: 'ring-charcoal-900/[0.08]'}"
	>
		{#each products as product (product.id)}
			<!-- Filtered-out rows stay in the form so their checkboxes still post. -->
			<li class:hidden={needle !== '' && !product.title.toLowerCase().includes(needle)}>
				<label class="flex items-center gap-3 px-4 py-2.5 text-sm">
					<input
						type="checkbox"
						{name}
						value={product.id}
						checked={chosen.includes(product.id)}
						onchange={(event) => toggle(product.id, event.currentTarget.checked)}
						class="h-4 w-4 rounded-md border-0 text-sage-600 ring-1 ring-charcoal-900/[0.12] ring-inset focus:ring-2 focus:ring-sage-500"
					/>
					<span class="flex-1 text-gray-900">{product.title}</span>
					<span class="text-gray-500 capitalize">{product.kind}</span>
				</label>
			</li>
		{:else}
			<li class="px-4 py-6 text-center text-sm text-gray-500">No published products yet.</li>
		{/each}
	</ul>
	{#if error}
		<p class="mt-2 text-[13px] text-red-700">{error}</p>
	{/if}
</fieldset>
