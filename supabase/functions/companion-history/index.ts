// Companion History Edge Function
// Retrieves paginated conversation history for a user

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Types
interface Message {
  id: string;
  role: "user" | "companion";
  content: string;
  timestamp: string;
  attachments: unknown[] | null;
  quick_replies: unknown[] | null;
}

interface HistoryResponse {
  messages: Message[];
  has_more: boolean;
  cursor: string | null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse query parameters
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const before = url.searchParams.get("before"); // Cursor (timestamp)

    // Build query
    let query = supabase
      .from("companion_messages")
      .select("id, role, content, created_at, metadata, attachments")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit + 1); // Fetch one extra to determine if there's more

    // Apply cursor if provided
    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: messages, error: queryError } = await query;

    if (queryError) {
      console.error("Error fetching messages:", queryError);
      throw new Error("Failed to fetch conversation history");
    }

    // Determine if there are more messages
    const hasMore = (messages?.length || 0) > limit;
    const resultMessages = (messages || []).slice(0, limit);

    // Get cursor for next page
    const cursor = hasMore && resultMessages.length > 0
      ? resultMessages[resultMessages.length - 1].created_at
      : null;

    // Transform messages to response format
    const transformedMessages: Message[] = resultMessages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "companion",
      content: m.content,
      timestamp: m.created_at,
      attachments: m.attachments || null,
      quick_replies: m.metadata?.quick_actions || null,
    }));

    // Reverse to chronological order (oldest first)
    transformedMessages.reverse();

    const response: HistoryResponse = {
      messages: transformedMessages,
      has_more: hasMore,
      cursor,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in companion-history:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
