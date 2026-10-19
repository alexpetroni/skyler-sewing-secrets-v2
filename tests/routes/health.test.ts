import { describe, expect, it, vi } from 'vitest';
import { GET } from '../../src/routes/api/health/+server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { createTestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));
vi.mock('$app/env', () => ({ version: 'test-version', building: false, dev: false }));

describe('GET /api/health', () => {
	const { db } = useTestDb();

	async function get(services: ReturnType<typeof createTestServices>) {
		const event = fakeEvent({ url: '/api/health', locals: { services, requestId: 'req-1' } });
		const response = await GET(event as unknown as Parameters<typeof GET>[0]);
		return { response, body: (await response.json()) as Record<string, unknown> };
	}

	it('answers 200 with status, db and version when the database works', async () => {
		const { response, body } = await get(createTestServices(db()));

		expect(response.status).toBe(200);
		expect(body).toEqual({ status: 'ok', db: 'ok', version: 'test-version' });
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	it('answers 503 without leaking the failure when the database throws', async () => {
		const failing = new Proxy(db(), {
			get(target, prop, receiver) {
				if (prop === 'execute') {
					return () => Promise.reject(new Error('connect ECONNREFUSED postgres://secret@host'));
				}
				return Reflect.get(target, prop, receiver) as unknown;
			}
		});
		const services = createTestServices(db());
		const { response, body } = await get({ ...services, db: failing });

		expect(response.status).toBe(503);
		expect(body).toEqual({ status: 'degraded', db: 'error' });
		expect(JSON.stringify(body)).not.toContain('secret');
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});
