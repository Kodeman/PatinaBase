#!/usr/bin/env node
// Sign a synthetic Stripe webhook event payload for local testing of the
// stripe-webhook edge function — no Stripe CLI or real keys required.
//
// Stripe's signature scheme (mirrors stripe-node Webhooks._computeSignature):
//   signed_payload = `${timestamp}.${rawBody}`
//   v1             = HMAC_SHA256(signing_secret, signed_payload)   (hex)
//   header         = `t=${timestamp},v1=${v1}`
// The signing secret is used AS-IS as the HMAC key — the whole `whsec_…`
// string, prefix included (stripe-node does not strip it).
//
// Usage:
//   node scripts/dev/sign-stripe-event.mjs --secret whsec_test123 payload.json
//   node scripts/dev/sign-stripe-event.mjs --secret whsec_test123 \
//     --url http://127.0.0.1:54321/functions/v1/stripe-webhook payload.json
//   echo '{"id":"evt_1",...}' | node scripts/dev/sign-stripe-event.mjs --secret whsec_test123
//
// Options:
//   --secret <whsec_…>   signing secret (or env STRIPE_WEBHOOK_SECRET)
//   --url <endpoint>     POST the signed payload and print the response
//   --timestamp <unix>   override the timestamp (e.g. to test tolerance)
//   --corrupt            flip the last signature hex digit (bad-sig testing)

import crypto from 'node:crypto';
import fs from 'node:fs';

function parseArgs(argv) {
  const opts = { secret: process.env.STRIPE_WEBHOOK_SECRET, url: null, timestamp: null, corrupt: false, file: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--secret') opts.secret = argv[++i];
    else if (a === '--url') opts.url = argv[++i];
    else if (a === '--timestamp') opts.timestamp = Number(argv[++i]);
    else if (a === '--corrupt') opts.corrupt = true;
    else if (!a.startsWith('--')) opts.file = a;
    else {
      console.error(`unknown option: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv);
if (!opts.secret) {
  console.error('error: provide --secret whsec_… (or set STRIPE_WEBHOOK_SECRET)');
  process.exit(2);
}

const body = opts.file ? fs.readFileSync(opts.file, 'utf8') : fs.readFileSync(0, 'utf8');
const t = opts.timestamp ?? Math.floor(Date.now() / 1000);
let v1 = crypto.createHmac('sha256', opts.secret).update(`${t}.${body}`, 'utf8').digest('hex');
if (opts.corrupt) {
  const last = v1.slice(-1);
  v1 = v1.slice(0, -1) + (last === '0' ? '1' : '0');
}
const header = `t=${t},v1=${v1}`;

if (!opts.url) {
  console.log(header);
  process.exit(0);
}

const res = await fetch(opts.url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'stripe-signature': header },
  body,
});
const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text);
process.exit(res.ok ? 0 : 1);
