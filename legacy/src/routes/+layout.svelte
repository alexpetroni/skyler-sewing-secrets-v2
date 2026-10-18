<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import Header from '$lib/components/layout/Header.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();

	let maintenance = $derived(page.data.maintenance === true);
	let isAdmin = $derived(page.url.pathname.startsWith('/admin'));
	let hideShell = $derived(maintenance || isAdmin);
</script>

<svelte:head>
	<link rel="icon" href="/favicon.png" />
	<title>Skyler's Sewing Secrets</title>
</svelte:head>

{#if hideShell}
	{@render children()}
{:else}
	<div class="flex min-h-screen flex-col">
		<Header user={data.profile} />

		<main class="flex-1 overflow-x-hidden">
			{@render children()}
		</main>

		<Footer />
	</div>
{/if}
