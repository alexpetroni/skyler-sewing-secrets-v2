<script lang="ts">
	import { enhance } from '$app/forms';
	import { promoRejectionMessage, type PromoRejectionReason } from '#lib/shared/promo-messages.ts';

	interface Props {
		/** The code in the cart, applied or not; null when none. */
		code: string | null;
		/** Why the stored code no longer applies (re-checked on every render). */
		rejection?: PromoRejectionReason | null;
		/** The message from a refused `?/applyPromo`. */
		error?: string | null;
	}

	let { code, rejection = null, error = null }: Props = $props();

	const message = $derived(error ?? (rejection ? promoRejectionMessage(rejection) : null));
	const applied = $derived(code !== null && rejection === null);
</script>

<div>
	{#if code}
		<div class="flex items-center justify-between gap-3">
			<p class="text-[14px] text-charcoal-700">
				Code <span class="font-semibold tracking-wide text-charcoal-900">{code}</span>
				{#if applied}<span class="text-sage-700">applied</span>{/if}
			</p>
			<form method="POST" action="?/removePromo" use:enhance>
				<button
					type="submit"
					class="text-[13px] text-charcoal-500 underline-offset-4 transition-colors duration-400 ease-fluid hover:text-charcoal-900 hover:underline"
				>
					Remove code
				</button>
			</form>
		</div>
	{/if}

	{#if !applied}
		<form method="POST" action="?/applyPromo" use:enhance class="mt-3 flex gap-2">
			<label for="promo-code" class="sr-only">Discount code</label>
			<input
				id="promo-code"
				name="code"
				type="text"
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				placeholder="Discount code"
				class="input flex-1 uppercase"
				aria-invalid={message ? 'true' : undefined}
				aria-describedby={message ? 'promo-code-error' : undefined}
			/>
			<button type="submit" class="btn-secondary btn-sm shrink-0">Apply</button>
		</form>
	{/if}

	{#if message}
		<p class="mt-2 text-[13px] text-red-700" id="promo-code-error" role="alert">{message}</p>
	{/if}
</div>
