import type { Logger } from './logger.ts';

/**
 * On-demand ISR revalidation on Vercel: a request to the page carrying the
 * bypass token in `x-prerender-revalidate` regenerates the cached copy. A
 * no-op unless both the token and the site URL are configured, and harmless
 * for pages that are not cached.
 */
export interface Revalidator {
	/** Asks for fresh copies of the given root-relative paths; never throws. */
	revalidate(paths: readonly string[]): Promise<void>;
}

export interface RevalidatorOptions {
	bypassToken?: string;
	siteUrl?: string;
	fetch: typeof fetch;
	log: Logger;
}

export const REVALIDATE_HEADER = 'x-prerender-revalidate';

export function createRevalidator({
	bypassToken,
	siteUrl,
	fetch: fetchFn,
	log
}: RevalidatorOptions): Revalidator {
	return {
		async revalidate(paths) {
			if (!bypassToken || !siteUrl) return;
			for (const path of paths) {
				try {
					const response = await fetchFn(new URL(path, siteUrl), {
						method: 'HEAD',
						headers: { [REVALIDATE_HEADER]: bypassToken }
					});
					if (!response.ok) log.warn('revalidation refused', { path, status: response.status });
				} catch (err) {
					// The publish already committed; a stale page refreshes on its own schedule.
					log.warn('revalidation failed', {
						path,
						error: err instanceof Error ? err.message : String(err)
					});
				}
			}
		}
	};
}
