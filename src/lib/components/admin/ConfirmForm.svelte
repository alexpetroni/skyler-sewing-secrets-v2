<script lang="ts" generics="T extends Record<string, unknown>">
	import type { SuperValidated } from 'sveltekit-superforms';
	import Button from '#lib/components/ui/Button.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Form from './Form.svelte';

	interface Props {
		form: SuperValidated<T, string>;
		action: string;
		/** What the admin must type; the server checks it again. */
		phrase: string;
		/** The submit button's label. */
		label: string;
		description?: string;
		/** Extra fields sent with the confirmation. */
		hidden?: Record<string, string>;
	}

	let { form, action, phrase, label, description, hidden = {} }: Props = $props();

	let typed = $state('');
	const matches = $derived(typed.trim().toLowerCase() === phrase);
</script>

<Form {form} {action} class="space-y-4">
	{#snippet children({ errors, submitting })}
		{#if description}
			<p class="text-sm text-charcoal-600">{description}</p>
		{/if}
		{#each Object.entries(hidden) as [name, value] (name)}
			<input type="hidden" {name} {value} />
		{/each}
		<Input
			name="confirm"
			label="Type “{phrase}” to confirm"
			autocomplete="off"
			bind:value={typed}
			error={(errors as Record<string, string[] | undefined>).confirm?.[0]}
		/>
		<Button type="submit" variant="danger" size="sm" disabled={!matches} loading={submitting}>
			{label}
		</Button>
	{/snippet}
</Form>
