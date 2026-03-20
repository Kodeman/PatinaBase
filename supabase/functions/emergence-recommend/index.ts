// Emergence Recommend Edge Function
// Returns product recommendations based on user style signals and room context

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RecommendRequest {
  room_id?: string;
  style_signals?: Record<string, number>;
  exclude_product_ids?: string[];
  limit?: number;
}

interface EmergingPiece {
  id: string;
  name: string;
  maker: string;
  provenance: string;
  imageURL: string | null;
  priceInCents: number | null;
  era: string | null;
  materials: string[];
  roomSuggestion: string | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: RecommendRequest = await req.json();
    const resultLimit = Math.min(body.limit ?? 10, 50);
    const excludeIds = body.exclude_product_ids ?? [];

    // Use service role for cross-table queries
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch user style signals
    const { data: styleSignals } = await supabase
      .from("user_style_signals")
      .select("*")
      .eq("user_id", user.id)
      .single();

    // If room_id provided, fetch room's style signals too
    let roomStyleSignals: Record<string, number> | null = null;
    let roomType: string | null = null;
    if (body.room_id) {
      const { data: room } = await supabase
        .from("rooms")
        .select("room_type, style_signals")
        .eq("id", body.room_id)
        .eq("user_id", user.id)
        .single();

      if (room) {
        roomStyleSignals = room.style_signals;
        roomType = room.room_type;
      }
    }

    // Merge style signals: request > room > user profile
    const signals = body.style_signals
      ?? roomStyleSignals
      ?? (styleSignals ? {
          naturalLight: styleSignals.natural_light_preference,
          openness: styleSignals.openness_preference,
          warmth: styleSignals.warmth_preference,
          texture: styleSignals.texture_preference,
        } : null);

    // Determine which style names to prioritize based on signals
    const stylePreferences = deriveStylePreferences(signals);

    // Query products with style matching
    let query = supabase
      .from("products")
      .select(`
        id, name, description, price_retail, materials, images,
        vendors!inner ( name ),
        product_styles ( confidence, styles ( name ) )
      `)
      .limit(resultLimit * 3); // Fetch extra for scoring

    // Exclude already-seen products
    if (excludeIds.length > 0) {
      query = query.not("id", "in", `(${excludeIds.join(",")})`);
    }

    const { data: products, error: productsError } = await query;

    if (productsError) {
      console.error("Products query error:", productsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch products" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ pieces: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Score and rank products
    const scored = products.map((p: any) => {
      let score = 0;
      const productStyles = (p.product_styles || []).map(
        (ps: any) => ps.styles?.name?.toLowerCase()
      ).filter(Boolean);

      // Style match scoring
      for (const pref of stylePreferences) {
        if (productStyles.includes(pref.toLowerCase())) {
          score += 10;
        }
      }

      // Boost products with images
      if (p.images && p.images.length > 0) {
        score += 5;
      }

      // Boost products with prices (more complete data)
      if (p.price_retail) {
        score += 2;
      }

      // Add randomness to prevent same recommendations
      score += Math.random() * 3;

      return { product: p, score };
    });

    // Sort by score and take top N
    scored.sort((a: any, b: any) => b.score - a.score);
    const topProducts = scored.slice(0, resultLimit);

    // Map to EmergingPiece format
    const pieces: EmergingPiece[] = topProducts.map(({ product: p }: any) => ({
      id: p.id,
      name: p.name,
      maker: p.vendors?.name ?? "Unknown Maker",
      provenance: p.description ?? `A distinctive piece selected for your space.`,
      imageURL: p.images?.[0] ?? null,
      priceInCents: p.price_retail ?? null,
      era: null,
      materials: p.materials ?? [],
      roomSuggestion: roomType
        ? formatRoomType(roomType)
        : null,
    }));

    return new Response(
      JSON.stringify({ pieces }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Emergence recommend error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Derive preferred style names from numeric style signals.
 * Maps signal strengths to relevant furniture style categories.
 */
function deriveStylePreferences(
  signals: Record<string, number> | null
): string[] {
  if (!signals) return [];

  const preferences: string[] = [];

  const warmth = signals.warmth ?? signals.warmth_preference ?? 0;
  const naturalLight = signals.naturalLight ?? signals.natural_light_preference ?? 0;
  const openness = signals.openness ?? signals.openness_preference ?? 0;
  const texture = signals.texture ?? signals.texture_preference ?? 0;

  // High warmth → mid-century, craftsman, rustic
  if (warmth > 0.6) {
    preferences.push("mid-century modern", "craftsman", "rustic");
  }
  // High natural light + openness → scandinavian, modern, minimalist
  if (naturalLight > 0.6 && openness > 0.6) {
    preferences.push("scandinavian", "modern", "minimalist");
  }
  // High texture → bohemian, eclectic, artisan
  if (texture > 0.7) {
    preferences.push("bohemian", "eclectic", "artisan");
  }
  // Low warmth + high openness → contemporary, industrial
  if (warmth < 0.4 && openness > 0.5) {
    preferences.push("contemporary", "industrial");
  }

  return preferences;
}

/**
 * Format room type enum to human-readable suggestion.
 */
function formatRoomType(roomType: string): string {
  const map: Record<string, string> = {
    living_room: "Your Living Room",
    bedroom: "Your Bedroom",
    kitchen: "Your Kitchen",
    bathroom: "Your Bathroom",
    dining_room: "Your Dining Room",
    office: "Your Office",
    other: "Your Space",
  };
  return map[roomType] ?? "Your Space";
}
