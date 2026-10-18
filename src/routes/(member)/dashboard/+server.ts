import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The course-only dashboard became the library. */
export const GET: RequestHandler = () => redirect(301, '/library');
