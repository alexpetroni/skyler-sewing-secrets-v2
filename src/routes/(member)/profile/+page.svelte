<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- links are root-relative with no base path */
	import { enhance } from '$app/forms';
	import { reveal } from '#lib/actions/reveal.ts';
	import Seo from '#lib/components/Seo.svelte';
	import { Alert, Avatar, Badge, Input } from '#lib/components/ui/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const KIND_LABELS = { course: 'Course', bundle: 'Bundle', single: 'Video' } as const;

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<Seo
	title="My Profile - Skyler's Sewing Secrets"
	description="Manage your Skyler's Sewing Secrets account settings, update your profile, and view what you own."
	noindex
/>

<section class="relative isolate overflow-hidden">
	<div
		class="aurora -top-28 left-[-10%] h-[26rem] w-[26rem] bg-sage-200/30"
		aria-hidden="true"
	></div>

	<div class="container-narrow pt-12 pb-24 sm:pt-16">
		<h1 class="page-title">My profile</h1>
		<p class="section-description mt-4">Manage your account information.</p>

		<!-- Identity -->
		<div class="shell mt-12 shadow-ambient" use:reveal>
			<div class="core p-7 sm:p-9">
				<div class="flex flex-wrap items-center gap-6">
					<Avatar
						src={data.profile.avatarUrl}
						name={data.profile.fullName || data.profile.email}
						size="xl"
					/>
					<div class="min-w-0">
						<h2 class="subsection-heading truncate">{data.profile.fullName || 'Account'}</h2>
						<p class="mt-1 truncate text-[13px] text-charcoal-500">{data.profile.email}</p>
						<div class="mt-3 flex flex-wrap gap-2">
							{#if data.allAccess}
								<Badge variant="sage" size="sm">Lifetime member</Badge>
							{/if}
							{#if data.isAdmin}
								<Badge variant="brand" size="sm">Admin</Badge>
							{/if}
						</div>
					</div>
				</div>

				<form method="POST" action="?/updateProfile" use:enhance class="mt-10 space-y-5">
					{#if form && 'success' in form}
						<Alert variant="success">Profile updated successfully.</Alert>
					{/if}
					{#if form && 'error' in form}
						<Alert variant="error">{form.error}</Alert>
					{/if}

					<Input
						label="Full name"
						name="full_name"
						value={form && 'fullName' in form ? form.fullName : (data.profile.fullName ?? '')}
						placeholder="Enter your full name"
					/>

					<Input
						label="Email"
						type="email"
						value={data.profile.email}
						disabled
						class="bg-ivory-100 text-charcoal-500"
						hint="Email addresses can't be changed here — contact us if you need to move your account."
					/>

					<div class="pt-1">
						<button type="submit" class="btn-primary">Save changes</button>
					</div>
				</form>
			</div>
		</div>

		<!-- What you own -->
		<div class="shell mt-5 shadow-ambient" use:reveal={{ delay: 80 }}>
			<div class="core p-7 sm:p-9">
				<h3 class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">Your library</h3>
				{#if data.owned.length > 0}
					<ul class="mt-6 divide-y divide-charcoal-900/[0.06]">
						{#each data.owned as product (product.id)}
							<li class="flex items-center justify-between gap-4 py-3.5">
								<span class="min-w-0">
									<span class="block truncate text-[14px] font-medium text-charcoal-900">
										{product.title}
									</span>
									<span class="text-[12px] text-charcoal-400">{KIND_LABELS[product.kind]}</span>
								</span>
								<span class="shrink-0 text-[13px] text-charcoal-500">
									Since {formatDate(product.grantedAt)}
								</span>
							</li>
						{/each}
					</ul>
					<a href="/library" class="btn-secondary mt-6">Open my library</a>
				{:else}
					<p class="mt-5 text-[15px] leading-relaxed text-charcoal-600">
						You don't own any courses or videos yet.
					</p>
				{/if}
			</div>
		</div>

		<!-- Account facts -->
		<div class="shell mt-5 shadow-ambient" use:reveal={{ delay: 120 }}>
			<div class="core p-7 sm:p-9">
				<h3 class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">
					Account information
				</h3>
				<dl class="mt-6 divide-y divide-charcoal-900/[0.06]">
					<div class="flex justify-between gap-4 py-3.5">
						<dt class="text-[14px] text-charcoal-500">Account created</dt>
						<dd class="text-[14px] font-medium text-charcoal-900">
							{formatDate(data.profile.createdAt)}
						</dd>
					</div>
					<div class="flex justify-between gap-4 py-3.5">
						<dt class="text-[14px] text-charcoal-500">Membership</dt>
						<dd class="text-[14px] font-medium text-charcoal-900">
							{data.allAccess ? 'Lifetime access' : 'No membership'}
						</dd>
					</div>
				</dl>

				<form method="POST" action="?/signOutEverywhere" class="mt-8">
					<p class="text-[14px] leading-relaxed text-charcoal-500">
						Signed in somewhere you no longer use? Sign out of every device, this one included.
					</p>
					<button type="submit" class="btn-secondary mt-4">Sign out everywhere</button>
				</form>
			</div>
		</div>

		<!-- Review -->
		{#if data.owned.length > 0}
			<div class="shell mt-5 shadow-ambient" use:reveal={{ delay: 160 }}>
				<div class="core p-7 sm:p-9">
					<h3 class="text-[10px] tracking-eyebrow text-charcoal-400 uppercase">Your review</h3>

					{#if data.testimonial}
						<figure class="mt-6 rounded-2xl bg-ivory-100 p-6">
							<div class="flex gap-1" aria-label="{data.testimonial.rating || 0} out of 5">
								{#each { length: 5 }, i (i)}
									<svg
										class="h-3.5 w-3.5 {i < (data.testimonial.rating || 0)
											? 'text-gold-400'
											: 'text-charcoal-200'}"
										fill="currentColor"
										viewBox="0 0 20 20"
										aria-hidden="true"
									>
										<path
											d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
										/>
									</svg>
								{/each}
							</div>
							<blockquote class="mt-4 font-serif text-[1.125rem] leading-relaxed text-charcoal-800">
								“{data.testimonial.content}”
							</blockquote>
							<figcaption class="mt-4">
								{#if data.testimonial.is_published}
									<Badge variant="sage" size="sm">Published</Badge>
								{:else}
									<Badge variant="warning" size="sm">Pending review</Badge>
								{/if}
							</figcaption>
						</figure>

						{#if !data.testimonial.is_published}
							<p class="mt-5 text-[14px] leading-relaxed text-charcoal-500">
								Your review is pending moderation. Once approved, it will appear on the site.
							</p>
							<a href="/leave-review" class="btn-secondary mt-6">Edit review</a>
						{/if}
					{:else}
						<p class="mt-5 max-w-reading text-[15px] leading-relaxed text-charcoal-600">
							Share your experience with Skyler's Sewing Secrets. Your review helps other sewists
							decide whether this is for them.
						</p>
						<a href="/leave-review" class="btn-primary group mt-7">
							Leave a review
							<span class="btn-orb" aria-hidden="true">
								<svg
									class="h-3.5 w-3.5"
									viewBox="0 0 16 16"
									fill="none"
									stroke="currentColor"
									stroke-width="1.25"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
								</svg>
							</span>
						</a>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</section>
