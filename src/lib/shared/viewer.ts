/** What the page shell knows about the signed-in visitor; `null` when signed out. */
export interface Viewer {
	name: string | null;
	avatarUrl: string | null;
	isAdmin: boolean;
}
