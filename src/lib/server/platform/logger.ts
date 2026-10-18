export type LogFields = Record<string, unknown>;

/**
 * The logging interface services depend on. PHASE-06 replaces the console
 * implementation below with the JSON logger that redacts personal data; the
 * interface stays. Callers log ids and statuses, never personal data.
 */
export interface Logger {
	debug(message: string, fields?: LogFields): void;
	info(message: string, fields?: LogFields): void;
	warn(message: string, fields?: LogFields): void;
	error(message: string, fields?: LogFields): void;
	child(bindings: LogFields): Logger;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

/**
 * Temporary console-backed logger: one JSON line per call on stderr (Vercel
 * captures stderr). This is the only place in `src/` that touches `console`.
 */
export function createConsoleLogger(bindings: LogFields = {}): Logger {
	const emit = (level: Level, message: string, fields?: LogFields): void => {
		const line = JSON.stringify({
			ts: new Date().toISOString(),
			level,
			msg: message,
			...bindings,
			...fields
		});
		// eslint-disable-next-line no-console -- the logger is the console wrapper
		console.error(line);
	};

	return {
		debug: (message, fields) => emit('debug', message, fields),
		info: (message, fields) => emit('info', message, fields),
		warn: (message, fields) => emit('warn', message, fields),
		error: (message, fields) => emit('error', message, fields),
		child: (childBindings) => createConsoleLogger({ ...bindings, ...childBindings })
	};
}
