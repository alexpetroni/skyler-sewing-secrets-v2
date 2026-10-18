import type { AdminOrderStatus } from '#lib/shared/schemas/admin.ts';

/** Badge colour per order status on the admin order pages. */
export const statusVariant: Record<AdminOrderStatus, 'success' | 'warning' | 'error' | 'gray'> = {
	pending: 'warning',
	paid: 'success',
	expired: 'gray',
	refunded: 'error',
	partially_refunded: 'warning',
	disputed: 'error'
};
