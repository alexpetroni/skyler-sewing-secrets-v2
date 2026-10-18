import type { ValidationErrors } from 'sveltekit-superforms';
import type { AdminMediaStatus } from '#lib/shared/schemas/admin.ts';

/** What `Form` hands its children: the current errors and whether a submission is in flight. */
export interface FormState<T extends Record<string, unknown>> {
	errors: ValidationErrors<T>;
	submitting: boolean;
}

export interface DataTableColumn<T> {
	key: string;
	label: string;
	align?: 'left' | 'right';
	/** Makes the header a sort toggle over the rows on this page. */
	sortValue?: (row: T) => string | number | null;
}

export interface DataTablePagination {
	page: number;
	pageCount: number;
	total: number;
	/** The URL of another page, keeping the current filters. */
	href: (page: number) => string;
}

/** What the media picker needs of a `media_assets` row. */
export interface PickerAsset {
	id: string;
	title: string | null;
	status: AdminMediaStatus;
	duration_seconds: number | null;
	thumbnail_url: string | null;
}
