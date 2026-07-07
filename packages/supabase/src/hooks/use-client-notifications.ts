import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

export type ClientNotificationKind = 'decision' | 'proposal' | 'scope_change';

export interface ClientNotification {
  id: string;
  kind: ClientNotificationKind;
  title: string;
  message: string;
  url: string;
  created_at: string;
  read_at: string | null;
}

const READ_KEY = 'patina:client-notifications:read-at';

function loadReadMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(READ_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveReadMap(map: Record<string, string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(READ_KEY, JSON.stringify(map));
}

/**
 * Aggregates "things needing the client's attention" from existing tables —
 * pending decisions, sent/viewed proposals, pending scope changes — into a
 * single ordered notification feed. Read state is persisted client-side in
 * localStorage since none of the source tables track per-user read state.
 *
 * This is a derived feed, not a notifications table. When a real notifications
 * pipeline lands (push delivery, email, durable read state), this hook can be
 * swapped without changing consumers.
 */
export function useClientNotifications() {
  return useQuery({
    queryKey: ['client-notifications'],
    queryFn: async (): Promise<ClientNotification[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const [decisionsRes, proposalsRes, scopeRes] = await Promise.all([
        // SECURITY: scope pending decisions to the signed-in client. A decision
        // belongs to a client via designer_clients.client_id (there is no
        // client_id column on client_decisions itself). The `!inner` embed makes
        // the client_id predicate a real join constraint. Without this filter a
        // designer signed into the client portal — who can SELECT their own
        // clients' decisions under RLS — sees "Decision needed" for decisions
        // that are not theirs to make. RLS alone is NOT sufficient here.
        supabase
          .from('client_decisions')
          .select('id, title, due_date, status, created_at, project_id, designer_clients!inner(client_id)')
          .eq('status', 'pending')
          .eq('designer_clients.client_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('proposals')
          .select('id, title, status, sent_at, created_at')
          .eq('client_id', user.id)
          .in('status', ['sent', 'viewed'])
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('scope_change_requests')
          .select('id, title, status, requested_by, created_at, project_id')
          .neq('requested_by', user.id)
          .in('status', ['sent', 'viewed'])
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const readMap = loadReadMap();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decisions: ClientNotification[] = ((decisionsRes.data ?? []) as any[]).map((d) => ({
        id: `decision-${d.id}`,
        kind: 'decision' as const,
        title: 'Decision needed',
        message: d.title,
        url: `/decisions/${d.id}`,
        created_at: d.created_at,
        read_at: readMap[`decision-${d.id}`] ?? null,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proposals: ClientNotification[] = ((proposalsRes.data ?? []) as any[]).map((p) => ({
        id: `proposal-${p.id}`,
        kind: 'proposal' as const,
        title: 'Proposal awaiting review',
        message: p.title,
        url: `/proposals/${p.id}`,
        created_at: p.sent_at ?? p.created_at,
        read_at: readMap[`proposal-${p.id}`] ?? null,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scopes: ClientNotification[] = ((scopeRes.data ?? []) as any[]).map((s) => ({
        id: `scope_change-${s.id}`,
        kind: 'scope_change' as const,
        title: 'Scope change to review',
        message: s.title,
        url: `/projects/${s.project_id}/scope-change/${s.id}`,
        created_at: s.created_at,
        read_at: readMap[`scope_change-${s.id}`] ?? null,
      }));

      return [...decisions, ...proposals, ...scopes].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });
}

export function useMarkClientNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const map = loadReadMap();
      map[notificationId] = new Date().toISOString();
      saveReadMap(map);
      return notificationId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-notifications'] });
    },
  });
}

export function useMarkAllClientNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const map = loadReadMap();
      const now = new Date().toISOString();
      for (const id of ids) map[id] = now;
      saveReadMap(map);
      return ids;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-notifications'] });
    },
  });
}
