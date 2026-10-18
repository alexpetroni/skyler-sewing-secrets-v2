<script lang="ts">
	import { untrack } from 'svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import { penceToPounds } from '#lib/shared/money.ts';
	import { toUtcDateTimeLocal } from '#lib/shared/schemas/catalog.ts';
	import { PERCENT_MAX, PERCENT_MIN } from '#lib/shared/schemas/commerce.ts';
	import ProductMultiSelect from './ProductMultiSelect.svelte';
	import type { PickerProduct } from './types.ts';

	/** The saved terms of a code (a `promo_codes` row with its scope). */
	interface PromoValues {
		description: string | null;
		discount_type: 'percentage' | 'fixed';
		discount_value: number;
		applies_to: 'all' | 'products';
		productIds: string[];
		min_subtotal: number | null;
		max_redemptions: number | null;
		max_redemptions_per_user: number | null;
		starts_at: string | null;
		ends_at: string | null;
		is_active: boolean;
		stackable_with_sale: boolean;
	}

	interface Props {
		/** The saved code; absent on the new and bulk forms. */
		promo?: PromoValues;
		/** Published products, plus any already in the scope. */
		products: PickerProduct[];
		/** The form's errors; an array field (`productIds`) carries its own under `_errors`. */
		errors: Record<string, unknown>;
		/** Total and per-user caps; bulk codes are always single-use. */
		showLimits?: boolean;
	}

	let { promo, products, errors, showLimits = true }: Props = $props();

	let discountType = $state(untrack(() => promo?.discount_type ?? 'percentage'));
	let appliesTo = $state(untrack(() => promo?.applies_to ?? 'all'));

	function fieldError(name: string): string | undefined {
		const value = errors[name];
		if (Array.isArray(value)) return value[0];
		return (value as { _errors?: string[] } | undefined)?._errors?.[0];
	}

	const initialValue = untrack(() =>
		promo
			? promo.discount_type === 'percentage'
				? String(promo.discount_value)
				: penceToPounds(promo.discount_value)
			: ''
	);
</script>

<div class="space-y-6">
	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
		<Select
			label="Discount type"
			name="discountType"
			bind:value={discountType}
			error={fieldError('discountType')}
		>
			<option value="percentage">Percentage</option>
			<option value="fixed">Fixed amount (£)</option>
		</Select>
		<Input
			label={discountType === 'percentage' ? 'Percent off' : 'Amount off (£)'}
			name="discountValue"
			inputmode={discountType === 'percentage' ? 'numeric' : 'decimal'}
			value={initialValue}
			required
			hint={discountType === 'percentage'
				? `${PERCENT_MIN}–${PERCENT_MAX}`
				: 'Taken off the eligible products, e.g. 5 or 4.99'}
			error={fieldError('discountValue')}
		/>
	</div>

	<fieldset>
		<legend class="label">Applies to</legend>
		<div class="flex flex-wrap gap-6 text-sm">
			<label class="flex items-center gap-2">
				<input
					type="radio"
					name="appliesTo"
					value="all"
					bind:group={appliesTo}
					class="text-sage-600"
				/>
				All products
			</label>
			<label class="flex items-center gap-2">
				<input
					type="radio"
					name="appliesTo"
					value="products"
					bind:group={appliesTo}
					class="text-sage-600"
				/>
				Selected products
			</label>
		</div>
		{#if fieldError('appliesTo')}
			<p class="mt-2 text-[13px] text-red-700">{fieldError('appliesTo')}</p>
		{/if}
	</fieldset>

	{#if appliesTo === 'products'}
		<ProductMultiSelect
			{products}
			selectedIds={promo?.productIds ?? []}
			error={fieldError('productIds')}
		/>
	{/if}

	{#if showLimits}
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
			<Input
				label="Total redemptions (optional)"
				name="maxRedemptions"
				type="number"
				min="1"
				value={promo?.max_redemptions === null || !promo ? '' : String(promo.max_redemptions)}
				hint="Empty for no limit"
				error={fieldError('maxRedemptions')}
			/>
			<Input
				label="Per customer (optional)"
				name="maxRedemptionsPerUser"
				type="number"
				min="1"
				value={promo?.max_redemptions_per_user === null || !promo
					? ''
					: String(promo.max_redemptions_per_user)}
				hint="Empty for no limit"
				error={fieldError('maxRedemptionsPerUser')}
			/>
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
		<Input
			label="Starts"
			name="startsAt"
			type="datetime-local"
			value={toUtcDateTimeLocal(promo?.starts_at ?? null)}
			hint="UTC; empty starts now"
			error={fieldError('startsAt')}
		/>
		<Input
			label="Ends"
			name="endsAt"
			type="datetime-local"
			value={toUtcDateTimeLocal(promo?.ends_at ?? null)}
			hint="UTC; empty never ends"
			error={fieldError('endsAt')}
		/>
	</div>

	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
		<Input
			label="Minimum spend (£, optional)"
			name="minSubtotal"
			inputmode="decimal"
			value={penceToPounds(promo?.min_subtotal ?? null)}
			hint="On the products the code applies to"
			error={fieldError('minSubtotal')}
		/>
		<Input
			label="Description (optional)"
			name="description"
			placeholder="New Year sale"
			value={promo?.description ?? ''}
			error={fieldError('description')}
		/>
	</div>

	<div class="flex flex-wrap gap-6">
		{@render checkbox(
			'stackableWithSale',
			'Stacks with sales',
			'Also applies to products already on sale',
			promo?.stackable_with_sale ?? false
		)}
		{@render checkbox(
			'isActive',
			'Active',
			'Buyers can apply the code inside its window',
			promo?.is_active ?? true
		)}
	</div>
</div>

{#snippet checkbox(name: string, label: string, description: string, checked: boolean)}
	<label for="promo-{name}" class="flex items-start gap-2.5 text-sm">
		<input
			id="promo-{name}"
			{name}
			type="checkbox"
			{checked}
			class="mt-0.5 h-4 w-4 rounded-md border-0 text-sage-600 ring-1 ring-charcoal-900/[0.12] ring-inset focus:ring-2 focus:ring-sage-500"
		/>
		<span>
			<span class="font-medium text-charcoal-900">{label}</span>
			<span class="block text-charcoal-500">{description}</span>
		</span>
	</label>
{/snippet}
