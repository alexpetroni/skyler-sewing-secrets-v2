<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { Input, Badge, Avatar, Alert } from '$lib/components/ui';
	import { enhance } from '$app/forms';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return 'N/A';
		return new Date(dateStr).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>My Profile - Skyler's Sewing Secrets</title>
	<meta name="description" content="Manage your Skyler's Sewing Secrets account settings, update your profile, and view your membership status." />
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="relative isolate overflow-hidden">
	<div class="aurora -top-28 left-[-10%] h-[26rem] w-[26rem] bg-sage-200/30" aria-hidden="true"></div>

	<div class="container-narrow pb-24 pt-12 sm:pt-16">
		<h1 class="page-title">My profile</h1>
		<p class="section-description mt-4">Manage your account information.</p>

		<!-- Identity -->
		<div class="mt-12 shell shadow-ambient" use:reveal>
			<div class="core p-7 sm:p-9">
				<div class="flex flex-wrap items-center gap-6">
					<Avatar
						src={data.profile.avatar_url}
						name={data.profile.full_name || data.profile.email}
						size="xl"
					/>
					<div class="min-w-0">
						<h2 class="subsection-heading truncate">{data.profile.full_name || 'Account'}</h2>
						<p class="mt-1 truncate text-[13px] text-charcoal-500">{data.profile.email}</p>
						<div class="mt-3 flex flex-wrap gap-2">
							{#if data.profile.is_member}
								<Badge variant="sage" size="sm">
									{#snippet children()}Lifetime member{/snippet}
								</Badge>
							{/if}
							{#if data.profile.is_admin}
								<Badge variant="brand" size="sm">
									{#snippet children()}Admin{/snippet}
								</Badge>
							{/if}
						</div>
					</div>
				</div>

				<form method="POST" action="?/updateProfile" use:enhance class="mt-10 space-y-5">
					{#if form?.success}
						<Alert variant="success">Profile updated successfully.</Alert>
					{/if}
					{#if form?.error}
						<Alert variant="error">{form.error}</Alert>
					{/if}

					<Input
						label="Full name"
						name="full_name"
						value={form?.fullName ?? data.profile.full_name ?? ''}
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

		<!-- Account facts -->
		<div class="mt-5 shell shadow-ambient" use:reveal={{ delay: 80 }}>
			<div class="core p-7 sm:p-9">
				<h3 class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">Account information</h3>
				<dl class="mt-6 divide-y divide-charcoal-900/[0.06]">
					<div class="flex justify-between gap-4 py-3.5">
						<dt class="text-[14px] text-charcoal-500">Member since</dt>
						<dd class="text-[14px] font-medium text-charcoal-900">
							{formatDate(data.profile.member_since || data.profile.created_at)}
						</dd>
					</div>
					<div class="flex justify-between gap-4 py-3.5">
						<dt class="text-[14px] text-charcoal-500">Account status</dt>
						<dd class="text-[14px] font-medium {data.profile.is_suspended ? 'text-red-700' : 'text-sage-700'}">
							{data.profile.is_suspended ? 'Suspended' : 'Active'}
						</dd>
					</div>
					<div class="flex justify-between gap-4 py-3.5">
						<dt class="text-[14px] text-charcoal-500">Membership</dt>
						<dd class="text-[14px] font-medium text-charcoal-900">
							{data.profile.is_member ? 'Lifetime access' : 'No membership'}
						</dd>
					</div>
				</dl>
			</div>
		</div>

		<!-- Review -->
		{#if data.profile.is_member}
			<div class="mt-5 shell shadow-ambient" use:reveal={{ delay: 140 }}>
				<div class="core p-7 sm:p-9">
					<h3 class="text-[10px] uppercase tracking-eyebrow text-charcoal-400">Your review</h3>

					{#if data.testimonial}
						<figure class="mt-6 rounded-2xl bg-ivory-100 p-6">
							<div class="flex gap-1" aria-label="{data.testimonial.rating || 0} out of 5">
								{#each Array(5) as _, i}
									<svg
										class="h-3.5 w-3.5 {i < (data.testimonial.rating || 0) ? 'text-gold-400' : 'text-charcoal-200'}"
										fill="currentColor"
										viewBox="0 0 20 20"
										aria-hidden="true"
									>
										<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
									</svg>
								{/each}
							</div>
							<blockquote class="mt-4 font-serif text-[1.125rem] leading-relaxed text-charcoal-800">
								“{data.testimonial.content}”
							</blockquote>
							<figcaption class="mt-4">
								{#if data.testimonial.is_published}
									<Badge variant="sage" size="sm">
										{#snippet children()}Published{/snippet}
									</Badge>
								{:else}
									<Badge variant="warning" size="sm">
										{#snippet children()}Pending review{/snippet}
									</Badge>
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
								<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
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
