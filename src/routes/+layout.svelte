<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import Header from '#lib/components/layout/Header.svelte';
	import Footer from '#lib/components/layout/Footer.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let maintenance = $derived(page.data.maintenance === true);
	let isAdmin = $derived(page.url.pathname.startsWith('/admin'));
	let hideShell = $derived(maintenance || isAdmin);
</script>

<svelte:head>
	<title>Skyler's Sewing Secrets</title>
</svelte:head>

{#if hideShell}
	{@render children()}
{:else}
	<div class="flex min-h-screen flex-col">
		<Header viewer={data.viewer} cartCount={data.cartCount} />

		<main class="flex-1 overflow-x-hidden">
			{@render children()}
		</main>

		<Footer />
	</div>
{/if}
