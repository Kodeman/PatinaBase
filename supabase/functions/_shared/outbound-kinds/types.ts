import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { OutboundDraft } from "../outbound-send.ts";
export interface OutboundKindContext { admin: SupabaseClient; draft: OutboundDraft; messageId: string | null }
export interface OutboundEmailRender { html: string; text?: string; replyTo?: string; from?: string; userId?: string }
export interface OutboundKindModule {
  afterSend?: (ctx: OutboundKindContext) => Promise<void>;
  renderEmail?: (ctx: { admin: SupabaseClient; draft: OutboundDraft }) => Promise<OutboundEmailRender>;
}
