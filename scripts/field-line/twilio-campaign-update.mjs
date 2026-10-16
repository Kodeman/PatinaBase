#!/usr/bin/env node
// Widen the existing A2P 10DLC campaign for the Field Line through Twilio's
// UsAppToPerson update API. The console's "Edit Campaign" dialog opened with
// every field disabled on the VERIFIED campaign (2026-09-22), so this is the
// runbook §2 text delivered over the API instead. Credentials come only from
// the environment and are never printed.
//
//   TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_MESSAGING_SERVICE_SID=MG... node scripts/field-line/twilio-campaign-update.mjs list
//   ... show <QE-sid>
//   ... update <QE-sid>          # dry run: prints the payload, sends nothing
//   ... update <QE-sid> --yes    # sends the update
//
// Only Description, MessageFlow and MessageSamples change. The four boolean
// flags are re-sent exactly as fetched (Twilio rejects any change after
// approval), and opt-in/out/help keywords are not editable on an approved
// campaign at all; STOP/HELP strings live on the Messaging Service's Advanced
// Opt-Out (runbook §3.3).

const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;
const BASE = `https://messaging.twilio.com/v1/Services/${MESSAGING_SERVICE_SID}/Compliance/Usa2p`;

// Frozen website consent copy: PatinaWebsite src/lib/copy/system-messages.ts SMS_CONSENT_TEXT. Never reword.
const SMS_CONSENT_TEXT =
  "I agree to receive account and order notification text messages and login verification codes from Patina at the mobile number provided. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to cancel at any time. See our Privacy Policy and SMS Terms.";

const DESCRIPTION = [
  "Patina LLC operates patina.cloud, a B2B platform connecting interior designers with independent makers. This campaign sends two types of messages to registered users who have created an account and provided their mobile number: (1) one-time passcodes for login verification and password reset, sent only when the user initiates the request, and (2) account and order notifications triggered by activity on the user's own account, including quote requests received, quote responses, order status changes, production milestone updates, and shipment notifications. Users opt in during account signup by checking a consent box next to their phone number and confirm enrollment via a verification code. Volume is low and all messages are triggered by the recipient's own activity. Messages identify Patina as the sender and include STOP to opt out and HELP for assistance.",
  "This campaign also carries operational coordination between an interior design studio using Patina and the trades and homeowners on its projects: opt-in invitations, site and delivery coordination, daily open-item digests, selection approvals, and delivery windows. Recipients are the contractors and tradespeople working on the studio's projects and the homeowners who hired the studio. A tradesperson receives exactly one invitation after the studio records their verbal agreement, and texting begins only when they reply YES with the code in that invitation. A homeowner opts in through a separate, unchecked consent checkbox on the studio's kickoff form and confirms the same way. These messages lead with the studio's name, run about one per day, and end with message-and-data-rates, HELP and STOP wording. No marketing.",
].join("\n\n");

const MESSAGE_FLOW = [
  `Website: end users opt in by creating an account at https://patina.cloud/signup and entering their mobile number. Below the field is an unchecked consent checkbox reading: "${SMS_CONSENT_TEXT}" Consent is not a condition of creating an account or using the platform. Users can revoke it at any time from Account Settings > Notifications or by replying STOP.`,
  "Contractors and tradespeople on a studio's project: the design studio asks the tradesperson in person or by phone whether they want project texts and records that verbal agreement in Patina with a timestamp. Patina then sends exactly one invitation that names the studio, the project, the ~1 msg/day frequency, and rates/HELP/STOP wording. No further messages are sent unless the tradesperson replies YES with the code in the invitation. START re-sends a pending invitation and never grants consent by itself.",
  "Homeowners who hired the studio: on the studio's project kickoff form the homeowner ticks a separate, unchecked checkbox consenting to project texts from their studio through Patina; the disclosure text and its version are stored on their record. Patina then sends one invitation and messages only after the homeowner replies YES with the code.",
  "All recipients can reply STOP at any time. Consent is stored per project and is never shared between studios. Terms of Service: https://patina.cloud/terms. Privacy Policy: https://patina.cloud/privacy.",
].join("\n\n");

// Five slots: two existing website samples kept, three Field Line samples from runbook §2.
const MESSAGE_SAMPLES = [
  "Your Patina verification code is 482913. It expires in 10 minutes. Do not share this code",
  "Middlewest Studio coordinates the Maple St project through Patina and would like to text you job updates, about 1 msg/day. Reply YES 42 to start. Msg&data rates may apply. Reply HELP for help, STOP to opt out.",
  "Middlewest Studio - Maple St today: Ref 17 install vanity, Ref 18 confirm grout color. Reply DONE 17, or send a photo or note. Full list: https://client.patina.cloud/f/AbCdEfGh Msg&data rates may apply. Reply HELP for help, STOP to opt out.",
  "Middlewest Studio - Maple St: your bath tile selection is ready for your approval. Ref 31: reply APPROVE 31, or reply with a question. See it: https://client.patina.cloud/s/AbCdEfGh Msg&data rates may apply. Reply HELP for help, STOP to opt out.",
  "Patina: Your order #2210 shipped. Tracking at patina.cloud/o/2210. Reply STOP to unsubscribe, HELP for help",
];

function usage(reason) {
  if (reason) console.error(`twilio-campaign-update: ${reason}`);
  console.error("usage: node scripts/field-line/twilio-campaign-update.mjs list | show <QE-sid> | update <QE-sid> [--yes]");
  process.exitCode = 2;
}

function auth() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

async function twilio(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth(), ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${url.replace(BASE, "…/Usa2p")} → ${res.status} ${json.message ?? ""} (code ${json.code ?? "?"})`);
  }
  return json;
}

function summary(c) {
  return {
    sid: c.sid,
    campaign_status: c.campaign_status,
    campaign_id: c.campaign_id,
    use_case: c.us_app_to_person_usecase,
    has_embedded_links: c.has_embedded_links,
    has_embedded_phone: c.has_embedded_phone,
    age_gated: c.age_gated,
    direct_lending: c.direct_lending,
    description: `${(c.description ?? "").slice(0, 80)}…`,
    samples: (c.message_samples ?? []).length,
  };
}

function checkLimits() {
  const problems = [];
  if (DESCRIPTION.length < 40 || DESCRIPTION.length > 4096) problems.push(`Description length ${DESCRIPTION.length} outside 40..4096`);
  if (MESSAGE_FLOW.length < 40 || MESSAGE_FLOW.length > 2048) problems.push(`MessageFlow length ${MESSAGE_FLOW.length} outside 40..2048`);
  if (MESSAGE_SAMPLES.length < 2 || MESSAGE_SAMPLES.length > 5) problems.push(`MessageSamples count ${MESSAGE_SAMPLES.length} outside 2..5`);
  MESSAGE_SAMPLES.forEach((s, i) => {
    if (s.length < 20 || s.length > 1024) problems.push(`sample ${i + 1} length ${s.length} outside 20..1024`);
  });
  return problems;
}

function buildForm(current) {
  const form = new URLSearchParams();
  form.set("Description", DESCRIPTION);
  form.set("MessageFlow", MESSAGE_FLOW);
  for (const sample of MESSAGE_SAMPLES) form.append("MessageSamples", sample);
  // Re-sent verbatim: Twilio refuses any change to these after approval.
  form.set("HasEmbeddedLinks", String(current.has_embedded_links));
  form.set("HasEmbeddedPhone", String(current.has_embedded_phone));
  form.set("AgeGated", String(current.age_gated ?? false));
  form.set("DirectLending", String(current.direct_lending ?? false));
  if (current.privacy_policy_url) form.set("PrivacyPolicyUrl", current.privacy_policy_url);
  if (current.terms_and_conditions_url) form.set("TermsAndConditionsUrl", current.terms_and_conditions_url);
  return form;
}

async function main(argv) {
  const [command, sid, flag] = argv;
  if (!command) return usage();
  if (!auth() || !MESSAGING_SERVICE_SID) return usage("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_MESSAGING_SERVICE_SID must be set in the environment");

  if (command === "list") {
    const page = await twilio("GET", `${BASE}?PageSize=50`);
    console.log(JSON.stringify((page.compliance ?? []).map(summary), null, 2));
    return;
  }
  if (!sid || !/^QE[0-9a-fA-F]{32}$/.test(sid)) return usage("campaign sid must look like QE… (see `list`)");
  if (command === "show") {
    console.log(JSON.stringify(await twilio("GET", `${BASE}/${sid}`), null, 2));
    return;
  }
  if (command !== "update") return usage(`unknown command ${command}`);

  const problems = checkLimits();
  if (problems.length) return usage(problems.join("; "));
  const current = await twilio("GET", `${BASE}/${sid}`);
  if (current.has_embedded_links !== true) {
    return usage("campaign has_embedded_links is not true; the Field Line samples carry links and that flag cannot change after approval");
  }
  const form = buildForm(current);
  console.log(`current: ${JSON.stringify(summary(current))}`);
  console.log("payload:");
  for (const [key, value] of form) console.log(`  ${key}: ${value}`);
  if (flag !== "--yes") {
    console.log("\ndry run; re-run with --yes to send.");
    return;
  }
  const updated = await twilio("POST", `${BASE}/${sid}`, form);
  console.log(`updated: ${JSON.stringify(summary(updated))}`);
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`twilio-campaign-update: ${err.message}`);
  process.exitCode = 1;
});
