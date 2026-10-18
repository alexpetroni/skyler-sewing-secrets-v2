import type { Action } from 'svelte/action';

interface RevealOptions {
	/** Milliseconds to hold before the element resolves — used to stagger siblings. */
	delay?: number;
	/** How far into the viewport the element must travel before it fires. */
	threshold?: number;
	/** Re-hide the element once it leaves the viewport again. */
	once?: boolean;
}

const REDUCED = '(prefers-reduced-motion: reduce)';

/**
 * Scroll entry choreography. Elements arrive with a heavy, blurred drift rather
 * than snapping into place. IntersectionObserver only — a scroll listener here
 * would reflow on every frame and shred mobile performance.
 */
export const reveal: Action<HTMLElement, RevealOptions | undefined> = (node, options) => {
	const { delay = 0, threshold = 0.15, once = true } = options ?? {};

	if (typeof window === 'undefined') return;

	if (window.matchMedia(REDUCED).matches) {
		node.classList.add('is-revealed');
		return;
	}

	node.classList.add('reveal');
	if (delay) node.style.setProperty('--reveal-delay', `${delay}ms`);

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					node.classList.add('is-revealed');
					if (once) observer.unobserve(node);
				} else if (!once) {
					node.classList.remove('is-revealed');
				}
			}
		},
		{ threshold, rootMargin: '0px 0px -8% 0px' }
	);

	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		}
	};
};
