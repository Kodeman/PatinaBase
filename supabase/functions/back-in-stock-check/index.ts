// Back in Stock Check Edge Function
// Triggered by DB trigger when product_inventory quantity goes from 0 to >0.
// Finds users with this product on their wishlist and dispatches
// back-in-stock notifications. One notification per restock event.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Deduplicate: don't send back-in-stock for same product within 24 hours
const DEDUP_HOURS = 24;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { product_id, product_name, quantity_available } = await req.json();

    if (!product_id) {
      return new Response(
        JSON.stringify({ error: "Missing product_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get product details for the email
    const { data: product } = await supabase
      .from("products")
      .select("images, source_url, price_retail")
      .eq("id", product_id)
      .single();

    const productImageUrl = product?.images?.[0] || null;
    const productUrl = product?.source_url || "https://admin.patina.cloud";
    const priceFormatted = product?.price_retail
      ? `$${(product.price_retail / 100).toLocaleString("en-US", {
          minimumFractionDigits: 2,
        })}`
      : null;

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
    const dedupCutoff = new Date(
      Date.now() - DEDUP_HOURS * 60 * 60 * 1000
    ).toISOString();

    for (const entry of wishlistEntries) {
      // Check dedup: was a back_in_stock notification sent for this product
      // to this user within the last 24 hours?
      const { count } = await supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", entry.user_id)
        .eq("type", "back_in_stock")
        .gte("created_at", dedupCutoff)
        .contains("metadata", { productId: product_id });

      if ((count ?? 0) > 0) {
        continue; // Already notified for this restock
      }

      // Dispatch notification
      const { error: dispatchError } = await supabase.functions.invoke(
        "notification-dispatch",
        {
          body: {
            user_id: entry.user_id,
            type: "back_in_stock",
            channel: "email",
            template_id: "back-in-stock",
            data: {
              productName: product_name || "A product",
              productImageUrl,
              priceFormatted,
              quantityAvailable: quantity_available,
              productUrl,
              productId: product_id,
            },
            priority: "normal",
          },
        }
      );

      if (dispatchError) {
        console.error(
          `Failed to dispatch back-in-stock notification for user ${entry.user_id}:`,
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
        quantity_available,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in back-in-stock-check:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
