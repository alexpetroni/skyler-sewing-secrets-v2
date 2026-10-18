import type { LogFields, Logger, LogLevel } from '../logger.ts';

export interface LogEntry {
	level: LogLevel;
	message: string;
	/** Bindings merged with the call's fields, unredacted. */
	fields: LogFields;
}

export interface FakeLogger extends Logger {
	/** Every entry logged through this logger or its children, in order. */
	entries: LogEntry[];
}

/** In-memory logger for tests; children share the parent's `entries`. */
export function createFakeLogger(entries: LogEntry[] = [], bindings: LogFields = {}): FakeLogger {
	const push = (level: LogLevel, message: string, fields?: LogFields): void => {
		entries.push({ level, message, fields: { ...bindings, ...fields } });
	};
	return {
		entries,
		debug: (message, fields) => push('debug', message, fields),
		info: (message, fields) => push('info', message, fields),
		warn: (message, fields) => push('warn', message, fields),
		error: (message, fields) => push('error', message, fields),
		child: (childBindings) => createFakeLogger(entries, { ...bindings, ...childBindings })
	};
}
