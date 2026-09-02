// feedback-github-issue — the Deno.serve wrapper. All of the behaviour (and
// every test) lives in handler.ts, which takes its Supabase client, fetch and
// env as injectable deps.

import { handler } from "./handler.ts";

Deno.serve((req: Request) => handler(req));
