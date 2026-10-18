import type { AdminMediaStatus } from '#lib/shared/schemas/admin.ts';

/** Badge label and colour per encoding status on the admin video pages. */
export const mediaStatusBadge: Record<
	AdminMediaStatus,
	{ label: string; variant: 'success' | 'warning' | 'error' | 'gray' }
> = {
	uploading: { label: 'Uploading', variant: 'gray' },
	processing: { label: 'Processing', variant: 'warning' },
	ready: { label: 'Ready', variant: 'success' },
	failed: { label: 'Failed', variant: 'error' }
};

/** `m:ss` (or `h:mm:ss`) for a duration in seconds; an em dash before Bunny reports one. */
export function formatDuration(seconds: number | null | undefined): string {
	if (!seconds) return '—';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = String(seconds % 60).padStart(2, '0');
	return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
