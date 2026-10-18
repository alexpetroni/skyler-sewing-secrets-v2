<script lang="ts">
	import { enhance } from '$app/forms';

	interface Props {
		productId: string;
		/** The viewer already owns it: nothing to buy. */
		owned?: boolean;
		/** Already in the cart: adding again would do nothing. */
		inCart?: boolean;
		label?: string;
		size?: 'sm' | 'md';
		class?: string;
	}

	let {
		productId,
		owned = false,
		inCart = false,
		label = 'Add to cart',
		size = 'md',
		class: className = ''
	}: Props = $props();

	let pending = $state(false);

	const text = $derived(owned ? 'Owned' : inCart ? 'In your cart' : pending ? 'Adding…' : label);
</script>

<form
	method="POST"
	action="/cart?/add"
	class={className}
	use:enhance={() => {
		pending = true;
		return async ({ update }) => {
			await update();
			pending = false;
		};
	}}
>
	<input type="hidden" name="productId" value={productId} />
	<button
		type="submit"
		class="btn-primary w-full {size === 'sm' ? 'btn-sm' : ''}"
		disabled={owned || inCart || pending}
	>
		{text}
	</button>
</form>
