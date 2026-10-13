import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { OutboundDraft } from "../outbound-send.ts";
export interface OutboundKindContext { admin: SupabaseClient; draft: OutboundDraft; messageId: string | null }
export interface OutboundKindModule { afterSend?: (ctx: OutboundKindContext) => Promise<void> }
