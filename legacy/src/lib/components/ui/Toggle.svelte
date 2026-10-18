<script lang="ts">
	interface Props {
		checked?: boolean;
		disabled?: boolean;
		label?: string;
		description?: string;
		name?: string;
		onchange?: (checked: boolean) => void;
	}

	let {
		checked = $bindable(false),
		disabled = false,
		label,
		description,
		name,
		onchange
	}: Props = $props();

	function handleClick() {
		if (disabled) return;
		checked = !checked;
		onchange?.(checked);
	}
</script>

<div class="flex items-center">
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-label={label || 'Toggle'}
		{disabled}
		{name}
		class="relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full p-0.5 ring-1 ring-inset transition-colors duration-400 ease-fluid disabled:cursor-not-allowed disabled:opacity-40 {checked
			? 'bg-sage-600 ring-sage-700/20'
			: 'bg-charcoal-900/[0.06] ring-charcoal-900/[0.08]'}"
		onclick={handleClick}
	>
		<span
			aria-hidden="true"
			class="pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-ambient transition-transform duration-400 ease-spring {checked
				? 'translate-x-5'
				: 'translate-x-0'}"
		></span>
	</button>
	{#if label || description}
		<span class="ml-3 text-sm">
			{#if label}
				<span class="font-medium text-charcoal-900">{label}</span>
			{/if}
			{#if description}
				<span class="text-charcoal-500">{description}</span>
			{/if}
		</span>
	{/if}
</div>
