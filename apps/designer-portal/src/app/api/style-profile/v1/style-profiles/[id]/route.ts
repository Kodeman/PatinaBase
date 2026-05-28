import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

interface StyleSignalRow {
  id: string;
  user_id: string;
  natural_light_preference: number | null;
  openness_preference: number | null;
  warmth_preference: number | null;
  texture_preference: number | null;
  color_temperature: string | null;
  space_density: string | null;
  formality_level: string | null;
  source_room_ids: string[] | null;
  last_calculated_at: string | null;
  signal_history: unknown[];
  created_at: string;
  updated_at: string;
}

function toProfile(row: StyleSignalRow, profileId: string) {
  return {
    id: profileId,
    userId: row.user_id,
    naturalLightPreference: row.natural_light_preference,
    opennessPreference: row.openness_preference,
    warmthPreference: row.warmth_preference,
    texturePreference: row.texture_preference,
    colorTemperature: row.color_temperature,
    spaceDensity: row.space_density,
    formalityLevel: row.formality_level,
    sourceRoomIds: row.source_room_ids ?? [],
    lastCalculatedAt: row.last_calculated_at,
    signalHistory: row.signal_history ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function emptyProfile(profileId: string) {
  return {
    id: profileId,
    userId: profileId,
    naturalLightPreference: null,
    opennessPreference: null,
    warmthPreference: null,
    texturePreference: null,
    colorTemperature: null,
    spaceDensity: null,
    formalityLevel: null,
    sourceRoomIds: [],
    lastCalculatedAt: null,
    signalHistory: [],
    createdAt: null,
    updatedAt: null,
  };
}

// GET /api/style-profile/v1/style-profiles/:id - Style profile for a user.
// `id` is the profile/user id; user_style_signals carries one row per user.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet updated for these columns
    const supabase: any = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_style_signals')
      .select('*')
      .eq('user_id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const profile = data ? toProfile(data as StyleSignalRow, id) : emptyProfile(id);
    return NextResponse.json({ data: profile });
  } catch (error) {
    console.error('[API] GET /style-profile/v1/style-profiles/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/style-profile/v1/style-profiles/:id - Update a style profile.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet updated for these columns
    const supabase: any = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();

    const updateData: Record<string, unknown> = { user_id: id };
    if (body.naturalLightPreference !== undefined)
      updateData.natural_light_preference = body.naturalLightPreference;
    if (body.opennessPreference !== undefined)
      updateData.openness_preference = body.opennessPreference;
    if (body.warmthPreference !== undefined)
      updateData.warmth_preference = body.warmthPreference;
    if (body.texturePreference !== undefined)
      updateData.texture_preference = body.texturePreference;
    if (body.colorTemperature !== undefined)
      updateData.color_temperature = body.colorTemperature;
    if (body.spaceDensity !== undefined) updateData.space_density = body.spaceDensity;
    if (body.formalityLevel !== undefined) updateData.formality_level = body.formalityLevel;

    const { data, error } = await supabase
      .from('user_style_signals')
      .upsert(updateData, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (error) {
      console.error('[API] Update style profile error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: toProfile(data as StyleSignalRow, id) });
  } catch (error) {
    console.error('[API] PATCH /style-profile/v1/style-profiles/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
