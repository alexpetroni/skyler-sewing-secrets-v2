/** Limits of `POST /admin/api/upload`, shared with the admin upload button. */
export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

/** Allowed content types and the extension each is stored under. */
export const UPLOAD_EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'application/pdf': 'pdf'
};

/** The `accept` attribute for image fields (cover, featured image). */
export const ACCEPT_IMAGES = 'image/jpeg,image/png,image/webp,image/avif';
/** The `accept` attribute for lesson resources: documents and images. */
export const ACCEPT_RESOURCES = `application/pdf,${ACCEPT_IMAGES}`;
