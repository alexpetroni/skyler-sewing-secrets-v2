import type { PageServerLoad } from './$types';
import { eq, desc, count, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { profiles, payments, modules, lessons, contact_submissions } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
	try {
		// Get stats
		const [
			[{ value: totalMembers }],
			succeededPayments,
			[{ value: totalModules }],
			[{ value: totalLessons }]
		] = await Promise.all([
			db.select({ value: count() }).from(profiles).where(eq(profiles.is_member, true)),
			db.select({ amount: payments.amount }).from(payments).where(eq(payments.status, 'succeeded')),
			db.select({ value: count() }).from(modules).where(eq(modules.is_published, true)),
			db.select({ value: count() }).from(lessons).where(eq(lessons.is_published, true))
		]);

		const totalRevenue = succeededPayments.reduce((sum, p) => sum + (p.amount || 0), 0) / 100;

		// Get recent members
		const recentMembers = await db
			.select({
				id: profiles.id,
				email: profiles.email,
				full_name: profiles.full_name,
				member_since: profiles.member_since,
				created_at: profiles.created_at
			})
			.from(profiles)
			.where(eq(profiles.is_member, true))
			.orderBy(desc(profiles.member_since))
			.limit(5);

		// Get recent payments
		const recentPayments = await db
			.select({
				id: payments.id,
				amount: payments.amount,
				currency: payments.currency,
				status: payments.status,
				created_at: payments.created_at,
				user_id: payments.user_id
			})
			.from(payments)
			.where(eq(payments.status, 'succeeded'))
			.orderBy(desc(payments.created_at))
			.limit(5);

		// Get user emails for payments
		const paymentUserIds = recentPayments.map(p => p.user_id).filter(Boolean);
		let paymentUsers: Record<string, { email: string }> = {};

		if (paymentUserIds.length > 0) {
			const users = await db
				.select({ id: profiles.id, email: profiles.email })
				.from(profiles)
				.where(inArray(profiles.id, paymentUserIds));

			paymentUsers = Object.fromEntries(users.map(u => [u.id, { email: u.email }]));
		}

		const paymentsWithUsers = recentPayments.map(p => ({
			...p,
			user: p.user_id ? paymentUsers[p.user_id] : null
		}));

		// Get recent contact submissions
		const recentContacts = await db
			.select({
				id: contact_submissions.id,
				name: contact_submissions.name,
				email: contact_submissions.email,
				subject: contact_submissions.subject,
				message: contact_submissions.message,
				is_read: contact_submissions.is_read,
				created_at: contact_submissions.created_at
			})
			.from(contact_submissions)
			.orderBy(desc(contact_submissions.created_at))
			.limit(5);

		return {
			stats: {
				totalMembers: totalMembers || 0,
				totalRevenue,
				totalModules: totalModules || 0,
				totalLessons: totalLessons || 0
			},
			recentMembers,
			recentPayments: paymentsWithUsers,
			recentContacts
		};
	} catch (err) {
		console.error('Failed to load admin dashboard data:', err);
		return {
			stats: {
				totalMembers: 0,
				totalRevenue: 0,
				totalModules: 0,
				totalLessons: 0
			},
			recentMembers: [],
			recentPayments: [],
			recentContacts: []
		};
	}
};
