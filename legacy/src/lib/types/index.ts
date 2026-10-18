// Re-export database types when generated
// export type * from './database';

// App-specific types

export interface User {
	id: string;
	email: string;
	full_name: string | null;
	avatar_url: string | null;
	is_member: boolean;
	is_admin: boolean;
	member_since: string | null;
	is_suspended: boolean;
	created_at: string;
}

export interface Module {
	id: string;
	title: string;
	slug: string;
	description: string | null;
	thumbnail_url: string | null;
	order_index: number;
	is_published: boolean;
	is_bonus: boolean;
	lessons_count?: number;
	completed_count?: number;
}

export interface Lesson {
	id: string;
	module_id: string;
	title: string;
	slug: string;
	description: string | null;
	content: string | null;
	video_url: string | null;
	thumbnail_url: string | null;
	lesson_type: 'video' | 'article';
	order_index: number;
	duration_minutes: number | null;
	is_free_preview: boolean;
	is_published: boolean;
	module?: Module;
	resources?: LessonResource[];
	progress?: UserProgress | null;
}

export interface LessonResource {
	id: string;
	lesson_id: string;
	title: string;
	file_url: string;
	file_type: string | null;
	file_size_bytes: number | null;
}

export interface UserProgress {
	id: string;
	user_id: string;
	lesson_id: string;
	completed: boolean;
	completed_at: string | null;
	last_position_seconds: number;
}

export interface BlogPost {
	id: string;
	title: string;
	slug: string;
	excerpt: string | null;
	content: string;
	featured_image_url: string | null;
	author_id: string | null;
	is_published: boolean;
	published_at: string | null;
	created_at: string;
	author?: User;
}

export interface Testimonial {
	id: string;
	author_name: string;
	author_title: string | null;
	author_avatar_url: string | null;
	country: string | null;
	content: string;
	rating: number | null;
	is_featured: boolean;
	order_index: number;
	is_published: boolean;
}

export interface FaqItem {
	id: string;
	question: string;
	answer: string;
	category: string | null;
	order_index: number;
	is_published: boolean;
}

export interface ContactSubmission {
	id: string;
	name: string;
	email: string;
	subject: string | null;
	message: string;
	is_read: boolean;
	created_at: string;
}

export interface NewsletterSubscriber {
	id: string;
	email: string;
	is_active: boolean;
	subscribed_at: string;
}

export interface Payment {
	id: string;
	user_id: string;
	stripe_payment_intent_id: string | null;
	stripe_checkout_session_id: string | null;
	amount: number;
	currency: string;
	status: 'pending' | 'succeeded' | 'failed' | 'refunded';
	created_at: string;
}

// Pricing types
export interface PricingConfig {
	id: string;
	base_price: number;
	currency: string;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface PromoCode {
	id: string;
	code: string;
	description: string | null;
	discount_type: 'percentage' | 'fixed';
	discount_value: number;
	max_uses: number | null;
	current_uses: number;
	valid_from: string;
	valid_until: string | null;
	is_active: boolean;
	created_at: string;
}

// Bunny.net video helper
export interface BunnyVideo {
	libraryId: string;
	videoId: string;
}

export function parseBunnyUrl(url: string): BunnyVideo | null {
	// Expected format: bunny:{libraryId}/{videoId}
	const match = url?.match(/^bunny:(\d+)\/(.+)$/);
	if (match) {
		return { libraryId: match[1], videoId: match[2] };
	}
	return null;
}

// Form validation
export interface FormError {
	field: string;
	message: string;
}

export interface ActionResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	errors?: FormError[];
}

// Pagination
export interface PaginatedResult<T> {
	data: T[];
	total: number;
	page: number;
	perPage: number;
	totalPages: number;
}

// Navigation
export interface NavItem {
	label: string;
	href: string;
	icon?: string;
	badge?: string | number;
	children?: NavItem[];
}
