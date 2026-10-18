/** The string fields of a submitted form; file parts are ignored. */
export async function readForm(request: Request): Promise<Record<string, string>> {
	const formData = await request.formData();
	const values: Record<string, string> = {};
	for (const [name, value] of formData) {
		if (typeof value === 'string') values[name] = value;
	}
	return values;
}
