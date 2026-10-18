/**
 * Testimonials Seeder
 */

import { db, schema } from '../lib/client.js';
import { loadJson, logSuccess, logError } from '../lib/utils.js';

interface Testimonial {
  author_name: string;
  author_title?: string;
  country?: string;
  content: string;
  rating: number;
  is_featured: boolean;
  order_index: number;
  is_published: boolean;
}

export async function seedTestimonials(): Promise<void> {
  console.log('Seeding testimonials...');
  const testimonials = loadJson<Testimonial[]>('testimonials.json');

  // Delete existing testimonials to avoid duplicates
  await db.delete(schema.testimonials);

  for (const testimonial of testimonials) {
    try {
      await db.insert(schema.testimonials).values(testimonial);
      const countryInfo = testimonial.country ? ` (${testimonial.country})` : '';
      logSuccess(`${testimonial.author_name}${countryInfo}`);
    } catch (error) {
      logError(
        `Error seeding testimonial from "${testimonial.author_name}": ${(error as Error).message}`
      );
    }
  }
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedTestimonials()
    .then(() => {
      console.log('\n✅ Testimonials seeded!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}
