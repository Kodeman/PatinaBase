/**
 * /api/rooms/:id/items/:itemId
 *
 * DELETE — remove a saved item from a room.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id, itemId } = await context.params;

  const admin = createAdminClient();
  const { error } = await admin
    .from('saved_items')
    .delete()
    .eq('id', itemId)
    .eq('room_id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: rpcErr } = await admin.rpc('decrement_room_saved_items', {
    p_room_id: id,
  } as any);
  if (rpcErr) {
    await admin
      .from('rooms')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  return NextResponse.json({ ok: true });
}
