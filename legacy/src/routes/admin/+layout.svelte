<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import AdminSidebar from '$lib/components/admin/AdminSidebar.svelte';
	import AdminHeader from '$lib/components/admin/AdminHeader.svelte';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();
	
	let sidebarOpen = $state(false);
</script>

<svelte:head>
	<title>Admin - Skyler's Sewing Secrets</title>
</svelte:head>

<!-- This layout does NOT inherit header/footer from parent -->
<div class="min-h-screen bg-gray-100">
	<!-- Mobile sidebar backdrop -->
	{#if sidebarOpen}
		<div class="relative z-50 lg:hidden" role="dialog" aria-modal="true">
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div
				class="fixed inset-0 bg-gray-900/80"
				onclick={() => sidebarOpen = false}
			></div>

			<div class="fixed inset-0 flex">
				<div class="relative mr-16 flex w-full max-w-xs flex-1">
					<div class="absolute left-full top-0 flex w-16 justify-center pt-5">
						<button type="button" class="-m-2.5 p-2.5" onclick={() => sidebarOpen = false}>
							<span class="sr-only">Close sidebar</span>
							<svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
					
					<AdminSidebar user={data.profile!} />
				</div>
			</div>
		</div>
	{/if}

	<!-- Desktop sidebar -->
	<div class="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
		<AdminSidebar user={data.profile!} />
	</div>

	<!-- Main content -->
	<div class="lg:pl-72">
		<AdminHeader user={data.profile!} onMenuClick={() => sidebarOpen = true} />

		<main class="py-10">
			<div class="px-4 sm:px-6 lg:px-8">
				{@render children()}
			</div>
		</main>
	</div>
</div>
