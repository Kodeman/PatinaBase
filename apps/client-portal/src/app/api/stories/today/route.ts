/**
 * GET /api/stories/today
 *
 * Returns today's published Daily Room story (Zone 2 — "The Daily Story").
 * Reads from `daily_stories` where publish_date <= today AND status =
 * 'published', ordered by publish_date DESC so the most recent published
 * story wins if multiple exist on the same day.
 */
import { NextResponse } from 'next/server';
import { getUser } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: story, error } = await admin
    .from('daily_stories')
    .select(
      'id, story_type, title, subtitle, hero_image_url, body_content, maker_id, embedded_products, read_time_minutes, publish_date',
    )
    .eq('status', 'published')
    .lte('publish_date', new Date().toISOString().slice(0, 10))
    .order('publish_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[stories/today] fetch failed', error);
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 });
  }

  if (!story) return NextResponse.json({ story: null, is_read: false });

  // Expand embedded product references
  let embedded_products: any[] = [];
  if (story.embedded_products && story.embedded_products.length > 0) {
    const { data: products } = await admin
      .from('products')
      .select('id, name, price_retail, images')
      .in('id', story.embedded_products);
    embedded_products = products ?? [];
  }

  return NextResponse.json({
    story: { ...story, embedded_products },
    is_read: false, // TODO: join against a future story_reads table
  });
}
