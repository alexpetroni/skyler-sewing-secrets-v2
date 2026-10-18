/**
 * Shared utilities for seed scripts
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(__dirname, '..');

/**
 * Load and parse a JSON file from the seed directory
 */
export function loadJson<T>(filename: string): T {
  const path = join(SEED_DIR, filename);
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

/**
 * Parse frontmatter from a markdown file
 */
export function parseFrontmatter(fileContent: string): { data: Record<string, unknown>; content: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = fileContent.match(frontmatterRegex);

  if (!match) {
    return { data: {}, content: fileContent };
  }

  const frontmatterStr = match[1];
  const content = match[2].trim();

  const data: Record<string, unknown> = {};
  for (const line of frontmatterStr.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: unknown = line.slice(colonIndex + 1).trim();

    // Handle quoted strings
    if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
      value = (value as string).slice(1, -1);
    }
    // Handle booleans
    else if (value === 'true') value = true;
    else if (value === 'false') value = false;
    // Handle numbers
    else if (!isNaN(Number(value)) && value !== '') value = Number(value);

    data[key] = value;
  }

  return { data, content };
}

/**
 * Log success message
 */
export function logSuccess(message: string): void {
  console.log(`  ✓ ${message}`);
}

/**
 * Log error message
 */
export function logError(message: string): void {
  console.error(`  ✗ ${message}`);
}

/**
 * Get the seed directory path
 */
export function getSeedDir(): string {
  return SEED_DIR;
}
