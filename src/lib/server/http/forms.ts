import { fail, type ActionFailure } from '@sveltejs/kit';
import { valibot } from 'sveltekit-superforms/adapters';
import { setError, superValidate, type SuperValidated } from 'sveltekit-superforms/server';
import type { GenericSchema, InferInput, InferOutput } from 'valibot';
import { DomainError } from '#lib/server/modules/errors.ts';

/** The string fields of a submitted form; file parts are ignored. */
export async function readForm(request: Request): Promise<Record<string, string>> {
	const formData = await request.formData();
	const values: Record<string, string> = {};
	for (const [name, value] of formData) {
		if (typeof value === 'string') values[name] = value;
	}
	return values;
}

type AsRecord<T> = T extends Record<string, unknown> ? T : never;
type FormOutput<S extends GenericSchema> = AsRecord<InferOutput<S>>;
type FormInput<S extends GenericSchema> = AsRecord<InferInput<S>>;

/** The superforms state of an admin form; form-level messages are plain strings. */
export type AdminSuperForm<S extends GenericSchema> = SuperValidated<
	FormOutput<S>,
	string,
	FormInput<S>
>;

export type AdminFormFailure<S extends GenericSchema> = ActionFailure<{ form: AdminSuperForm<S> }>;

export type AdminFormResult<S extends GenericSchema> =
	| { ok: true; data: FormOutput<S>; form: AdminSuperForm<S> }
	| { ok: false; failure: AdminFormFailure<S> };

export interface AdminForm<S extends GenericSchema> {
	/** An empty form for a page load (no validation errors shown). */
	empty(): Promise<AdminSuperForm<S>>;
	/** Validates the submitted body; a ready `fail(400, { form })` when it does not pass. */
	parse(request: Request): Promise<AdminFormResult<S>>;
}

/**
 * The one way an admin action reads its input: `superValidate(request,
 * valibot(schema))`, so the same valibot schema decides on the server and
 * drives the inline errors on the page. Define it once per form at module
 * scope: the adapter (and its JSON Schema) is built once.
 */
export function adminForm<S extends GenericSchema<Record<string, unknown>>>(
	schema: S,
	/** Distinguishes several forms on one page that share a schema. */
	options: { id?: string } = {}
): AdminForm<S> {
	const adapter = valibot(schema);
	return {
		async empty() {
			return (await superValidate(adapter, { id: options.id })) as AdminSuperForm<S>;
		},
		async parse(request) {
			const form = (await superValidate(request, adapter, { id: options.id })) as AdminSuperForm<S>;
			if (!form.valid) return { ok: false, failure: fail(400, { form }) };
			return { ok: true, data: form.data, form };
		}
	};
}

/**
 * Turns a service's `DomainError` into the form's error: on the field the
 * code is mapped to in `fields`, otherwise form-level. `*_NOT_FOUND` codes are
 * a 404, every other refusal a 400. Anything that is not a `DomainError` is a
 * bug and is rethrown.
 */
export function mapDomainError<S extends GenericSchema>(
	form: AdminSuperForm<S>,
	err: unknown,
	fields: Record<string, string> = {}
): AdminFormFailure<S> {
	if (!(err instanceof DomainError)) throw err;
	const status = err.code.endsWith('_NOT_FOUND') ? 404 : 400;
	const field = fields[err.code];
	const failure = field
		? setError(form, field as '', err.message, { status })
		: setError(form, err.message, { status });
	return failure as AdminFormFailure<S>;
}
