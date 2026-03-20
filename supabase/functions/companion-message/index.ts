// Companion Message Edge Function
// Handles conversational messages with Claude AI integration

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Types
interface MessageRequest {
  user_id: string;
  message: string;
  context: {
    screen: string;
    product_id?: string;
    room_id?: string;
  };
  conversation_id?: string;
}

interface QuickAction {
  id: string;
  icon: string;
  label: string;
  action_type: string;
  payload: Record<string, string> | null;
  priority: number;
}

interface ProductSuggestion {
  product_id: string;
  name: string;
  price: number;
  image_url: string;
  match_score: number;
  reason: string;
}

interface MessageResponse {
  message_id: string;
  response: string;
  quick_actions: QuickAction[] | null;
  suggested_products: ProductSuggestion[] | null;
  metadata: {
    confidence: number;
    sources: string[];
    processing_time: number;
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

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

    // Parse request
    const body: MessageRequest = await req.json();

    // Get or create conversation
    let conversationId = body.conversation_id;
    if (!conversationId) {
      const { data: conv, error: convError } = await supabase.rpc(
        "get_or_create_conversation",
        {
          p_user_id: user.id,
          p_screen: body.context.screen,
          p_context: body.context,
        }
      );

      if (convError) {
        console.error("Error creating conversation:", convError);
        throw new Error("Failed to create conversation");
      }
      conversationId = conv;
    }

    // Save user message
    const { data: userMsg, error: userMsgError } = await supabase
      .from("companion_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "user",
        content: body.message,
        screen_context: body.context.screen,
        room_context: body.context.room_id,
        product_context: body.context.product_id,
      })
      .select()
      .single();

    if (userMsgError) {
      console.error("Error saving user message:", userMsgError);
      throw new Error("Failed to save message");
    }

    // Fetch context for AI response
    const [roomData, productData, recentMessages, styleProfile] = await Promise.all([
      body.context.room_id
        ? supabase.from("room_scans").select("*").eq("id", body.context.room_id).single()
        : Promise.resolve({ data: null }),
      body.context.product_id
        ? supabase.from("products").select("*").eq("id", body.context.product_id).single()
        : Promise.resolve({ data: null }),
      supabase
        .from("companion_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("user_style_signals").select("*").eq("user_id", user.id).single(),
    ]);

    // Build conversation history for Claude
    const conversationHistory = (recentMessages.data || [])
      .reverse()
      .map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      }));

    // Generate AI response
    const aiResponse = await generateAIResponse({
      message: body.message,
      conversationHistory,
      roomData: roomData.data,
      productData: productData.data,
      styleProfile: styleProfile.data,
      screen: body.context.screen,
    });

    // Save companion response
    const { data: companionMsg, error: companionMsgError } = await supabase
      .from("companion_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "companion",
        content: aiResponse.response,
        metadata: {
          quick_actions: aiResponse.quickActions,
          suggested_products: aiResponse.suggestedProducts,
          confidence: aiResponse.confidence,
          sources: aiResponse.sources,
        },
        screen_context: body.context.screen,
        room_context: body.context.room_id,
        product_context: body.context.product_id,
      })
      .select()
      .single();

    if (companionMsgError) {
      console.error("Error saving companion message:", companionMsgError);
    }

    const processingTime = Date.now() - startTime;

    const response: MessageResponse = {
      message_id: companionMsg?.id || userMsg.id,
      response: aiResponse.response,
      quick_actions: aiResponse.quickActions,
      suggested_products: aiResponse.suggestedProducts,
      metadata: {
        confidence: aiResponse.confidence,
        sources: aiResponse.sources,
        processing_time: processingTime,
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in companion-message:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Generate AI response using Claude
async function generateAIResponse(context: {
  message: string;
  conversationHistory: Array<{ role: string; content: string }>;
  roomData: Record<string, unknown> | null;
  productData: Record<string, unknown> | null;
  styleProfile: Record<string, unknown> | null;
  screen: string;
}): Promise<{
  response: string;
  quickActions: QuickAction[] | null;
  suggestedProducts: ProductSuggestion[] | null;
  confidence: number;
  sources: string[];
}> {
  const claudeApiKey = Deno.env.get("CLAUDE_API_KEY");

  // If no API key, use fallback responses
  if (!claudeApiKey) {
    return generateFallbackResponse(context);
  }

  try {
    // Build system prompt
    const systemPrompt = buildSystemPrompt(context);

    // Call Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...context.conversationHistory,
          { role: "user", content: context.message },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Claude API error:", await response.text());
      return generateFallbackResponse(context);
    }

    const data = await response.json();
    const aiMessage = data.content[0]?.text || "";

    // Parse response for actions and suggestions
    const { text, quickActions, suggestedProducts } = parseAIResponse(aiMessage, context);

    return {
      response: text,
      quickActions,
      suggestedProducts,
      confidence: 0.85,
      sources: determineSources(context),
    };
  } catch (error) {
    console.error("Claude API call failed:", error);
    return generateFallbackResponse(context);
  }
}

// Build system prompt for Claude
function buildSystemPrompt(context: {
  roomData: Record<string, unknown> | null;
  productData: Record<string, unknown> | null;
  styleProfile: Record<string, unknown> | null;
  screen: string;
}): string {
  let prompt = `You are the Patina Companion, a warm and knowledgeable furniture design assistant. Your personality is:
- Warm and unhurried, like a thoughtful friend who happens to know a lot about furniture
- Never robotic or salesy
- Use sensory language that evokes texture, time, and craftsmanship
- Reference "patina" as the beauty that comes with age and care

Keep responses concise (2-3 sentences max) and helpful. Focus on the user's immediate question.`;

  if (context.roomData) {
    prompt += `\n\nThe user is working with a room called "${context.roomData.name}" with these dimensions: ${JSON.stringify(context.roomData.dimensions || {})}.`;
  }

  if (context.productData) {
    prompt += `\n\nThey're currently looking at: ${context.productData.name} (${context.productData.category}), priced at $${context.productData.price}.`;
  }

  if (context.styleProfile) {
    prompt += `\n\nTheir style preferences include: ${JSON.stringify(context.styleProfile.preferences || {})}.`;
  }

  prompt += `\n\nCurrent screen: ${context.screen}`;

  return prompt;
}

// Parse AI response for embedded actions/suggestions
function parseAIResponse(
  text: string,
  _context: Record<string, unknown>
): {
  text: string;
  quickActions: QuickAction[] | null;
  suggestedProducts: ProductSuggestion[] | null;
} {
  // For now, return the text as-is
  // In the future, we could parse special markers for actions/suggestions
  return {
    text: text.trim(),
    quickActions: null,
    suggestedProducts: null,
  };
}

// Determine data sources used
function determineSources(context: {
  roomData: Record<string, unknown> | null;
  productData: Record<string, unknown> | null;
  styleProfile: Record<string, unknown> | null;
}): string[] {
  const sources: string[] = [];
  if (context.roomData) sources.push("room_scan");
  if (context.productData) sources.push("product_catalog");
  if (context.styleProfile) sources.push("style_profile");
  return sources;
}

// Fallback responses when Claude is unavailable
function generateFallbackResponse(context: {
  message: string;
  screen: string;
  productData: Record<string, unknown> | null;
  roomData: Record<string, unknown> | null;
}): {
  response: string;
  quickActions: QuickAction[] | null;
  suggestedProducts: ProductSuggestion[] | null;
  confidence: number;
  sources: string[];
} {
  const message = context.message.toLowerCase();

  // Pattern-based responses
  if (message.includes("fit") && context.roomData && context.productData) {
    return {
      response: `Based on your ${context.roomData.name}'s dimensions, this piece should fit well! Would you like to see it in AR to be sure?`,
      quickActions: [
        {
          id: "see_in_ar",
          icon: "arkit",
          label: "See in AR",
          action_type: "trigger",
          payload: { action: "launch_ar" },
          priority: 100,
        },
      ],
      suggestedProducts: null,
      confidence: 0.7,
      sources: ["room_scan", "product_catalog"],
    };
  }

  if (message.includes("similar") || message.includes("like this")) {
    return {
      response: "I'd be happy to show you similar pieces! Let me find some options that capture the same character.",
      quickActions: [
        {
          id: "find_similar",
          icon: "magnifyingglass",
          label: "Find similar",
          action_type: "navigate",
          payload: { destination: "search" },
          priority: 100,
        },
      ],
      suggestedProducts: null,
      confidence: 0.7,
      sources: [],
    };
  }

  if (message.includes("budget") || message.includes("cheaper") || message.includes("expensive")) {
    return {
      response: "Finding quality pieces within budget is an art. Let me show you some options that balance craftsmanship with value.",
      quickActions: [
        {
          id: "adjust_budget",
          icon: "dollarsign.circle",
          label: "Set budget",
          action_type: "trigger",
          payload: { action: "show_budget_filter" },
          priority: 100,
        },
      ],
      suggestedProducts: null,
      confidence: 0.7,
      sources: [],
    };
  }

  // Default response
  return {
    response: "I'm here to help you find the perfect pieces for your space. What are you looking for today?",
    quickActions: [
      {
        id: "browse",
        icon: "magnifyingglass",
        label: "Browse furniture",
        action_type: "navigate",
        payload: { destination: "discover" },
        priority: 100,
      },
    ],
    suggestedProducts: null,
    confidence: 0.5,
    sources: [],
  };
}
