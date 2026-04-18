import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { DEFAULT_PREFERENCES } from '@patina/notifications';
import type { NotificationPreferences } from '@patina/shared/types';

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({
      id: '',
      user_id: user.id,
      ...DEFAULT_PREFERENCES,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let updates: Partial<NotificationPreferences>;
  try {
    updates = (await req.json()) as Partial<NotificationPreferences>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  delete (updates as Record<string, unknown>).id;
  delete (updates as Record<string, unknown>).user_id;
  delete (updates as Record<string, unknown>).created_at;
  delete (updates as Record<string, unknown>).updated_at;

  const { data: existing } = await supabase
    .from('notification_preferences')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('notification_preferences')
      .update(updates as never)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from('notification_preferences')
    .insert({ user_id: user.id, ...DEFAULT_PREFERENCES, ...updates } as never)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
