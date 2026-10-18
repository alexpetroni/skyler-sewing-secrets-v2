<script lang="ts">
	import type { User } from '$lib/types';
	import { page } from '$app/state';
	import { Avatar } from '$lib/components/ui';
	import OptimizedImage from '$lib/components/ui/OptimizedImage.svelte';

	interface Props {
		user?: User | null;
	}

	let { user = null }: Props = $props();

	let menuOpen = $state(false);
	let userMenuOpen = $state(false);
	let scrolled = $state(false);
	let userMenuContainer = $state<HTMLDivElement | null>(null);
	let sentinel = $state<HTMLDivElement | null>(null);

	const navLinks = [
		{ href: '/', label: 'Home' },
		{ href: '/modules', label: 'Modules' },
		{ href: '/fabric-library', label: 'Fabric Library' },
		{ href: '/blog', label: 'Journal' },
		{ href: '/about', label: 'About' },
		{ href: '/faq', label: 'FAQ' },
		{ href: '/contact', label: 'Contact' }
	];

	const currentPath = $derived(page.url.pathname);

	function isActive(href: string) {
		return href === '/' ? currentPath === '/' : currentPath.startsWith(href);
	}

	function closeMenus() {
		menuOpen = false;
		userMenuOpen = false;
	}

	function handleWindowClick(event: MouseEvent) {
		if (userMenuOpen && userMenuContainer && !userMenuContainer.contains(event.target as Node)) {
			userMenuOpen = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') closeMenus();
	}

	// A sentinel beats a scroll listener here — no per-frame reflow just to
	// decide whether the island has lifted off the top of the page.
	$effect(() => {
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				scrolled = !entry.isIntersecting;
			},
			{ threshold: 0 }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	// Lock the page behind the full-screen menu.
	$effect(() => {
		if (typeof document === 'undefined') return;
		document.body.style.overflow = menuOpen ? 'hidden' : '';
		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

<div bind:this={sentinel} class="absolute top-0 h-px w-full" aria-hidden="true"></div>

<header class="pointer-events-none sticky top-0 z-40 w-full">
	<div
		class="mx-auto max-w-7xl px-4 transition-all duration-700 ease-fluid sm:px-6 {scrolled
			? 'pt-2 sm:pt-3'
			: 'pt-4 sm:pt-6'}"
	>
		<!-- The island: a glass pill that never touches the edges of the viewport. -->
		<nav
			class="pointer-events-auto flex items-center gap-3 rounded-full bg-ivory-50/80 px-3 py-2 ring-1 ring-inset ring-charcoal-900/[0.07] backdrop-blur-xl transition-all duration-700 ease-fluid sm:px-4 {scrolled
				? 'shadow-island'
				: 'shadow-ambient'}"
			aria-label="Primary"
		>
			<a href="/" class="flex shrink-0 items-center rounded-full pl-1 pr-2" onclick={closeMenus}>
				<span class="sr-only">Skyler's Sewing Secrets</span>
				<OptimizedImage
					class="h-11 w-auto transition-transform duration-700 ease-fluid sm:h-12"
					src="/logo/logo.png"
					alt="Skyler's Sewing Secrets"
					width={280}
				/>
			</a>

			<!-- Desktop links -->
			<div class="hidden flex-1 items-center justify-center gap-0.5 xl:flex">
				{#each navLinks as link}
					<a
						href={link.href}
						class="relative rounded-full px-3.5 py-2 text-[13px] font-medium tracking-wide transition-colors duration-400 ease-fluid {isActive(
							link.href
						)
							? 'text-charcoal-900'
							: 'text-charcoal-500 hover:text-charcoal-900'}"
					>
						{link.label}
						{#if isActive(link.href)}
							<span
								class="absolute inset-x-3.5 -bottom-0.5 h-px bg-gold-400"
								aria-hidden="true"
							></span>
						{/if}
					</a>
				{/each}
			</div>

			<div class="ml-auto flex items-center gap-2 xl:ml-0">
				{#if user}
					<div class="relative hidden sm:block" bind:this={userMenuContainer}>
						<button
							type="button"
							class="flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-[13px] font-medium text-charcoal-700 transition-colors duration-400 ease-fluid hover:bg-charcoal-900/[0.04]"
							onclick={() => (userMenuOpen = !userMenuOpen)}
							aria-expanded={userMenuOpen}
							aria-haspopup="menu"
						>
							<Avatar src={user.avatar_url} name={user.full_name || user.email} size="sm" />
							<span class="max-w-[10ch] truncate">{user.full_name?.split(' ')[0] || 'Account'}</span>
							<svg
								class="h-3 w-3 text-charcoal-400 transition-transform duration-400 ease-fluid {userMenuOpen
									? 'rotate-180'
									: ''}"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								stroke-width="1.25"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="m4 6 4 4 4-4" />
							</svg>
						</button>

						{#if userMenuOpen}
							<div
								class="absolute right-0 mt-3 w-64 origin-top-right animate-drift-in shell shadow-float"
								role="menu"
							>
								<div class="core overflow-hidden py-1.5">
									<div class="border-b border-charcoal-900/[0.06] px-4 py-3">
										<p class="truncate text-sm font-medium text-charcoal-900">
											{user.full_name || 'Account'}
										</p>
										<p class="truncate text-[12px] text-charcoal-500">{user.email}</p>
									</div>
									{#if user.is_member}
										<a href="/dashboard" class="block px-4 py-2.5 text-sm text-charcoal-600 transition-colors duration-300 ease-fluid hover:bg-ivory-100 hover:text-charcoal-900" onclick={closeMenus}>
											Dashboard
										</a>
									{/if}
									<a href="/profile" class="block px-4 py-2.5 text-sm text-charcoal-600 transition-colors duration-300 ease-fluid hover:bg-ivory-100 hover:text-charcoal-900" onclick={closeMenus}>
										My profile
									</a>
									{#if user.is_admin}
										<a href="/admin" class="block px-4 py-2.5 text-sm text-charcoal-600 transition-colors duration-300 ease-fluid hover:bg-ivory-100 hover:text-charcoal-900" onclick={closeMenus}>
											Admin panel
										</a>
									{/if}
									<form action="/auth/sign-out" method="POST" class="border-t border-charcoal-900/[0.06] pt-1">
										<button type="submit" class="block w-full px-4 py-2.5 text-left text-sm text-charcoal-600 transition-colors duration-300 ease-fluid hover:bg-ivory-100 hover:text-charcoal-900">
											Sign out
										</button>
									</form>
								</div>
							</div>
						{/if}
					</div>
				{:else}
					<a
						href="/auth/sign-in"
						class="hidden rounded-full px-3.5 py-2 text-[13px] font-medium text-charcoal-500 transition-colors duration-400 ease-fluid hover:text-charcoal-900 sm:block"
					>
						Log in
					</a>
					<a href="/checkout" class="btn-primary btn-sm group hidden sm:inline-flex">
						Enrol now
						<span class="btn-orb" aria-hidden="true">
							<svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
								<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
							</svg>
						</span>
					</a>
				{/if}

				<!-- Hamburger: two rules that fold into an X rather than swapping icons. -->
				<button
					type="button"
					class="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-400 ease-fluid hover:bg-charcoal-900/[0.05] xl:hidden"
					onclick={(e) => {
						e.stopPropagation();
						menuOpen = !menuOpen;
					}}
					aria-expanded={menuOpen}
					aria-label={menuOpen ? 'Close menu' : 'Open menu'}
				>
					<span
						class="absolute h-px w-5 bg-charcoal-800 transition-transform duration-700 ease-fluid {menuOpen
							? 'rotate-45'
							: '-translate-y-1'}"
					></span>
					<span
						class="absolute h-px w-5 bg-charcoal-800 transition-transform duration-700 ease-fluid {menuOpen
							? '-rotate-45'
							: 'translate-y-1'}"
					></span>
				</button>
			</div>
		</nav>
	</div>
</header>

<!-- Full-screen glass menu. Links arrive staggered, from beneath an invisible mask. -->
{#if menuOpen}
	<div class="fixed inset-0 z-30 xl:hidden" role="dialog" aria-modal="true" aria-label="Menu">
		<div class="absolute inset-0 bg-ivory-50/90 backdrop-blur-3xl"></div>

		<div class="relative flex h-[100dvh] flex-col overflow-y-auto px-6 pb-10 pt-28 sm:px-10">
			<nav class="flex flex-col">
				{#each navLinks as link, i}
					<a
						href={link.href}
						class="reveal is-revealed border-b border-charcoal-900/[0.07] py-4 font-serif text-[2rem] leading-none text-charcoal-900 transition-colors duration-400 ease-fluid hover:text-brand-700 sm:text-[2.5rem]"
						style="--reveal-delay: {60 + i * 55}ms"
						onclick={closeMenus}
					>
						<span class="mr-3 align-middle font-sans text-[10px] uppercase tracking-eyebrow text-charcoal-400">
							0{i + 1}
						</span>
						{link.label}
					</a>
				{/each}
			</nav>

			<div
				class="reveal is-revealed mt-10 flex flex-col gap-3"
				style="--reveal-delay: {60 + navLinks.length * 55}ms"
			>
				{#if user}
					<div class="mb-1 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-inset ring-charcoal-900/[0.06]">
						<p class="truncate text-sm font-medium text-charcoal-900">{user.full_name || 'Account'}</p>
						<p class="truncate text-[12px] text-charcoal-500">{user.email}</p>
					</div>
					{#if user.is_member}
						<a href="/dashboard" class="btn-primary w-full" onclick={closeMenus}>Dashboard</a>
					{/if}
					<a href="/profile" class="btn-secondary w-full" onclick={closeMenus}>My profile</a>
					{#if user.is_admin}
						<a href="/admin" class="btn-ghost w-full" onclick={closeMenus}>Admin panel</a>
					{/if}
					<form action="/auth/sign-out" method="POST">
						<button type="submit" class="btn-ghost w-full">Sign out</button>
					</form>
				{:else}
					<a href="/checkout" class="btn-primary group w-full" onclick={closeMenus}>
						Enrol now
						<span class="btn-orb" aria-hidden="true">
							<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
								<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
							</svg>
						</span>
					</a>
					<a href="/auth/sign-in" class="btn-secondary w-full" onclick={closeMenus}>Log in</a>
				{/if}
			</div>
		</div>
	</div>
{/if}
