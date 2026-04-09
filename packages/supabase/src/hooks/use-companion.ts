/* eslint-disable @typescript-eslint/no-explicit-any */
// AI Companion hooks for edge function communication and conversation management

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CompanionMessage {
  id: string;
  role: 'user' | 'companion';
  content: string;
  timestamp: string;
  attachments?: any;
  quick_replies?: any[];
}

export interface CompanionResponse {
  message_id: string;
  response: string;
  quick_actions?: QuickAction[];
  suggested_products?: any[];
  metadata?: {
    confidence: number;
    sources: string[];
    processing_time: number;
  };
}

export interface QuickAction {
  id: string;
  icon: string;
  label: string;
  action_type: 'trigger' | 'navigate' | 'prompt' | 'deeplink';
  payload: Record<string, any>;
  priority: number;
}

export interface CompanionContext {
  screen: string;
  product_id?: string;
  room_id?: string;
}

export interface CompanionConversation {
  id: string;
  user_id: string;
  title?: string;
  created_at: string;
  updated_at: string;
}

interface CompanionHistoryResponse {
  messages: CompanionMessage[];
  has_more: boolean;
  cursor?: string;
}

interface CompanionContextResponse {
  quick_actions: QuickAction[];
  proactive_message?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get or create the most recent active companion conversation.
 * Queries the companion_conversations table directly via Supabase client.
 */
export function useCompanionConversation() {
  return useQuery({
    queryKey: ['companion-conversation'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await (supabase as any)
        .from('companion_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as CompanionConversation | null;
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get paginated conversation history from the companion-history edge function.
 */
export function useCompanionHistory(conversationId?: string, limit = 50) {
  return useQuery({
    queryKey: ['companion-history', conversationId, limit],
    queryFn: async () => {
      const supabase = getSupabase();

      const params = new URLSearchParams();
      if (conversationId) params.set('conversation_id', conversationId);
      params.set('limit', String(limit));

      const { data, error } = await supabase.functions.invoke('companion-history', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        body: undefined,
        // Pass query params via the function name path
      });

      // If the edge function doesn't support GET with query params via invoke,
      // fall back to POST with body
      if (error) {
        const { data: postData, error: postError } = await supabase.functions.invoke('companion-history', {
          body: { conversation_id: conversationId, limit },
        });
        if (postError) throw postError;
        return (postData as CompanionHistoryResponse) ?? { messages: [], has_more: false };
      }

      return (data as CompanionHistoryResponse) ?? { messages: [], has_more: false };
    },
    enabled: !!conversationId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send a message to the AI companion via the companion-message edge function.
 * Includes optimistic updates and query invalidation on success.
 */
export function useSendCompanionMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      message,
      context,
      conversation_id,
    }: {
      message: string;
      context?: CompanionContext;
      conversation_id?: string;
    }) => {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('companion-message', {
        body: {
          user_id: user.id,
          message,
          context,
          conversation_id,
        },
      });

      if (error) throw error;
      return data as CompanionResponse;
    },
    onSuccess: (_data, variables) => {
      // Invalidate history to refetch with new messages
      queryClient.invalidateQueries({
        queryKey: ['companion-history', variables.conversation_id],
      });
      // Also invalidate conversation list in case a new one was created
      queryClient.invalidateQueries({
        queryKey: ['companion-conversation'],
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK ACTIONS HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get context-aware quick actions from the companion-context edge function.
 */
export function useCompanionQuickActions(context: CompanionContext) {
  return useQuery({
    queryKey: ['companion-quick-actions', context.screen, context.product_id, context.room_id],
    queryFn: async () => {
      const supabase = getSupabase();

      const { data, error } = await supabase.functions.invoke('companion-context', {
        body: {
          screen: context.screen,
          data: {
            product_id: context.product_id,
            room_id: context.room_id,
          },
          session_metrics: {},
        },
      });

      if (error) throw error;
      return (data as CompanionContextResponse) ?? { quick_actions: [] };
    },
    enabled: !!context.screen,
  });
}
