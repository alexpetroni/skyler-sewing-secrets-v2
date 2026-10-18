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
	slug: string;
	title: string;
	kind: 'course' | 'bundle' | 'single';
	pricing: { price: number; listPrice: number; onSale: boolean };
}
