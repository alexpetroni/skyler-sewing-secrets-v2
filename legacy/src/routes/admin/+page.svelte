<script lang="ts">
	import type { PageData } from './$types';
	import { Card } from '$lib/components/ui';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-GB', {
			style: 'currency',
			currency: 'GBP',
			minimumFractionDigits: 0
		}).format(amount);
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	const stats = $derived([
		{ name: 'Total Members', value: data.stats.totalMembers, icon: 'users', href: '/admin/users' },
		{ name: 'Total Revenue', value: formatCurrency(data.stats.totalRevenue), icon: 'currency', href: '/admin/pricing' },
		{ name: 'Active Modules', value: data.stats.totalModules, icon: 'folder', href: '/admin/modules' },
		{ name: 'Total Lessons', value: data.stats.totalLessons, icon: 'play', href: '/admin/lessons' }
	]);

	const icons: Record<string, string> = {
		users: `<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />`,
		currency: `<path stroke-linecap="round" stroke-linejoin="round" d="M14.25 7.756a4.5 4.5 0 1 0 0 8.488M7.5 10.5h5.25m-5.25 3h5.25M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />`,
		folder: `<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />`,
		play: `<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />`
	};
</script>

<svelte:head>
	<title>Admin Dashboard - Skyler's Sewing Secrets</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="space-y-8">
	<div>
		<h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
		<p class="mt-1 text-sm text-gray-500">Overview of your course platform.</p>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
		{#each stats as stat}
			<a href={stat.href} class="block">
				<Card class="hover:shadow-md transition-shadow">
					{#snippet children()}
						<div class="p-6">
							<div class="flex items-center">
								<div class="flex-shrink-0">
									<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-100">
										<svg class="h-6 w-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
											{@html icons[stat.icon]}
										</svg>
									</div>
								</div>
								<div class="ml-4">
									<p class="text-sm font-medium text-gray-500">{stat.name}</p>
									<p class="text-2xl font-semibold text-gray-900">{stat.value}</p>
								</div>
							</div>
						</div>
					{/snippet}
				</Card>
			</a>
		{/each}
	</div>

	<div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
		<!-- Recent Members -->
		<Card>
			{#snippet children()}
				<div class="p-6">
					<div class="flex items-center justify-between mb-4">
						<h2 class="text-lg font-semibold text-gray-900">Recent Members</h2>
						<a href="/admin/users" class="text-sm text-brand-600 hover:text-brand-500">View all</a>
					</div>
					{#if data.recentMembers.length > 0}
						<ul class="divide-y divide-gray-100">
							{#each data.recentMembers as member}
								<li class="py-3 flex items-center justify-between">
									<div class="flex items-center gap-3">
										<div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
											<span class="text-sm font-medium text-gray-600">
												{(member.full_name || member.email).charAt(0).toUpperCase()}
											</span>
										</div>
										<div>
											<p class="text-sm font-medium text-gray-900">{member.full_name || 'No name'}</p>
											<p class="text-xs text-gray-500">{member.email}</p>
										</div>
									</div>
									<span class="text-xs text-gray-400">
										{formatDate(member.member_since || member.created_at)}
									</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-sm text-gray-500 text-center py-4">No members yet.</p>
					{/if}
				</div>
			{/snippet}
		</Card>

		<!-- Recent Payments -->
		<Card>
			{#snippet children()}
				<div class="p-6">
					<div class="flex items-center justify-between mb-4">
						<h2 class="text-lg font-semibold text-gray-900">Recent Payments</h2>
						<a href="/admin/pricing" class="text-sm text-brand-600 hover:text-brand-500">View all</a>
					</div>
					{#if data.recentPayments.length > 0}
						<ul class="divide-y divide-gray-100">
							{#each data.recentPayments as payment}
								<li class="py-3 flex items-center justify-between">
									<div>
										<p class="text-sm font-medium text-gray-900">{payment.user?.email || 'Unknown'}</p>
										<p class="text-xs text-gray-500">{formatDate(payment.created_at)}</p>
									</div>
									<span class="text-sm font-semibold text-green-600">
										{formatCurrency(payment.amount / 100)}
									</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-sm text-gray-500 text-center py-4">No payments yet.</p>
					{/if}
				</div>
			{/snippet}
		</Card>

		<!-- Recent Contact Submissions -->
		<Card>
			{#snippet children()}
				<div class="p-6">
					<div class="flex items-center justify-between mb-4">
						<h2 class="text-lg font-semibold text-gray-900">Recent Messages</h2>
						<a href="/admin/contacts" class="text-sm text-brand-600 hover:text-brand-500">View all</a>
					</div>
					{#if data.recentContacts.length > 0}
						<ul class="divide-y divide-gray-100">
							{#each data.recentContacts as contact}
								<li class="py-3">
									<div class="flex items-center justify-between">
										<p class="text-sm font-medium text-gray-900">{contact.name}</p>
										{#if !contact.is_read}
											<span class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">New</span>
										{/if}
									</div>
									<p class="text-xs text-gray-500 mt-1 truncate">{contact.subject || contact.message}</p>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-sm text-gray-500 text-center py-4">No messages yet.</p>
					{/if}
				</div>
			{/snippet}
		</Card>

		<!-- Quick Actions -->
		<Card>
			{#snippet children()}
				<div class="p-6">
					<h2 class="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
					<div class="grid grid-cols-2 gap-3">
						<a href="/admin/modules/new" class="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-brand-500 hover:bg-brand-50 transition-colors">
							<svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
							</svg>
							<span class="text-sm font-medium text-gray-700">New Module</span>
						</a>
						<a href="/admin/lessons/new" class="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-brand-500 hover:bg-brand-50 transition-colors">
							<svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
							</svg>
							<span class="text-sm font-medium text-gray-700">New Lesson</span>
						</a>
						<a href="/admin/blog/new" class="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-brand-500 hover:bg-brand-50 transition-colors">
							<svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
							</svg>
							<span class="text-sm font-medium text-gray-700">New Post</span>
						</a>
						<a href="/admin/pricing" class="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-brand-500 hover:bg-brand-50 transition-colors">
							<svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
							</svg>
							<span class="text-sm font-medium text-gray-700">Pricing</span>
						</a>
					</div>
				</div>
			{/snippet}
		</Card>
	</div>
</div>
