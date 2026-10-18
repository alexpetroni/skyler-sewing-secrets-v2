<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	interface Props extends HTMLSelectAttributes {
		label?: string;
		error?: string;
		hint?: string;
		children: Snippet;
	}

	let {
		label,
		error,
		hint,
		id,
		name,
		class: className = '',
		children,
		value = $bindable(),
		...restProps
	}: Props = $props();

	const fallbackId = crypto.randomUUID();
	const selectId = $derived(id ?? name ?? fallbackId);

	const selectClasses = $derived(
		`select appearance-none bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-11 ${
			error ? 'text-red-900 ring-red-300 focus:ring-red-500' : ''
		} ${className}`
	);
</script>

<div>
	{#if label}
		<label for={selectId} class="label">{label}</label>
	{/if}
	<div class="relative">
		<select
			{name}
			id={selectId}
			class={selectClasses}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
			bind:value
			{...restProps}
		>
			{@render children()}
		</select>
		<svg
			class="pointer-events-none absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-charcoal-400"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			stroke-width="1.25"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="m4 6 4 4 4-4" />
		</svg>
	</div>
	{#if error}
		<p class="mt-2 text-[13px] text-red-700" id="{selectId}-error">{error}</p>
	{:else if hint}
		<p class="mt-2 text-[13px] text-charcoal-500" id="{selectId}-hint">{hint}</p>
	{/if}
</div>
