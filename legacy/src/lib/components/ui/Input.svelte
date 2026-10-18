<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends HTMLInputAttributes {
		label?: string;
		error?: string;
		hint?: string;
	}

	let {
		label,
		error,
		hint,
		id,
		name,
		type = 'text',
		class: className = '',
		value = $bindable(),
		...restProps
	}: Props = $props();

	const fallbackId = crypto.randomUUID();
	const inputId = $derived(id ?? name ?? fallbackId);

	const inputClasses = $derived(
		`input ${error ? 'text-red-900 ring-red-300 placeholder:text-red-300 focus:ring-red-500' : ''} ${className}`
	);
</script>

<div>
	{#if label}
		<label for={inputId} class="label">{label}</label>
	{/if}
	<input
		{type}
		{name}
		id={inputId}
		class={inputClasses}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
		bind:value
		{...restProps}
	/>
	{#if error}
		<p class="mt-2 text-[13px] text-red-700" id="{inputId}-error">{error}</p>
	{:else if hint}
		<p class="mt-2 text-[13px] text-charcoal-500" id="{inputId}-hint">{hint}</p>
	{/if}
</div>
