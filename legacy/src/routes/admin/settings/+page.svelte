<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Settings - Admin - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-8">
	<div>
		<h1 class="text-2xl font-bold text-gray-900">Settings</h1>
		<p class="mt-1 text-sm text-gray-500">Manage site-wide configuration.</p>
	</div>

	<!-- Maintenance Mode -->
	<Card>
		{#snippet children()}
			<div class="p-6">
				<form method="POST" action="?/toggleMaintenance" class="flex items-center justify-between">
					<div>
						<h2 class="text-lg font-semibold text-gray-900">Maintenance Mode</h2>
						<p class="mt-1 text-sm text-gray-500">
							When enabled, the whole site except the admin panel, sign-in and payment completion shows the maintenance page. Admins still see the normal site. Takes effect immediately.
						</p>
						{#if data.maintenanceUpdatedAt}
							<p class="mt-2 text-xs text-gray-400">
								Last changed: {formatDate(data.maintenanceUpdatedAt)}
							</p>
						{/if}
					</div>

					<div class="ml-6 flex-shrink-0">
						<button
							type="submit"
							class="relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 {data.maintenanceMode ? 'bg-red-500' : 'bg-gray-200'}"
							role="switch"
							aria-checked={data.maintenanceMode}
							aria-label="Toggle maintenance mode"
						>
							<span
								class="pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {data.maintenanceMode ? 'translate-x-5' : 'translate-x-0'}"
							></span>
						</button>
					</div>
				</form>

				{#if data.maintenanceMode}
					<div class="mt-4 rounded-lg bg-red-50 border border-red-200 p-4">
						<div class="flex">
							<svg class="h-5 w-5 text-red-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
							</svg>
							<p class="ml-3 text-sm text-red-700">
								The site is currently in maintenance mode. Visitors and members see the maintenance page everywhere except sign-in and payment completion; admins still see the normal site. Turning it off takes effect immediately.
							</p>
						</div>
					</div>
				{/if}
			</div>
		{/snippet}
	</Card>
</div>
