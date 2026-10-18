/**
 * Blog Posts Seeder
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { db, schema } from '../lib/client.js';
import { parseFrontmatter, logSuccess, logError, getSeedDir } from '../lib/utils.js';

interface BlogPost {
  title: string;
  slug: string;
  excerpt?: string;
  content: string;
  featured_image_url?: string;
  is_published: boolean;
  published_at?: string;
}

export async function seedBlog(): Promise<void> {
  console.log('Seeding blog posts...');

  const blogPostsDir = join(getSeedDir(), 'blog-posts');
  const files = readdirSync(blogPostsDir).filter((f) => f.endsWith('.md'));

  for (const file of files) {
    const filePath = join(blogPostsDir, file);
    const fileContent = readFileSync(filePath, 'utf-8');
    const { data, content } = parseFrontmatter(fileContent);

    const post: BlogPost = {
      title: data.title as string,
      slug: data.slug as string,
      excerpt: data.excerpt as string | undefined,
      content: content,
      featured_image_url: data.featured_image_url as string | undefined,
      is_published: data.is_published as boolean,
      published_at: data.published_at as string | undefined
    };

    try {
      await db
        .insert(schema.blog_posts)
        .values(post)
        .onConflictDoUpdate({ target: schema.blog_posts.slug, set: post });
      logSuccess(post.title);
    } catch (error) {
      logError(`Error seeding blog post "${post.title}": ${(error as Error).message}`);
    }
  }
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedBlog()
    .then(() => {
      console.log('\n✅ Blog posts seeded!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}
