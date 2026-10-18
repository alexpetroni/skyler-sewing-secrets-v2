/** Where a lesson plays: course lessons under their module, standalone videos under `/videos`. */
export function lessonHref(moduleSlug: string | null, lessonSlug: string): string {
	return moduleSlug ? `/modules/${moduleSlug}/${lessonSlug}` : `/videos/${lessonSlug}`;
}

/** Whole minutes for a duration in seconds; null when unknown. */
export function durationMinutes(seconds: number | null): number | null {
	return seconds ? Math.max(1, Math.round(seconds / 60)) : null;
}

/** `45 min`, `1h 20m`, `2h`, as the legacy course pages showed durations. */
export function formatMinutes(minutes: number): string {
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
