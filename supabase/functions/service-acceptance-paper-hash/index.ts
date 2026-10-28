import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPaperHashHandler } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const auth = { persistSession: false, autoRefreshToken: false };
Deno.serve(createPaperHashHandler({
  caller: (authorization) =>
    createClient(url, anonKey, {
      auth,
      global: { headers: { Authorization: authorization } },
    }),
  service: () =>
    createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth }),
}));
