/**
 * FAQ Seeder
 */

import { db, schema } from '../lib/client.js';
import { loadJson, logSuccess, logError } from '../lib/utils.js';

interface FaqItem {
  question: string;
  answer: string;
  category?: string;
  order_index: number;
  is_published: boolean;
}

export async function seedFaq(): Promise<void> {
  console.log('Seeding FAQ items...');
  const faqItems = loadJson<FaqItem[]>('faq.json');

  // Delete existing FAQ items to avoid duplicates
  await db.delete(schema.faq_items);

  for (const item of faqItems) {
    try {
      await db.insert(schema.faq_items).values(item);
      logSuccess(`${item.question.substring(0, 50)}...`);
    } catch (error) {
      logError(
        `Error seeding FAQ "${item.question.substring(0, 30)}...": ${(error as Error).message}`
      );
    }
  }
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedFaq()
    .then(() => {
      console.log('\n✅ FAQ seeded!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}
