// Companion Context Edge Function
// Returns context-aware quick actions based on user state and current screen

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers for all responses
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Quick action types
interface QuickAction {
  id: string;
  icon: string;
  label: string;
  action_type: "navigate" | "trigger" | "prompt" | "deeplink";
  payload: Record<string, string> | null;
  priority: number;
}

// Request payload
interface ContextRequest {
  user_id: string;
  screen: string;
  screen_data?: {
    product_id?: string;
    room_id?: string;
    filters?: Record<string, unknown>;
  };
  session_metrics?: {
    session_id: string;
    dwell_time: number;
    interactions: number;
    scroll_changes: number;
    screens_visited: number;
  };
}

// Response payload
interface ContextResponse {
  quick_actions: QuickAction[];
  proactive_message: string | null;
  timestamp: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role for database access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth token from header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the user token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: ContextRequest = await req.json();

    // Fetch user context from database
    const [roomsResult, savedItemsResult, profileResult] = await Promise.all([
      supabase.from("room_scans").select("id, name").eq("user_id", user.id).limit(10),
      supabase.from("saved_products").select("product_id").eq("user_id", user.id).limit(50),
      supabase.from("style_profiles").select("*").eq("user_id", user.id).single(),
    ]);

    const userRooms = roomsResult.data || [];
    const savedItems = savedItemsResult.data?.map((s) => s.product_id) || [];
    const styleProfile = profileResult.data;

    // Generate quick actions based on context
    const quickActions = generateQuickActions({
      screen: body.screen,
      screenData: body.screen_data,
      sessionMetrics: body.session_metrics,
      userRooms,
      savedItems,
      hasStyleProfile: !!styleProfile,
    });

    // Generate proactive message if user seems stuck
    let proactiveMessage: string | null = null;
    if (body.session_metrics) {
      const { dwell_time, interactions, scroll_changes } = body.session_metrics;
      if ((dwell_time > 30 && interactions === 0) || scroll_changes > 3) {
        proactiveMessage = getProactiveMessage(body.screen);
      }
    }

    const response: ContextResponse = {
      quick_actions: quickActions,
      proactive_message: proactiveMessage,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in companion-context:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Generate context-aware quick actions
function generateQuickActions(context: {
  screen: string;
  screenData?: ContextRequest["screen_data"];
  sessionMetrics?: ContextRequest["session_metrics"];
  userRooms: Array<{ id: string; name: string }>;
  savedItems: string[];
  hasStyleProfile: boolean;
}): QuickAction[] {
  const actions: QuickAction[] = [];

  // Screen-specific primary actions
  switch (context.screen) {
    case "home":
      if (context.userRooms.length === 0) {
        actions.push({
          id: "scan_first_room",
          icon: "camera",
          label: "Scan your first room",
          action_type: "navigate",
          payload: { destination: "room_scan" },
          priority: 100,
        });
      } else {
        actions.push({
          id: "continue_designing",
          icon: "arrow.right",
          label: `Continue designing ${context.userRooms[0]?.name || "room"}`,
          action_type: "navigate",
          payload: { destination: "room_detail", room_id: context.userRooms[0]?.id },
          priority: 100,
        });
      }

      if (!context.hasStyleProfile) {
        actions.push({
          id: "style_quiz",
          icon: "paintbrush",
          label: "Take the style quiz",
          action_type: "navigate",
          payload: { destination: "style_quiz" },
          priority: 90,
        });
      }

      actions.push({
        id: "browse_inspiration",
        icon: "lightbulb",
        label: "Browse for inspiration",
        action_type: "navigate",
        payload: { destination: "discover" },
        priority: 80,
      });
      break;

    case "product_detail":
      if (context.screenData?.product_id) {
        actions.push({
          id: "see_in_ar",
          icon: "arkit",
          label: "See in AR",
          action_type: "trigger",
          payload: { action: "launch_ar", product_id: context.screenData.product_id },
          priority: 100,
        });

        actions.push({
          id: "find_similar",
          icon: "magnifyingglass",
          label: "Find similar pieces",
          action_type: "navigate",
          payload: { destination: "search", similar_to: context.screenData.product_id },
          priority: 90,
        });

        if (context.userRooms.length > 0) {
          actions.push({
            id: "will_it_fit",
            icon: "ruler",
            label: "Will this fit my room?",
            action_type: "prompt",
            payload: { message: "Check if this fits in my room" },
            priority: 85,
          });
        }

        actions.push({
          id: "about_maker",
          icon: "person",
          label: "Tell me about the maker",
          action_type: "prompt",
          payload: { message: "Tell me about the maker" },
          priority: 70,
        });
      }
      break;

    case "room_scan":
      actions.push({
        id: "scanning_tips",
        icon: "lightbulb",
        label: "Scanning tips",
        action_type: "prompt",
        payload: { message: "Show me scanning tips" },
        priority: 100,
      });

      actions.push({
        id: "watch_howto",
        icon: "play.rectangle",
        label: "Watch how-to video",
        action_type: "trigger",
        payload: { action: "show_video", video_id: "room_scan_tutorial" },
        priority: 90,
      });
      break;

    case "recommendations":
      actions.push({
        id: "why_these_picks",
        icon: "questionmark.circle",
        label: "Why these picks?",
        action_type: "prompt",
        payload: { message: "Why did you recommend these?" },
        priority: 100,
      });

      actions.push({
        id: "adjust_budget",
        icon: "dollarsign.circle",
        label: "Adjust budget range",
        action_type: "trigger",
        payload: { action: "show_budget_filter" },
        priority: 90,
      });

      actions.push({
        id: "different_styles",
        icon: "shuffle",
        label: "Show different styles",
        action_type: "trigger",
        payload: { action: "refresh_recommendations" },
        priority: 80,
      });
      break;

    case "saved_items":
      if (context.savedItems.length > 0) {
        actions.push({
          id: "create_room_set",
          icon: "rectangle.stack",
          label: "Create a room set",
          action_type: "navigate",
          payload: { destination: "room_set_builder" },
          priority: 100,
        });

        actions.push({
          id: "talk_to_designer",
          icon: "phone",
          label: "Talk to a designer",
          action_type: "navigate",
          payload: { destination: "designer_consultation" },
          priority: 90,
        });
      } else {
        actions.push({
          id: "discover_furniture",
          icon: "sparkles",
          label: "Discover furniture",
          action_type: "navigate",
          payload: { destination: "discover" },
          priority: 100,
        });
      }
      break;

    case "profile":
      actions.push({
        id: "retake_quiz",
        icon: "arrow.counterclockwise",
        label: "Retake style quiz",
        action_type: "navigate",
        payload: { destination: "style_quiz" },
        priority: 100,
      });

      actions.push({
        id: "manage_rooms",
        icon: "house",
        label: "Manage my rooms",
        action_type: "navigate",
        payload: { destination: "my_rooms" },
        priority: 90,
      });

      actions.push({
        id: "help_support",
        icon: "questionmark.circle",
        label: "Help & support",
        action_type: "navigate",
        payload: { destination: "support" },
        priority: 80,
      });
      break;

    default:
      // Default actions for unknown screens
      actions.push({
        id: "browse",
        icon: "magnifyingglass",
        label: "Browse furniture",
        action_type: "navigate",
        payload: { destination: "discover" },
        priority: 50,
      });
  }

  // Sort by priority and return top 4
  return actions.sort((a, b) => b.priority - a.priority).slice(0, 4);
}

// Generate proactive message for stuck users
function getProactiveMessage(screen: string): string {
  const messages: Record<string, string> = {
    home: "Looking for something specific? I can help you find the perfect piece.",
    product_detail: "Want to see how this would look in your space? Try the AR view!",
    recommendations: "Not quite what you're looking for? Tell me more about your style.",
    discover: "I can help narrow down the options. What room are you furnishing?",
    saved_items: "Ready to bring your vision to life? I can help you create a cohesive look.",
  };

  return messages[screen] || "Need help? I'm here to assist with your design journey.";
}
