<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { enhance } from '$app/forms';
	import { formatPence } from '#lib/shared/money.ts';
	import PriceTag from './PriceTag.svelte';
	import { KIND_LABELS, type ShopCartLine } from './types.ts';

	interface Props {
		lines: ShopCartLine[];
	}

	let { lines }: Props = $props();
</script>

<ul class="divide-y divide-charcoal-900/[0.06]">
	{#each lines as line (line.productId)}
		<li class="flex gap-5 py-6 first:pt-0 last:pb-0">
			<a
				href="/products/{line.slug}"
				class="block h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-ivory-100"
				tabindex="-1"
				aria-hidden="true"
			>
				{#if line.coverImageUrl}
					<img src={line.coverImageUrl} alt="" loading="lazy" class="h-full w-full object-cover" />
				{/if}
			</a>

			<div class="flex min-w-0 flex-1 flex-col gap-1">
				<span class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">
					{KIND_LABELS[line.kind]}
				</span>
				<a
					href="/products/{line.slug}"
					class="truncate text-[15px] font-medium text-charcoal-900 transition-colors duration-400 ease-fluid hover:text-brand-700"
				>
					{line.title}
				</a>
				{#if line.discount > 0}
					<p class="text-[13px] text-sage-700">
						Code saves {formatPence(line.discount)}
					</p>
				{/if}
				<form method="POST" action="?/remove" use:enhance class="mt-1">
					<input type="hidden" name="productId" value={line.productId} />
					<button
						type="submit"
						class="text-[13px] text-charcoal-500 underline-offset-4 transition-colors duration-400 ease-fluid hover:text-charcoal-900 hover:underline"
					>
						Remove <span class="sr-only">{line.title}</span>
					</button>
				</form>
			</div>

			<div class="shrink-0 text-right">
				{#if line.discount > 0}
					<PriceTag
						price={line.unitAmount}
						listPrice={line.effectivePrice}
						onSale={true}
						size="sm"
					/>
				{:else}
					<PriceTag
						price={line.effectivePrice}
						listPrice={line.listPrice}
						onSale={line.onSale}
						saleEndsAt={line.saleEndsAt}
						size="sm"
					/>
				{/if}
			</div>
		</li>
	{/each}
</ul>
