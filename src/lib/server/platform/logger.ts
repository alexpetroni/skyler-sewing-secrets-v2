export type LogFields = Record<string, unknown>;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * The logging interface services depend on. Callers log ids and statuses,
 * never personal data; the implementation redacts the usual suspects anyway.
 */
export interface Logger {
	debug(message: string, fields?: LogFields): void;
	info(message: string, fields?: LogFields): void;
	warn(message: string, fields?: LogFields): void;
	error(message: string, fields?: LogFields): void;
	child(bindings: LogFields): Logger;
}

/** Receives one serialised JSON line per log call. */
export type LogSink = (line: string) => void;

export interface LoggerOptions {
	/** Calls below this level are dropped. */
	level: LogLevel;
	/** Defaults to `console.error` (Vercel captures stderr). */
	sink?: LogSink;
	/** Clock for the `ts` field; injectable for tests. */
	now?: () => Date;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Field names whose values never reach the log, compared case-insensitively
 * and ignoring `_`/`-` (so `fullName`, `full_name` and `FULL-NAME` all match).
 */
const REDACTED_KEYS = new Set([
	'email',
	'name',
	'fullname',
	'password',
	'token',
	'authorization',
	'cookie'
]);

export const REDACTED = '[redacted]';

const RESERVED_KEYS = new Set(['ts', 'level', 'msg']);

function isRedactedKey(key: string): boolean {
	return REDACTED_KEYS.has(key.toLowerCase().replace(/[_-]/g, ''));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const proto: unknown = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

function redactLevel(fields: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(fields)) {
		out[key] = isRedactedKey(key) ? REDACTED : value;
	}
	return out;
}

/** Redacts sensitive keys at the top level and one level down. */
export function redactFields(fields: LogFields): LogFields {
	const out: LogFields = {};
	for (const [key, value] of Object.entries(fields)) {
		if (isRedactedKey(key)) out[key] = REDACTED;
		else if (isPlainObject(value)) out[key] = redactLevel(value);
		else out[key] = value;
	}
	return out;
}

function defaultSink(line: string): void {
	// eslint-disable-next-line no-console -- the logger is the console wrapper
	console.error(line);
}

/**
 * JSON-lines logger: `{ ts, level, msg, ...bindings, ...fields }` per call,
 * with personal-data fields redacted. Fields cannot overwrite `ts`, `level`
 * or `msg`. This is the only place in `src/` that touches `console`.
 */
export function createLogger(options: LoggerOptions, bindings: LogFields = {}): Logger {
	const { level: threshold, sink = defaultSink, now = () => new Date() } = options;

	const emit = (level: LogLevel, message: string, fields?: LogFields): void => {
		if (LEVEL_ORDER[level] < LEVEL_ORDER[threshold]) return;
		const entry: LogFields = { ts: now().toISOString(), level, msg: message };
		for (const [key, value] of Object.entries(redactFields({ ...bindings, ...fields }))) {
			if (!RESERVED_KEYS.has(key)) entry[key] = value;
		}
		sink(JSON.stringify(entry));
	};

	return {
		debug: (message, fields) => emit('debug', message, fields),
		info: (message, fields) => emit('info', message, fields),
		warn: (message, fields) => emit('warn', message, fields),
		error: (message, fields) => emit('error', message, fields),
		child: (childBindings) => createLogger(options, { ...bindings, ...childBindings })
	};
}
