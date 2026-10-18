<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	interface Props extends HTMLTextareaAttributes {
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
		rows = 4,
		class: className = '',
		value = $bindable(),
		...restProps
	}: Props = $props();

	const fallbackId = crypto.randomUUID();
	const textareaId = $derived(id ?? name ?? fallbackId);

	const textareaClasses = $derived(
		`textarea ${error ? 'text-red-900 ring-red-300 placeholder:text-red-300 focus:ring-red-500' : ''} ${className}`
	);
</script>

<div>
	{#if label}
		<label for={textareaId} class="label">{label}</label>
	{/if}
	<textarea
		{name}
		id={textareaId}
		{rows}
		class={textareaClasses}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
		bind:value
		{...restProps}
	></textarea>
	{#if error}
		<p class="mt-2 text-[13px] text-red-700" id="{textareaId}-error">{error}</p>
	{:else if hint}
		<p class="mt-2 text-[13px] text-charcoal-500" id="{textareaId}-hint">{hint}</p>
	{/if}
</div>
