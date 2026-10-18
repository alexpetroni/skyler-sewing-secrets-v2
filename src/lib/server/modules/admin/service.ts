import { eq } from 'drizzle-orm';
import { schema, withTx, type Db, type Tx } from '#lib/server/db/index.ts';
import type {
	BunnyStorage,
	CheckoutSessionView,
	Logger,
	PaymentGateway
} from '#lib/server/platform/index.ts';
import { UPLOAD_EXTENSIONS, UPLOAD_MAX_BYTES } from '#lib/shared/uploads.ts';
import type { AuditListParams, OrderListParams } from './queries.ts';
import * as queries from './queries.ts';
import type { Auth, AuthService, Profile } from '../auth/index.ts';
import type { CatalogService } from '../catalog/index.ts';
import type {
	FulfilmentService,
	FulfilOrderResult,
	OrderService,
	OrderWithItems
} from '../commerce/index.ts';
import type { Entitlement, EntitlementService } from '../entitlements/index.ts';
import { DomainError } from '../errors.ts';

const { audit_log, orders, promo_codes, sessions, users } = schema;

export interface CreateAdminServiceDeps {
	db: Db;
	/** Better Auth, for the password-reset email. */
	auth: Pick<Auth, 'api'>;
	users: AuthService;
	entitlements: EntitlementService;
	orders: OrderService;
	fulfilment: FulfilmentService;
	catalog: CatalogService;
	gateway: PaymentGateway;
	/** Bunny Storage for the upload endpoint. */
	storage: BunnyStorage;
	log: Logger;
	now?: () => Date;
}

export interface StoreUploadInput {
	contentType: string;
	size: number;
	/** Reads the bytes; called only once the type and size pass. */
	read: () => Promise<Uint8Array<ArrayBuffer>>;
	actorId: string;
}

export interface GrantProductInput {
	userId: string;
	productId: string;
	actorId: string;
	reason: string;
}

export type RevokeProductInput = GrantProductInput;

export interface ProductOption {
	id: string;
	title: string;
	kind: 'course' | 'bundle' | 'single';
	isPublished: boolean;
}

export interface UserDetail {
	profile: Profile;
	orders: OrderWithItems[];
	entitlements: queries.UserEntitlementRow[];
	progress: queries.ProgressSummary;
	sessionCount: number;
	/** Every product, for the grant picker (`catalog.listAll`). */
	products: ProductOption[];
}

export interface StripeLinks {
	session: string | null;
	paymentIntent: string | null;
	customer: string | null;
}

export interface OrderItemDetail {
	id: string;
	productId: string;
	productTitle: string;
	listPrice: number;
	unitPrice: number;
	discount: number;
	refunded: number;
	/** What fulfilment did for this line. */
	access: 'none' | 'granted' | 'revoked';
}

export interface OrderDetail {
	order: Omit<OrderWithItems, 'items'>;
	buyer: { id: string; email: string; fullName: string | null };
	promoCode: string | null;
	items: OrderItemDetail[];
	events: queries.WebhookEventRow[];
	audit: queries.AuditRow[];
	links: StripeLinks;
}

export interface AdminService {
	dashboard(now?: Date): Promise<queries.DashboardStats>;
	users: {
		search(q: string, page: number): Promise<queries.Paged<queries.UserRow>>;
		detail(id: string): Promise<UserDetail | null>;
		/** Complimentary access: `source = 'admin_grant'`, the reason kept in `audit_log`. */
		grantProduct(input: GrantProductInput): Promise<Entitlement>;
		revokeProduct(input: RevokeProductInput): Promise<Entitlement>;
		suspend(input: { userId: string; reason: string; actorId: string }): Promise<Profile>;
		unsuspend(input: { userId: string; actorId: string }): Promise<Profile>;
		setAdmin(input: { userId: string; isAdmin: boolean; actorId: string }): Promise<Profile>;
		/** Better Auth mints the token and sends the email; the request is audited. */
		sendReset(input: { userId: string; actorId: string }): Promise<void>;
		revokeSessions(input: { userId: string; actorId: string }): Promise<number>;
	};
	orders: {
		list(params: OrderListParams): Promise<queries.Paged<queries.OrderRow>>;
		detail(id: string): Promise<OrderDetail | null>;
		/** Retrieves the Checkout Session from Stripe and runs `fulfilOrder` again (idempotent). */
		rerunFulfilment(id: string, actorId: string): Promise<FulfilOrderResult>;
		/** Appends a dated note to `orders.admin_notes`. */
		addNote(id: string, note: string, actorId: string): Promise<string>;
	};
	audit: {
		list(params: AuditListParams): Promise<queries.Paged<queries.AuditRow>>;
	};
	uploads: {
		/**
		 * Stores an admin upload under `uploads/<yyyy>/<mm>/<uuid>.<ext>` and
		 * audits it. Refuses types outside the allow-list (`UPLOAD_TYPE_NOT_ALLOWED`)
		 * and files over 25 MB (`UPLOAD_TOO_LARGE`).
		 */
		store(input: StoreUploadInput): Promise<{ url: string; path: string }>;
	};
}

interface AuditEntry {
	actorId: string;
	action: string;
	entity: string;
	entityId: string;
	before?: unknown;
	after?: unknown;
}

const STRIPE_DASHBOARD = 'https://dashboard.stripe.com';

/** Dashboard URLs for the order's Stripe objects; test-mode sessions link to test data. */
export function stripeLinks(ids: {
	sessionId: string | null;
	paymentIntentId: string | null;
	customerId: string | null;
}): StripeLinks {
	const base = ids.sessionId?.startsWith('cs_test_')
		? `${STRIPE_DASHBOARD}/test`
		: STRIPE_DASHBOARD;
	return {
		session: ids.sessionId ? `${base}/search?query=${encodeURIComponent(ids.sessionId)}` : null,
		paymentIntent: ids.paymentIntentId
			? `${base}/payments/${encodeURIComponent(ids.paymentIntentId)}`
			: null,
		customer: ids.customerId ? `${base}/customers/${encodeURIComponent(ids.customerId)}` : null
	};
}

export function createAdminService({
	db,
	auth,
	users: userService,
	entitlements,
	orders: orderService,
	fulfilment,
	catalog,
	gateway,
	storage,
	log,
	now = () => new Date()
}: CreateAdminServiceDeps): AdminService {
	async function writeAudit(executor: Db | Tx, entry: AuditEntry): Promise<void> {
		await executor.insert(audit_log).values({
			actor_id: entry.actorId,
			action: entry.action,
			entity: entry.entity,
			entity_id: entry.entityId,
			before: entry.before ?? null,
			after: entry.after ?? null
		});
	}

	async function requireProfile(userId: string): Promise<Profile> {
		const profile = await userService.getProfile(userId);
		if (!profile) throw new DomainError('USER_NOT_FOUND', 'User not found');
		return profile;
	}

	async function requireOrder(orderId: string): Promise<OrderWithItems> {
		const order = await orderService.getById(orderId);
		if (!order) throw new DomainError('ORDER_NOT_FOUND', 'Order not found');
		return order;
	}

	return {
		dashboard: (at) => queries.dashboard(db, at ?? now()),

		users: {
			search: (q, page) => queries.searchUsers(db, q, page),

			async detail(id) {
				const profile = await userService.getProfile(id);
				if (!profile) return null;
				const [ordersForUser, owned, progress, sessionCount, products] = await Promise.all([
					orderService.listForUser(id),
					queries.userEntitlements(db, id),
					queries.progressSummary(db, id),
					queries.activeSessionCount(db, id, now()),
					catalog.listAll()
				]);
				return {
					profile,
					orders: ordersForUser,
					entitlements: owned,
					progress,
					sessionCount,
					products: products.map((product) => ({
						id: product.id,
						title: product.title,
						kind: product.kind,
						isPublished: product.is_published
					}))
				};
			},

			async grantProduct({ userId, productId, actorId, reason }) {
				await requireProfile(userId);
				const owned = await entitlements.ownedProductIds(userId);
				if (owned.includes(productId)) {
					throw new DomainError('ALREADY_OWNED', 'This user already owns that product');
				}
				// The grant writes the entitlement, its audit row (actor + reason)
				// and the `is_member` sync in one transaction.
				const granted = await entitlements.grant({
					userId,
					productId,
					source: 'admin_grant',
					actorId,
					reason
				});
				log.info('admin granted product', { userId, productId, actorId });
				return granted;
			},

			async revokeProduct({ userId, productId, actorId, reason }) {
				await requireProfile(userId);
				const revoked = await entitlements.revoke({ userId, productId, reason, actorId });
				if (!revoked) {
					throw new DomainError('NOT_OWNED', 'This user has no active access to that product');
				}
				log.info('admin revoked product', { userId, productId, actorId });
				return revoked;
			},

			async suspend({ userId, reason, actorId }) {
				const profile = await requireProfile(userId);
				if (profile.is_admin) {
					throw new DomainError(
						'USER_IS_ADMIN',
						'An admin account cannot be suspended; remove admin first'
					);
				}
				const suspended = await userService.suspend(userId, reason, actorId);
				log.info('admin suspended user', { userId, actorId });
				return suspended;
			},

			async unsuspend({ userId, actorId }) {
				await requireProfile(userId);
				const profile = await userService.unsuspend(userId, actorId);
				log.info('admin unsuspended user', { userId, actorId });
				return profile;
			},

			async setAdmin({ userId, isAdmin, actorId }) {
				const profile = await requireProfile(userId);
				if (!isAdmin && userId === actorId) {
					throw new DomainError('CANNOT_DEMOTE_SELF', 'You cannot remove your own admin access');
				}
				if (isAdmin && profile.is_suspended) {
					throw new DomainError('USER_SUSPENDED', 'Unsuspend the account before making it admin');
				}
				const updated = await userService.setAdmin(userId, isAdmin, actorId);
				log.info('admin changed admin flag', { userId, isAdmin, actorId });
				return updated;
			},

			async sendReset({ userId, actorId }) {
				await requireProfile(userId);
				const [account] = await db
					.select({ email: users.email })
					.from(users)
					.where(eq(users.id, userId))
					.limit(1);
				if (!account) throw new DomainError('USER_NOT_FOUND', 'User not found');
				await auth.api.requestPasswordReset({
					body: { email: account.email, redirectTo: '/auth/reset-password' }
				});
				await writeAudit(db, {
					actorId,
					action: 'user.send_reset',
					entity: 'profile',
					entityId: userId
				});
				log.info('admin sent password reset', { userId, actorId });
			},

			async revokeSessions({ userId, actorId }) {
				await requireProfile(userId);
				const removed = await withTx(db, async (tx) => {
					const rows = await tx
						.delete(sessions)
						.where(eq(sessions.userId, userId))
						.returning({ id: sessions.id });
					await writeAudit(tx, {
						actorId,
						action: 'user.revoke_sessions',
						entity: 'profile',
						entityId: userId,
						after: { sessions_revoked: rows.length }
					});
					return rows.length;
				});
				log.info('admin revoked sessions', { userId, actorId, count: removed });
				return removed;
			}
		},

		orders: {
			list: (params) => queries.listOrders(db, params),

			async detail(id) {
				const order = await orderService.getById(id);
				if (!order) return null;
				const { items, ...rest } = order;
				const [buyer, promo, granted, events, audit] = await Promise.all([
					userService.getProfile(order.user_id),
					order.promo_code_id
						? db
								.select({ code: promo_codes.code })
								.from(promo_codes)
								.where(eq(promo_codes.id, order.promo_code_id))
								.limit(1)
						: Promise.resolve([]),
					queries.userEntitlements(db, order.user_id),
					queries.webhookEventsFor(db, [
						order.stripe_checkout_session_id,
						order.stripe_payment_intent_id
					]),
					queries.listAudit(db, { entity: 'order', entityId: id, page: 1 })
				]);
				const accessFor = (itemId: string): OrderItemDetail['access'] => {
					const lines = granted.filter((row) => row.orderItemId === itemId);
					if (lines.some((row) => row.revokedAt === null)) return 'granted';
					return lines.length > 0 ? 'revoked' : 'none';
				};
				return {
					order: rest,
					buyer: {
						id: order.user_id,
						email: buyer?.email ?? '',
						fullName: buyer?.full_name ?? null
					},
					promoCode: promo[0]?.code ?? null,
					items: items.map((item) => ({
						id: item.id,
						productId: item.product_id,
						productTitle: item.product_title,
						listPrice: item.list_price,
						unitPrice: item.unit_price,
						discount: item.discount_amount,
						refunded: item.refunded_amount,
						access: accessFor(item.id)
					})),
					events,
					audit: audit.rows,
					links: stripeLinks({
						sessionId: order.stripe_checkout_session_id,
						paymentIntentId: order.stripe_payment_intent_id,
						customerId: buyer?.stripe_customer_id ?? null
					})
				};
			},

			async rerunFulfilment(id, actorId) {
				const order = await requireOrder(id);
				if (!order.stripe_checkout_session_id) {
					throw new DomainError('NO_CHECKOUT_SESSION', 'This order never reached Stripe Checkout');
				}
				const session: CheckoutSessionView = await gateway.retrieveCheckoutSession(
					order.stripe_checkout_session_id
				);
				// `fulfilOrder` owns its transaction (it locks the order row and sends
				// the emails after commit), so the outcome is audited right after it.
				const result = await fulfilment.fulfilOrder(id, session);
				await writeAudit(db, {
					actorId,
					action: 'order.rerun_fulfilment',
					entity: 'order',
					entityId: id,
					before: { status: order.status },
					after: 'alreadyFulfilled' in result ? { already_fulfilled: true } : { status: 'paid' }
				});
				log.info('admin re-ran fulfilment', { orderId: id, actorId });
				return result;
			},

			addNote(id, note, actorId) {
				return withTx(db, async (tx) => {
					const [order] = await tx
						.select({ notes: orders.admin_notes })
						.from(orders)
						.where(eq(orders.id, id))
						.for('update');
					if (!order) throw new DomainError('ORDER_NOT_FOUND', 'Order not found');
					const entry = `${now().toISOString().slice(0, 16).replace('T', ' ')} — ${note}`;
					const notes = order.notes ? `${order.notes}\n\n${entry}` : entry;
					await tx.update(orders).set({ admin_notes: notes }).where(eq(orders.id, id));
					await writeAudit(tx, {
						actorId,
						action: 'order.add_note',
						entity: 'order',
						entityId: id,
						before: { admin_notes: order.notes },
						after: { admin_notes: notes }
					});
					return notes;
				});
			}
		},

		audit: {
			list: (params) => queries.listAudit(db, params)
		},

		uploads: {
			async store({ contentType, size, read, actorId }) {
				const ext = UPLOAD_EXTENSIONS[contentType];
				if (!ext) {
					throw new DomainError(
						'UPLOAD_TYPE_NOT_ALLOWED',
						'Only JPEG, PNG, WebP, AVIF images and PDF files can be uploaded'
					);
				}
				if (size > UPLOAD_MAX_BYTES) {
					throw new DomainError('UPLOAD_TOO_LARGE', 'Files must be 25 MB or smaller');
				}
				const bytes = await read();
				if (bytes.byteLength > UPLOAD_MAX_BYTES) {
					throw new DomainError('UPLOAD_TOO_LARGE', 'Files must be 25 MB or smaller');
				}
				const at = now();
				const path = `uploads/${at.getUTCFullYear()}/${String(at.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;
				const url = await storage.put(path, bytes, contentType);
				await writeAudit(db, {
					actorId,
					action: 'upload.put',
					entity: 'upload',
					entityId: path,
					after: { path, url, content_type: contentType, size: bytes.byteLength }
				});
				log.info('admin uploaded a file', { actorId, path, size: bytes.byteLength });
				return { url, path };
			}
		}
	};
}
