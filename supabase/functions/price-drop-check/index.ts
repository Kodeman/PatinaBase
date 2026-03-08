// Price Drop Check Edge Function
// Triggered by DB trigger when a product's price_retail decreases.
// Finds users with this product on their wishlist and dispatches
// price drop notifications, respecting a 7-day frequency cap per item.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Frequency cap: 1 price drop notification per product per user per 7 days
const FREQUENCY_CAP_DAYS = 7;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { product_id, product_name, old_price_cents, new_price_cents } =
      await req.json();

    if (!product_id || !old_price_cents || !new_price_cents) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate savings
    const savingsCents = old_price_cents - new_price_cents;
    const savingsPercent = Math.round((savingsCents / old_price_cents) * 100);

    // Format prices for display
    const formatPrice = (cents: number) =>
      `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

    const oldPriceFormatted = formatPrice(old_price_cents);
    const newPriceFormatted = formatPrice(new_price_cents);
    const savingsFormatted = formatPrice(savingsCents);

    // Get product image for the email
    const { data: product } = await supabase
      .from("products")
      .select("images, source_url")
      .eq("id", product_id)
      .single();

    const productImageUrl = product?.images?.[0] || null;
    const productUrl = product?.source_url || "https://admin.patina.cloud";

    // Find users who have this product on their wishlist
    const { data: wishlistEntries, error: wishlistError } = await supabase
      .from("user_wishlist")
      .select("user_id")
      .eq("product_id", product_id);

    if (wishlistError) {
      console.error("Error querying wishlist:", wishlistError);
      return new Response(
        JSON.stringify({ error: "Failed to query wishlist" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!wishlistEntries || wishlistEntries.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          notifications_sent: 0,
          reason: "no_wishlist_users",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let notificationsSent = 0;
    const capCutoff = new Date(
      Date.now() - FREQUENCY_CAP_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    for (const entry of wishlistEntries) {
      // Check frequency cap: was a price_drop notification sent for this
      // product to this user within the last 7 days?
      const { count } = await supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", entry.user_id)
        .eq("type", "price_drop")
        .gte("created_at", capCutoff)
        .contains("metadata", { productId: product_id });

      if ((count ?? 0) > 0) {
        continue; // Already notified recently
      }

      // Dispatch notification
      const { error: dispatchError } = await supabase.functions.invoke(
        "notification-dispatch",
        {
          body: {
            user_id: entry.user_id,
            type: "price_drop",
            channel: "email",
            template_id: "price-drop",
            data: {
              productName: product_name,
              productImageUrl,
              oldPriceFormatted,
              newPriceFormatted,
              savingsFormatted,
              savingsPercent,
              productUrl,
              productId: product_id,
            },
            priority: "normal",
          },
        }
      );

      if (dispatchError) {
        console.error(
          `Failed to dispatch price drop notification for user ${entry.user_id}:`,
          dispatchError
        );
      } else {
        notificationsSent++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications_sent: notificationsSent,
        total_wishlist_users: wishlistEntries.length,
        savings_percent: savingsPercent,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in price-drop-check:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
