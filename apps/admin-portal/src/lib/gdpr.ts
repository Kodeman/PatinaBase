if (typeof window !== 'undefined') {
  throw new Error('gdpr helpers must not be imported in client code');
}

type AnyClient = {
  from: (table: string) => any;
  auth: { getUser: (token?: string) => Promise<any> };
};

export type DataExport = {
  exported_at: string;
  user: Record<string, unknown> & { id: string; email: string | null };
  preferences: unknown;
  notification_log: unknown[];
  comms_threads: unknown[];
  comms_messages: unknown[];
  comms_thread_participants: unknown[];
  audience_segments: unknown[];
  application_communications: unknown[];
  client_invitations: unknown[];
};

export async function buildUserDataExport(
  adminClient: AnyClient,
  userId: string,
): Promise<DataExport> {
  const sinceIso = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  const profileRes = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  const prefsRes = await adminClient
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const notificationLogRes = await adminClient
    .from('notification_log')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false });

  const participantRes = await adminClient
    .from('comms_thread_participants')
    .select('*')
    .eq('profile_id', userId);

  const threadIds = ((participantRes.data ?? []) as Array<{ thread_id: string }>)
    .map((p) => p.thread_id)
    .filter(Boolean);

  let threads: unknown[] = [];
  if (threadIds.length > 0) {
    const threadsRes = await adminClient
      .from('comms_threads')
      .select('*')
      .in('id', threadIds);
    threads = threadsRes.data ?? [];
  }

  const messagesRes = await adminClient
    .from('comms_messages')
    .select('*')
    .eq('sender_id', userId)
    .order('created_at', { ascending: false });

  const audienceRes = await adminClient
    .from('audience_segments')
    .select('*')
    .eq('created_by', userId);

  const profileEmail =
    (profileRes.data as { email?: string | null } | null)?.email ?? null;

  let appComms: unknown[] = [];
  if (profileEmail) {
    const appCommsRes = await adminClient
      .from('application_communications')
      .select('*')
      .eq('to_email', profileEmail);
    appComms = appCommsRes.data ?? [];
  }

  const designerInvitesRes = await adminClient
    .from('client_invitations')
    .select('*')
    .eq('designer_id', userId);

  const acceptedInvitesRes = await adminClient
    .from('client_invitations')
    .select('*')
    .eq('accepted_by', userId);

  let emailInvites: unknown[] = [];
  if (profileEmail) {
    const emailInvitesRes = await adminClient
      .from('client_invitations')
      .select('*')
      .ilike('email', profileEmail);
    emailInvites = emailInvitesRes.data ?? [];
  }

  const inviteMap = new Map<string, unknown>();
  for (const row of [
    ...((designerInvitesRes.data ?? []) as Array<{ id: string }>),
    ...((acceptedInvitesRes.data ?? []) as Array<{ id: string }>),
    ...(emailInvites as Array<{ id: string }>),
  ]) {
    if (row?.id) inviteMap.set(row.id, row);
  }

  return {
    exported_at: new Date().toISOString(),
    user: {
      id: userId,
      email: profileEmail,
      ...(profileRes.data ?? {}),
    },
    preferences: prefsRes.data ?? null,
    notification_log: notificationLogRes.data ?? [],
    comms_threads: threads,
    comms_messages: messagesRes.data ?? [],
    comms_thread_participants: participantRes.data ?? [],
    audience_segments: audienceRes.data ?? [],
    application_communications: appComms,
    client_invitations: Array.from(inviteMap.values()),
  };
}

export async function eraseUserData(
  adminClient: AnyClient,
  userId: string,
  options: { requestedByUserId: string | null; reason?: string | null },
): Promise<{ erased_at: string }> {
  const erasedAt = new Date().toISOString();
  const placeholderEmail = `deleted-${userId}@deleted.invalid`;

  const { data: logRow, error: logErr } = await adminClient
    .from('data_erasure_log')
    .insert({
      user_id: userId,
      erased_at: erasedAt,
      requested_by_user_id: options.requestedByUserId,
      reason: options.reason ?? null,
      completed: false,
    } as never)
    .select('id')
    .single();

  if (logErr) {
    throw new Error(`Failed to start erasure log: ${logErr.message}`);
  }

  await adminClient.from('notification_log').delete().eq('user_id', userId);
  await adminClient
    .from('notification_preferences')
    .delete()
    .eq('user_id', userId);

  await adminClient
    .from('comms_messages')
    .update({
      body: '[deleted]',
      attachments: [],
      mentions: [],
      deleted_at: erasedAt,
    } as never)
    .eq('sender_id', userId);

  await adminClient
    .from('audience_segments')
    .update({ created_by: null } as never)
    .eq('created_by', userId);

  await adminClient
    .from('profiles')
    .update({
      email: placeholderEmail,
      display_name: 'Deleted user',
      avatar_url: null,
      bio: null,
      website: null,
      phone: null,
      city: null,
      state: null,
      zip: null,
      business_name: null,
      full_name: null,
      email_suppressed: true,
      email_suppressed_at: erasedAt,
    } as never)
    .eq('id', userId);

  if (logRow?.id) {
    await adminClient
      .from('data_erasure_log')
      .update({ completed: true } as never)
      .eq('id', logRow.id);
  }

  return { erased_at: erasedAt };
}

export function bearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!auth) return null;
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim() || null;
}
