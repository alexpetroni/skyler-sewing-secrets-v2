/**
 * Modules Seeder
 */

import { db, schema } from '../lib/client.js';
import { loadJson, logSuccess, logError } from '../lib/utils.js';

interface Module {
  title: string;
  slug: string;
  description: string;
  order_index: number;
  is_published: boolean;
  is_bonus: boolean;
}

export async function seedModules(): Promise<Map<string, string>> {
  console.log('Seeding modules...');
  const modules = loadJson<Module[]>('modules.json');
  const slugToId = new Map<string, string>();

  for (const module of modules) {
    try {
      const [row] = await db
        .insert(schema.modules)
        .values(module)
        .onConflictDoUpdate({ target: schema.modules.slug, set: module })
        .returning({ id: schema.modules.id, slug: schema.modules.slug });

      slugToId.set(row.slug, row.id);
      logSuccess(module.title);
    } catch (error) {
      logError(`Error seeding module "${module.title}": ${(error as Error).message}`);
    }
  }

  return slugToId;
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedModules()
    .then(() => {
      console.log('\n✅ Modules seeded!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}
