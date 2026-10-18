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

/** First message per field, in the `{ field: message }` shape the forms render. */
export function fieldErrors(issues: readonly v.BaseIssue<unknown>[]): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const issue of issues) {
		const key = issue.path?.map((segment) => String(segment.key)).join('.');
		if (key && !(key in errors)) errors[key] = issue.message;
	}
	return errors;
}
