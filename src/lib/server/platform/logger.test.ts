import { describe, expect, it } from 'vitest';
import { createFakeLogger } from './fakes/logger.ts';
import { createLogger, REDACTED, type LogLevel } from './logger.ts';

const FIXED = new Date('2026-10-18T09:30:00.000Z');

function capture(level: LogLevel = 'debug') {
	const lines: string[] = [];
	const logger = createLogger({ level, sink: (line) => lines.push(line), now: () => FIXED });
	const parsed = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
	return { logger, lines, parsed };
}

describe('createLogger', () => {
	it('emits one JSON line with ts, level, msg and the fields', () => {
		const { logger, lines, parsed } = capture();
		logger.info('order paid', { orderId: 'o-1', status: 'paid' });

		expect(lines).toHaveLength(1);
		expect(lines[0]).not.toContain('\n');
		expect(parsed()[0]).toEqual({
			ts: '2026-10-18T09:30:00.000Z',
			level: 'info',
			msg: 'order paid',
			orderId: 'o-1',
			status: 'paid'
		});
	});

	it('writes each level under its own name', () => {
		const { logger, parsed } = capture();
		logger.debug('d');
		logger.info('i');
		logger.warn('w');
		logger.error('e');
		expect(parsed().map((entry) => [entry.level, entry.msg])).toEqual([
			['debug', 'd'],
			['info', 'i'],
			['warn', 'w'],
			['error', 'e']
		]);
	});

	it('drops calls below the configured level', () => {
		const { logger, parsed } = capture('warn');
		logger.debug('d');
		logger.info('i');
		logger.warn('w');
		logger.error('e');
		expect(parsed().map((entry) => entry.level)).toEqual(['warn', 'error']);
	});

	it('redacts email, name, password and token fields', () => {
		const { logger, lines, parsed } = capture();
		logger.warn('sign-in failed', {
			email: 'jane@example.com',
			name: 'Jane Doe',
			password: 'hunter2',
			token: 'tok_secret',
			userId: 'u-1'
		});

		expect(parsed()[0]).toMatchObject({
			email: REDACTED,
			name: REDACTED,
			password: REDACTED,
			token: REDACTED,
			userId: 'u-1'
		});
		for (const secret of ['jane@example.com', 'Jane Doe', 'hunter2', 'tok_secret']) {
			expect(lines[0]).not.toContain(secret);
		}
	});

	it('redacts fullName, authorization and cookie case-insensitively', () => {
		const { logger, parsed } = capture();
		logger.info('request', {
			fullName: 'Jane Doe',
			Authorization: 'Bearer abc',
			COOKIE: 'session=abc',
			EMAIL: 'jane@example.com'
		});
		expect(parsed()[0]).toMatchObject({
			fullName: REDACTED,
			Authorization: REDACTED,
			COOKIE: REDACTED,
			EMAIL: REDACTED
		});
	});

	it('redacts sensitive keys nested one level deep', () => {
		const { logger, lines, parsed } = capture();
		logger.info('checkout', {
			customer: { email: 'jane@example.com', id: 'cus_1' },
			headers: { cookie: 'session=abc', 'content-type': 'text/html' }
		});
		expect(parsed()[0]).toMatchObject({
			customer: { email: REDACTED, id: 'cus_1' },
			headers: { cookie: REDACTED, 'content-type': 'text/html' }
		});
		expect(lines[0]).not.toContain('jane@example.com');
		expect(lines[0]).not.toContain('session=abc');
	});

	it('does not let fields overwrite ts, level or msg', () => {
		const { logger, parsed } = capture();
		logger.error('real message', { msg: 'spoofed', level: 'debug', ts: 'never' });
		expect(parsed()[0]).toMatchObject({
			ts: '2026-10-18T09:30:00.000Z',
			level: 'error',
			msg: 'real message'
		});
	});

	it('child loggers carry their bindings, redacted, merged with the call fields', () => {
		const { logger, parsed } = capture();
		const child = logger.child({ requestId: 'r-1', email: 'jane@example.com' });
		const grandchild = child.child({ module: 'commerce' });

		child.info('first', { step: 1 });
		grandchild.info('second', { requestId: 'r-2' });
		logger.info('parent');

		const [first, second, parent] = parsed();
		expect(first).toMatchObject({ requestId: 'r-1', email: REDACTED, step: 1 });
		expect(second).toMatchObject({ requestId: 'r-2', module: 'commerce', email: REDACTED });
		expect(parent).not.toHaveProperty('requestId');
	});
});

describe('createFakeLogger', () => {
	it('collects entries from the logger and its children in one array', () => {
		const logger = createFakeLogger();
		logger.info('one', { a: 1 });
		logger.child({ requestId: 'r-1' }).error('two', { b: 2 });

		expect(logger.entries).toEqual([
			{ level: 'info', message: 'one', fields: { a: 1 } },
			{ level: 'error', message: 'two', fields: { requestId: 'r-1', b: 2 } }
		]);
	});
});
