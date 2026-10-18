<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open?: boolean;
		title?: string;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		onclose?: () => void;
		children: Snippet;
		footer?: Snippet;
	}

	let { open = $bindable(false), title, size = 'md', onclose, children, footer }: Props = $props();

	const sizeClasses: Record<string, string> = {
		sm: 'sm:max-w-md',
		md: 'sm:max-w-xl',
		lg: 'sm:max-w-3xl',
		xl: 'sm:max-w-5xl'
	};

	function handleClose() {
		open = false;
		onclose?.();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') handleClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="fixed inset-0 z-40 overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
		<!-- Glass backdrop. Fixed, so the blur never repaints with scrolling content. -->
		<button
			type="button"
			class="fixed inset-0 cursor-default bg-charcoal-950/40 backdrop-blur-xl"
			aria-label="Close dialog"
			onclick={handleClose}
		></button>

		<div class="pointer-events-none flex min-h-full items-end justify-center p-4 sm:items-center sm:p-8">
			<div
				class="pointer-events-auto relative w-full animate-drift-in {sizeClasses[size]} shell-lg shadow-float"
			>
				<div class="core-lg overflow-hidden">
					{#if title}
						<div class="flex items-center justify-between gap-4 border-b border-charcoal-900/[0.06] px-7 py-5">
							<h3 class="card-title">{title}</h3>
							<button
								type="button"
								class="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-charcoal-900/[0.04] text-charcoal-500 transition-all duration-400 ease-fluid hover:bg-charcoal-900/[0.08] hover:text-charcoal-900 active:scale-95"
								onclick={handleClose}
							>
								<span class="sr-only">Close</span>
								<svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
									<path d="m4 4 8 8M12 4l-8 8" />
								</svg>
							</button>
						</div>
					{/if}

					<div class="px-7 py-6">
						{@render children()}
					</div>

					{#if footer}
						<div class="border-t border-charcoal-900/[0.06] bg-ivory-50/70 px-7 py-5">
							{@render footer()}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
