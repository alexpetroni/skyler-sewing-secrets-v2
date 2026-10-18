/**
 * Fetch video durations from Bunny.net Video API and update lessons.json
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const LIBRARY_ID = process.env.BUNNY_VIDEO_LIBRARY_ID;
const API_KEY = process.env.BUNNY_VIDEO_API_KEY;

if (!LIBRARY_ID || !API_KEY) {
  console.error('Missing BUNNY_VIDEO_LIBRARY_ID or BUNNY_VIDEO_API_KEY');
  process.exit(1);
}

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
  video_url?: string;
}

async function getVideoDuration(videoId: string): Promise<number> {
  const response = await fetch(
    `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${videoId}`,
    {
      headers: {
        'AccessKey': API_KEY!,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch video ${videoId}: ${response.status}`);
  }

  const data = await response.json();
  return data.length; // length in seconds
}

async function main() {
  const lessonsPath = path.join(import.meta.dirname, 'lessons.json');
  const lessons: Lesson[] = JSON.parse(fs.readFileSync(lessonsPath, 'utf-8'));

  console.log('Fetching video durations from Bunny.net...\n');

  let totalSeconds = 0;
  let videoCount = 0;
  let updated = 0;

  for (const lesson of lessons) {
    if (lesson.lesson_type !== 'video' || !lesson.video_url) {
      continue;
    }

    // Extract video ID from bunny:556030/video-id format
    const match = lesson.video_url.match(/bunny:\d+\/(.+)/);
    if (!match) {
      console.log(`⚠️  Invalid video URL format: ${lesson.video_url}`);
      continue;
    }

    const videoId = match[1];
    videoCount++;

    try {
      const lengthSeconds = await getVideoDuration(videoId);
      const minutes = Math.round(lengthSeconds / 60);
      totalSeconds += lengthSeconds;

      if (lesson.duration_minutes !== minutes) {
        console.log(`📝 ${lesson.title}: ${lesson.duration_minutes || '?'} → ${minutes} min`);
        lesson.duration_minutes = minutes;
        updated++;
      } else {
        console.log(`✓  ${lesson.title}: ${minutes} min`);
      }
    } catch (err) {
      console.error(`❌ Error fetching ${lesson.title}:`, err);
    }
  }

  // Write updated lessons.json
  fs.writeFileSync(lessonsPath, JSON.stringify(lessons, null, 2) + '\n');

  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  console.log('\n' + '='.repeat(50));
  console.log(`Total videos: ${videoCount}`);
  console.log(`Total duration: ${totalMinutes} minutes (${hours}h ${mins}m)`);
  console.log(`Updated: ${updated} lessons`);
  console.log('='.repeat(50));
}

main();
