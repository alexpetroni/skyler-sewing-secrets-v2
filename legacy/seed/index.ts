#!/usr/bin/env npx tsx
/**
 * Seed script CLI for Skyler's Sewing Secrets
 *
 * Usage:
 *   npm run seed              # Seed all data
 *   npm run seed -- modules   # Seed only modules
 *   npm run seed -- blog      # Seed only blog posts
 *   npm run seed -- --help    # Show help
 *
 * Available seeders:
 *   modules, lessons, testimonials, faq, pricing, blog, all
 */

import { pool } from './lib/client.js';
import {
  seedModules,
  seedLessons,
  seedTestimonials,
  seedFaq,
  seedPricing,
  seedBlog
} from './seeders/index.js';

const SEEDERS = {
  modules: { fn: seedModules, name: 'Modules' },
  lessons: { fn: seedLessons, name: 'Lessons' },
  testimonials: { fn: seedTestimonials, name: 'Testimonials' },
  faq: { fn: seedFaq, name: 'FAQ' },
  pricing: { fn: seedPricing, name: 'Pricing' },
  blog: { fn: seedBlog, name: 'Blog Posts' }
} as const;

type SeederName = keyof typeof SEEDERS;

function showHelp(): void {
  console.log(`
🧵 Skyler's Sewing Secrets - Database Seeder

Usage:
  npm run seed              Seed all data
  npm run seed -- <seeder>  Seed specific data
  npm run seed -- --help    Show this help

Available seeders:
  modules       Course modules
  lessons       Course lessons (requires modules)
  testimonials  Customer testimonials
  faq           FAQ items
  pricing       Pricing config and promo codes
  blog          Blog posts
  all           Everything (default)

Examples:
  npm run seed                    # Seed everything
  npm run seed -- testimonials    # Seed only testimonials
  npm run seed -- blog            # Seed only blog posts
  npm run seed -- modules lessons # Seed modules and lessons
`);
}

async function runSeeder(name: SeederName): Promise<void> {
  const seeder = SEEDERS[name];
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Seeding: ${seeder.name}`);
  console.log('='.repeat(50));

  if (name === 'lessons') {
    // Lessons need module IDs, so seed modules first if running alone
    const moduleSlugToId = await seedModules();
    await seedLessons(moduleSlugToId);
  } else {
    await seeder.fn();
  }
}

async function runAll(): Promise<void> {
  console.log('🧵 Seeding ALL data\n');

  // Seed in order due to dependencies
  const moduleSlugToId = await seedModules();
  await seedLessons(moduleSlugToId);
  await seedTestimonials();
  await seedFaq();
  await seedPricing();
  await seedBlog();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  console.log('🧵 Skyler\'s Sewing Secrets - Database Seeder\n');

  // No args = seed all
  if (args.length === 0 || args.includes('all')) {
    await runAll();
  } else {
    // Validate seeder names
    const invalidSeeders = args.filter(arg => !Object.keys(SEEDERS).includes(arg));
    if (invalidSeeders.length > 0) {
      console.error(`Unknown seeder(s): ${invalidSeeders.join(', ')}`);
      console.error(`Available: ${Object.keys(SEEDERS).join(', ')}, all`);
      process.exit(1);
    }

    // Run specified seeders
    for (const seederName of args as SeederName[]) {
      await runSeeder(seederName);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Seeding complete!');
  await pool.end();
}

main().catch(err => {
  console.error('\n❌ Seeding failed:', err);
  process.exit(1);
});
