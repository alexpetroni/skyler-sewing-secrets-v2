import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface EnvDifferences {
	missingFromExample: string[];
	undeclared: string[];
}

const ENV_FILE = fileURLToPath(new URL('../src/env.ts', import.meta.url));
const EXAMPLE_FILE = fileURLToPath(new URL('../.env.example', import.meta.url));

/** Names declared as keys of the `defineEnvVars({...})` object in `src/env.ts`. */
export function declaredNames(source: string): string[] {
	const start = source.indexOf('defineEnvVars(');
	const body = start === -1 ? '' : source.slice(start);
	return [...body.matchAll(/^\t([A-Z][A-Z0-9_]*): \{/gm)].map((m) => m[1]);
}

/** Names documented in `.env.example` as `NAME=` lines. */
export function documentedNames(source: string): string[] {
	return [...source.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
}

export function compareEnv(envSource: string, exampleSource: string): EnvDifferences {
	const declared = new Set(declaredNames(envSource));
	const documented = new Set(documentedNames(exampleSource));
	return {
		missingFromExample: [...declared].filter((name) => !documented.has(name)),
		undeclared: [...documented].filter((name) => !declared.has(name))
	};
}

export function checkEnv(): EnvDifferences {
	return compareEnv(readFileSync(ENV_FILE, 'utf8'), readFileSync(EXAMPLE_FILE, 'utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { missingFromExample, undeclared } = checkEnv();
	if (missingFromExample.length > 0) {
		console.error(
			`Declared in src/env.ts but missing from .env.example: ${missingFromExample.join(', ')}`
		);
	}
	if (undeclared.length > 0) {
		console.error(`In .env.example but not declared in src/env.ts: ${undeclared.join(', ')}`);
	}
	process.exit(missingFromExample.length + undeclared.length > 0 ? 1 : 0);
}
