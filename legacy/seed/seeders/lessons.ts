/**
 * Lessons Seeder
 */

import { db, schema } from '../lib/client.js';
import { loadJson, logSuccess, logError } from '../lib/utils.js';
import { seedModules } from './modules.js';

interface Lesson {
  module_slug: string;
  title: string;
  slug: string;
  description: string;
  lesson_type: 'video' | 'article';
  order_index: number;
  duration_minutes?: number;
  is_free_preview: boolean;
  is_published: boolean;
}

export async function seedLessons(moduleSlugToId?: Map<string, string>): Promise<void> {
  // If no module map provided, fetch or create modules first
  if (!moduleSlugToId) {
    console.log('Fetching module IDs...');
    const modules = await db
      .select({ id: schema.modules.id, slug: schema.modules.slug })
      .from(schema.modules);

    if (modules.length === 0) {
      console.log('No modules found. Seeding modules first...');
      moduleSlugToId = await seedModules();
    } else {
      moduleSlugToId = new Map(modules.map((m) => [m.slug, m.id]));
    }
  }

  console.log('\nSeeding lessons...');
  const lessons = loadJson<Lesson[]>('lessons.json');

  for (const lesson of lessons) {
    const moduleId = moduleSlugToId.get(lesson.module_slug);
    if (!moduleId) {
      logError(`Module not found for lesson "${lesson.title}" (module_slug: ${lesson.module_slug})`);
      continue;
    }

    const { module_slug, ...lessonData } = lesson;
    const values = { ...lessonData, module_id: moduleId };
    try {
      await db
        .insert(schema.lessons)
        .values(values)
        .onConflictDoUpdate({
          target: [schema.lessons.module_id, schema.lessons.slug],
          set: values
        });
      logSuccess(lesson.title);
    } catch (error) {
      logError(`Error seeding lesson "${lesson.title}": ${(error as Error).message}`);
    }
  }
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedLessons()
    .then(() => {
      console.log('\n✅ Lessons seeded!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}
