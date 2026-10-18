export { createAuth, type Auth, type AuthSession, type AuthUser } from './create-auth.ts';
export type { CreateAuthOptions } from './create-auth.ts';
export {
	createAuthService,
	type AuthService,
	type CreateCredentialUserInput,
	type EnsureProfileInput,
	type Profile
} from './service.ts';
export {
	isActiveAdmin,
	isSuspended,
	NO_ACCESS,
	requireActiveMember,
	requireAdmin,
	requireUser,
	resolveAccess,
	SUSPENDED_MESSAGE,
	toViewer,
	type Access,
	type SignedIn
} from './access.ts';
export type { Viewer } from '#lib/shared/viewer.ts';
