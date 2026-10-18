/** Admin tables show dates in the UK style, as the legacy admin did. */
export function formatDate(value: string | null | undefined): string {
	if (!value) return '—';
	return new Date(value).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
}

export function formatDateTime(value: string | null | undefined): string {
	if (!value) return '—';
	return new Date(value).toLocaleString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}
