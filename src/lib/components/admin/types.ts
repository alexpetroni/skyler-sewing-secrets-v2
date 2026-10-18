import type { ValidationErrors } from 'sveltekit-superforms';

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
