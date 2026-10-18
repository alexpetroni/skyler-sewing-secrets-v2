// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Access, AuthUser, Profile, Viewer } from '#lib/server/modules/auth/index.ts';
import type { Services } from '#lib/server/runtime/container.ts';

declare global {
	namespace App {
		interface Error {
			message: string;
			errorId?: string;
		}
		interface Locals {
			services: Services;
			user: AuthUser | null;
			profile: Profile | null;
			access: Access;
			requestId: string;
			maintenanceMode: boolean;
		}
		interface PageData {
			viewer: Viewer | null;
			maintenance: boolean;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
