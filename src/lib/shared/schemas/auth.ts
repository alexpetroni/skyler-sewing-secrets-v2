import * as v from 'valibot';

// Same shape check the legacy forms used.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emailField = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.nonEmpty('Email is required'),
	v.regex(EMAIL_PATTERN, 'Please enter a valid email address')
);

export const signInSchema = v.object({
	email: emailField,
	password: v.pipe(v.optional(v.string(), ''), v.nonEmpty('Password is required')),
	redirectTo: v.optional(v.string(), '')
});
export type SignInInput = v.InferOutput<typeof signInSchema>;

export const forgotPasswordSchema = v.object({ email: emailField });

/** The second sign-in step: a code from the authenticator app or a backup code. */
export const twoFactorSignInSchema = v.object({
	code: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.nonEmpty('Enter the code'),
		v.maxLength(32, 'That is not a valid code')
	),
	method: v.optional(v.picklist(['totp', 'backup']), 'totp'),
	redirectTo: v.optional(v.string(), '')
});

export const resetPasswordSchema = v.pipe(
	v.object({
		password: v.pipe(
			v.optional(v.string(), ''),
			v.nonEmpty('Password is required'),
			v.minLength(8, 'Password must be at least 8 characters')
		),
		confirmPassword: v.pipe(v.optional(v.string(), ''), v.nonEmpty('Please confirm your password'))
	}),
	v.forward(
		v.partialCheck(
			[['password'], ['confirmPassword']],
			(input) => input.password === input.confirmPassword,
			'Passwords do not match'
		),
		['confirmPassword']
	)
);

/** What a member types to delete their account when it has no password (Google only). */
export const DELETE_ACCOUNT_PHRASE = 'delete my account';

/** Self-service deletion: the password when the account has one, otherwise the phrase. */
export const deleteAccountSchema = v.object({
	password: v.optional(v.string(), ''),
	confirm: v.pipe(v.optional(v.string(), ''), v.trim())
});

/** First message per field, in the `{ field: message }` shape the forms render. */
export function fieldErrors(issues: readonly v.BaseIssue<unknown>[]): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const issue of issues) {
		const key = issue.path?.map((segment) => String(segment.key)).join('.');
		if (key && !(key in errors)) errors[key] = issue.message;
	}
	return errors;
}

/** The profile form, with the legacy limits and messages. */
export const profileNameSchema = v.object({
	full_name: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.minLength(2, 'Name must be at least 2 characters'),
		v.maxLength(100, 'Name must be 100 characters or fewer')
	)
});

/** The account step of a signed-out checkout, with the legacy limits and messages. */
export const checkoutAccountSchema = v.object({
	fullName: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.minLength(2, 'Please enter your full name'),
		v.maxLength(100, 'Full name must be 100 characters or fewer')
	),
	email: v.pipe(emailField, v.toLowerCase()),
	password: v.pipe(
		v.optional(v.string(), ''),
		v.nonEmpty('Password is required'),
		v.minLength(8, 'Password must be at least 8 characters')
	)
});
export type CheckoutAccountInput = v.InferOutput<typeof checkoutAccountSchema>;
