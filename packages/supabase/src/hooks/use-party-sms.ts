'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// PARTY SMS + FIELD LINK — the party-profile sheet's data layer (Wave 5)
//
// One field party's SMS thread (sms_messages, 00282, team-scoped SELECT), the
// "Send text" composer (invokes the sms-dispatch edge fn with {partyId, body} —
// the edge fn authorizes the caller against the party's project and gates on
// consent), and the no-auth field link (create_field_link / revoke_field_link,
// 00283 — the raw token is returned once at mint). Field-media MMS/photos
// resolve to short-lived signed URLs from the private field-media bucket.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

const SIGNED_URL_TTL_SECONDS = 3600;

export interface PartySmsMessage {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  media: Array<{ path?: string; content_type?: string; twilio_url?: string }>;
  template_key: string | null;
  twilio_status: string | null;
  needs_review: boolean;
  created_at: string;
}

export const partySmsKeys = {
  thread: (partyId: string | null | undefined) => ['party-sms', partyId ?? 'none'] as const,
  links: (partyId: string | null | undefined) => ['field-links', partyId ?? 'none'] as const,
};

/**
 * A field party's SMS thread, oldest-first (chat order). RLS scopes the read to
 * the team; a 30s poll keeps an open sheet current without realtime plumbing.
 */
export function usePartySmsThread(partyId: string | null | undefined) {
  return useQuery({
    queryKey: partySmsKeys.thread(partyId),
    enabled: !!partyId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<PartySmsMessage[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('sms_messages')
        .select(
          'id, conversation_id, direction, body, media, template_key, twilio_status, needs_review, created_at',
        )
        .eq('party_id', partyId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as PartySmsMessage[]).map((m) => ({
        ...m,
        media: Array.isArray(m.media) ? m.media : [],
      }));
    },
  });
}

/**
 * Send a text to a field party ("Send text" composer). Invokes the sms-dispatch
 * edge fn with {partyId, body}; the fn resolves the phone + consent server-side
 * and logs the outbound message. Callers gate the composer on consent='granted'.
 */
export function useSendPartySms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ partyId, body }: { partyId: string; body: string }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.functions.invoke('sms-dispatch', {
        body: { partyId, body },
      });
      if (error) throw new Error(`useSendPartySms: ${error.message}`);
      return data as unknown;
    },
    onSuccess: (_data, { partyId }) => {
      void queryClient.invalidateQueries({ queryKey: partySmsKeys.thread(partyId) });
    },
  });
}

export interface FieldLinkToken {
  id: string;
  party_id: string;
  project_id: string;
  status: 'active' | 'revoked';
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

/** The active field-link token for a party (metadata only — never the raw
 *  token, which exists once at mint). Drives the sheet's "link is live" state. */
export function useActiveFieldLink(partyId: string | null | undefined) {
  return useQuery({
    queryKey: partySmsKeys.links(partyId),
    enabled: !!partyId,
    queryFn: async (): Promise<FieldLinkToken | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('field_link_tokens')
        .select('id, party_id, project_id, status, expires_at, last_used_at, created_at')
        .eq('party_id', partyId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as FieldLinkToken | null) ?? null;
    },
  });
}

/**
 * Mint (or regenerate) a field link for a party. create_field_link (00283)
 * revokes any prior active token and returns the RAW token exactly once — the
 * caller shows/copies it now; only sha256(token) is stored. Same RPC serves
 * "Copy field link" and "Regenerate".
 */
export function useCreateFieldLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ partyId }: { partyId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('create_field_link', { p_party_id: partyId });
      if (error) throw error;
      // RETURNS TABLE (id, token) → a one-row array.
      const row = Array.isArray(data) ? data[0] : data;
      return row as { id: string; token: string };
    },
    onSuccess: (_data, { partyId }) => {
      void queryClient.invalidateQueries({ queryKey: partySmsKeys.links(partyId) });
    },
  });
}

/** Revoke a field link (kills it immediately). */
export function useRevokeFieldLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tokenId }: { tokenId: string; partyId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.rpc('revoke_field_link', { p_token_id: tokenId });
      if (error) throw error;
      return true;
    },
    onSuccess: (_data, { partyId }) => {
      void queryClient.invalidateQueries({ queryKey: partySmsKeys.links(partyId) });
    },
  });
}

/** Resolve a field-media object path to a short-lived signed URL (private
 *  bucket). Used to render inbound MMS thumbnails in the party thread. */
export function useFieldMediaUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['field-media-url', path],
    enabled: !!path,
    staleTime: (SIGNED_URL_TTL_SECONDS - 60) * 1000,
    queryFn: async (): Promise<string | null> => {
      if (!path) return null;
      const supabase = getSupabase();
      const { data, error } = await supabase.storage
        .from('field-media')
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}

/** Build the guest field-link URL from a raw token (Track B contract:
 *  {CLIENT_PORTAL_URL}/field/{token}). */
export function fieldLinkUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL?.replace(/\/$/, '') ?? 'https://client.patina.cloud';
  return `${base}/field/${token}`;
}
