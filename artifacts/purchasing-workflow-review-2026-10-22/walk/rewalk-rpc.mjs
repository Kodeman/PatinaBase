// SQ-1801: call an ordinary authenticated app RPC as a seeded walk user (the same RPC the portal hook calls).
// Usage: node rewalk-rpc.mjs <member|owner> <rpc_name> '<json args>'
import { readFileSync } from "node:fs";
const cfg = readFileSync("/Users/kody/Code/patina-merged/apps/designer-portal/playwright.config.ts", "utf8");
const anon = cfg.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY:[\s\S]{0,40}?(eyJ[A-Za-z0-9._-]+)/)[1];
const URL_ = "http://127.0.0.1:54321";
const [who, rpc, args] = process.argv.slice(2);
const email = `us50-${who}@patina.dev`;
const tok = await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ email, password: "password123" }) })).json();
if (!tok.access_token) { console.log("login failed", JSON.stringify(tok).slice(0, 200)); process.exit(1); }
const r = await fetch(`${URL_}/rest/v1/rpc/${rpc}`, { method: "POST", headers: { apikey: anon, authorization: `Bearer ${tok.access_token}`, "content-type": "application/json" }, body: args || "{}" });
console.log(r.status, (await r.text()).slice(0, 600));
