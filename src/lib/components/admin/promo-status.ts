import type { PromoStatus } from '#lib/shared/schemas/commerce.ts';

/** Badge label and colour per promotion status on the admin pages. */
export const promoStatusBadge: Record<
	PromoStatus,
	{ label: string; variant: 'success' | 'blue' | 'gray' | 'yellow' }
> = {
	active: { label: 'Active', variant: 'success' },
	scheduled: { label: 'Scheduled', variant: 'blue' },
	expired: { label: 'Expired', variant: 'gray' },
	exhausted: { label: 'Used up', variant: 'yellow' },
	inactive: { label: 'Inactive', variant: 'gray' }
};
