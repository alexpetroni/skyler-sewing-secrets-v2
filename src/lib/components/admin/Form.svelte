<script lang="ts" generics="T extends Record<string, unknown>">
	import { untrack, type Snippet } from 'svelte';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import Alert from '#lib/components/ui/Alert.svelte';
	import type { FormState } from './types.ts';

	interface Props {
		/** From the load (`adminForm(schema).empty()`); the action's result replaces it. */
		form: SuperValidated<T, string>;
		/** A named action, e.g. `?/suspend`. */
		action: string;
		class?: string;
		children: Snippet<[FormState<T>]>;
	}

	let { form, action, class: className = '', children }: Props = $props();

	// superForm takes the initial state once and follows the action results itself.
	const { enhance, errors, message, submitting } = superForm(
		untrack(() => form),
		{ resetForm: true }
	);
</script>

<form method="POST" {action} class={className} use:enhance>
	{#if $errors._errors?.length}
		<div class="mb-4">
			<Alert variant="error">{$errors._errors[0]}</Alert>
		</div>
	{:else if $message}
		<div class="mb-4">
			<Alert variant="success">{$message}</Alert>
		</div>
	{/if}
	{@render children({ errors: $errors, submitting: $submitting })}
</form>
