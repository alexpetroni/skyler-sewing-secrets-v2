import { relations } from 'drizzle-orm';
import { profiles } from './profiles.ts';
import { modules, lessons, lesson_resources, user_progress } from './content.ts';
import { blog_posts, testimonials } from './marketing.ts';
import { promo_codes, payments } from './legacy-commerce.ts';

// =============================================
// Relations (for db.query relational queries, replacing
// PostgREST nested embeds like select('*, lessons(*)'))
// =============================================
export const modulesRelations = relations(modules, ({ many }) => ({
	lessons: many(lessons)
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
	module: one(modules, { fields: [lessons.module_id], references: [modules.id] }),
	resources: many(lesson_resources),
	progress: many(user_progress)
}));

export const lessonResourcesRelations = relations(lesson_resources, ({ one }) => ({
	lesson: one(lessons, { fields: [lesson_resources.lesson_id], references: [lessons.id] })
}));

export const userProgressRelations = relations(user_progress, ({ one }) => ({
	lesson: one(lessons, { fields: [user_progress.lesson_id], references: [lessons.id] }),
	profile: one(profiles, { fields: [user_progress.user_id], references: [profiles.id] })
}));

export const profilesRelations = relations(profiles, ({ many }) => ({
	progress: many(user_progress),
	payments: many(payments),
	testimonials: many(testimonials)
}));

export const blogPostsRelations = relations(blog_posts, ({ one }) => ({
	author: one(profiles, { fields: [blog_posts.author_id], references: [profiles.id] })
}));

export const testimonialsRelations = relations(testimonials, ({ one }) => ({
	profile: one(profiles, { fields: [testimonials.user_id], references: [profiles.id] })
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
	profile: one(profiles, { fields: [payments.user_id], references: [profiles.id] }),
	promo_code: one(promo_codes, { fields: [payments.promo_code_id], references: [promo_codes.id] })
}));

export const promoCodesRelations = relations(promo_codes, ({ many }) => ({
	payments: many(payments)
}));
