import type { AuthSession, AuthUser } from '$lib/server/auth';
import type { User } from '$lib/types';

declare global {
	namespace App {
		interface Locals {
			session: AuthSession | null;
			user: AuthUser | null;
			profile: User | null;
			maintenanceMode: boolean;
		}

		interface PageData {
			user: AuthUser | null;
			profile: User | null;
		}

		interface Error {
			message: string;
			errorId?: string;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
