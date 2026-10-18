/**
 * The shapes the course components render. Structural, so the member-area
 * loads pass their results straight in.
 */
export type LessonLockState = 'open' | 'locked' | 'suspended';

export interface SidebarLesson {
	id: string;
	title: string;
	href: string;
	durationSeconds: number | null;
	lockState: LessonLockState;
	completed: boolean;
}

/** A downloadable file; the link goes through `/download/[id]`, never to the file itself. */
export interface ResourceLink {
	id: string;
	title: string;
	fileType: string | null;
	fileSizeBytes: number | null;
}

/** A product that unlocks a locked lesson, with what it costs now. */
export interface UnlockOffer {
	/** The product id `AddToCartButton` posts. */
	id: string;
	slug: string;
	title: string;
	kind: 'course' | 'bundle' | 'single';
	pricing: { price: number; listPrice: number; onSale: boolean };
}

/** The lesson page data, shared by course lessons and standalone videos. */
export interface LessonPageBase {
	lesson: {
		id: string;
		slug: string;
		title: string;
		description: string | null;
		kind: 'video' | 'article';
		isFreePreview: boolean;
	};
	module: { slug: string; title: string } | null;
	/** The module's lessons, or the other standalone videos, with the viewer's lock state. */
	siblings: SidebarLesson[];
	/** The viewer owns every sibling, so the sidebar shows their progress. */
	ownsAllSiblings: boolean;
}

export interface LockedLessonPage extends LessonPageBase {
	locked: true;
	unlockOptions: { cheapest: UnlockOffer | null; flagship: UnlockOffer | null };
	/** Sign-in link back to this lesson; null when signed in. */
	signInHref: string | null;
}

export interface OpenLessonPage extends LessonPageBase {
	locked: false;
	/** Signed on the server; null for articles and lessons without media. */
	embedUrl: string | null;
	contentHtml: string | null;
	durationSeconds: number | null;
	/** Owners only: a free preview never exposes its resources to anyone else. */
	resources: ResourceLink[];
	/** Where playback resumes, in seconds. */
	startAt: number;
	completed: boolean;
	/** Signed in and not suspended: progress may be recorded. */
	canTrackProgress: boolean;
}

export type LessonPage = LockedLessonPage | OpenLessonPage;
