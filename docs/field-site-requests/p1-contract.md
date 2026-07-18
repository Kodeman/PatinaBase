# Field Site Request P1 contract

This document is the implementation trace for the P1 request loop. It replaces
the stale assumptions in earlier planning artifacts: Patina Field is the
designer surface, `project_rooms` is the Binder spine, guest access is an
opaque request token through Edge functions, Supabase is the database and
Storage authority, and Cloudflare remains the production application/service
host. There is no Coolify, guest account/JWT, second room model, or second
mobile persistence stack.

## Screen-to-acceptance trace

| Screen | Production acceptance |
| --- | --- |
| SR01 Site hub | Opens from a real project, shows that project's requests, delivered review work, Binder rooms/counts, parties, and activity. |
| SR02 Composer | Starts a project-scoped draft and adds the built-in K-01/K-02 kits without inventing custom-kit state. |
| SR03 Item configuration | Assigns a real `project_rooms` room, immutable title/guidance revision, and the versioned built-in checklist. |
| SR04 Assign/send | Requires one project party, normalized phone, due timestamp, optional due context, and a consent-aware preview. A 2xx response means the durable dispatch outbox accepted the action, not that Twilio delivered it. |
| SR05 Tracker | Reads server request/item state and the append-only event thread, including open, dispatch, delivery, redo, approval, close, and expiry evidence. |
| SR06 Review inbox | Lists only actual delivered attempts awaiting designer action. |
| SR07 Measure review | Shows canonical integer-mm values, display conversion, capturer/time provenance, and any proof asset from the exact immutable attempt. |
| SR08 Photo review | Shows the configured shot result, original or signed derivative, recorded skip notes, checksum/path provenance, and the exact attempt. |
| SR09 Approval | Approves once into the Binder atomically, or reopens only the selected item with a required verbatim redo note. |
| SR10 Binder rooms | Derives room counts and recency from current `site_binder_current` entries; no fixture or parallel room store is allowed in real mode. |
| SR11 Binder detail | Reads current approved dimensions/media and complete approval provenance for the selected `project_rooms` room. |
| SR12 Binder history | Reads append-only entries and `supersedes_entry_id` history without overwriting prior approval records. |
| SR13 Guest landing | Bootstraps only the narrow request DTO with an `sr_…` bearer; it grants no JWT or direct table/Storage access and offers an explicit leave action in native mode. |
| SR14 Guest checklist | Renders the exact current immutable item versions and honestly distinguishes open, delivered, approved, and redo work. |
| SR15 Guest measure | Captures every configured K-01 label exactly once, supports 1/16-inch and metric entry, stores integer millimetres, and optionally binds a proof photo. |
| SR16 Guest photo | Captures or explicitly skips every configured K-02 shot. Each capture maps to one server-received media UUID; each skip retains its verbatim reason. |
| SR17 Guest queue | Shows durable queued, uploading, awaiting-receipt, retryable, terminal, and delivered states from IndexedDB or SwiftData. |
| SR18 Guest receipt | Appears only after the server acknowledges Storage checksum/size and returns the idempotent delivery receipt. |
| SR19 Guest done | States that the delivery is ready for review; it does not claim an external notification succeeded without server evidence. |
| SR20 Guest returned | Shows the designer's verbatim note and reopens only the selected item/version while preserving prior attempts. |

The `SR01`–`SR20` names intentionally avoid the existing `S1`–`S5` Capture
screen namespace.

## Lifecycle contracts

Request state:

```text
draft ──send──> awaiting_consent ──YES + dispatch──> sent
  └────────────────durable dispatch success────────────┘
sent ──guest activity──> in_progress ──all items delivered──> delivered
delivered ──all items approved──> completed
delivered/completed ──single-item redo──> in_progress
open nonterminal ──close──> closed
open nonterminal ──expiry──> expired
```

Item state:

```text
open ──server-acknowledged delivery──> delivered ──approve──> approved
delivered/approved ──verbatim redo note──> redo_requested ──redelivery──> delivered
```

Dispatch state is independent of the product state. Send, resend, consent,
nudge, and due reminders enter `site_request_dispatch_outbox`; raw access is
minted only when a worker claims a link dispatch. Quiet hours and transient
provider failures reschedule the identifier-only outbox row. A request is
marked dispatched, a nudge allowance consumed, and a due reminder finalized
only after provider acceptance. Unacknowledged access is revoked before retry.

Approval is idempotent and transactional: it inserts exactly one append-only
Binder entry for a delivered attempt and derives current state through
`site_binder_current`. A redo never mutates that historical entry.

## Offline and receipt semantics

- Web stores the complete delivery record and `Blob`s in IndexedDB before
  network work. Relaunch resumes at upload intent, upload, or receipt probing.
- Native stores the delivery record and file paths in SwiftData, with its
  request-scoped token in Keychain. A token is never applied to another
  request's queued work.
- A stable client attempt UUID scopes upload intent and delivery idempotency.
  Reusing it with different immutable input is rejected.
- Storage acceptance alone is not delivery. The guest function downloads the
  private object, verifies byte count and SHA-256, acknowledges the media row,
  then the delivery RPC validates the complete configured kit.
- Only a server delivery receipt changes a client record to `delivered`.
  Permanent access/version conflicts stop automatic retry; transient failures
  retain bounded backoff and honest pending state.
- P1 promises relaunch recovery and foreground retry. Native background
  execution, dead-zone transfer, camera/low-light behavior, and mobile Safari
  Blob recovery remain physical-device/browser pilot gates rather than static
  test claims.

## Access and retention contract

| Actor | Allowed | Denied |
| --- | --- | --- |
| Owning designer/project member | RLS-scoped request, delivery, event, and Binder reads; authenticated transactional RPCs | Direct inserts/updates to immutable Site Request business tables; foreign-project data |
| Guest with active request token | Narrow bootstrap, request/version-bound upload intent, receipt, and delivery through `site-request-guest` | Supabase JWT, service key, direct table access, arbitrary object path, another request/version |
| Revoked/expired/stolen token | Nothing after server hash/status/expiry validation | Bootstrap, upload, receipt, delivery, cross-request probing |
| Service worker | Narrow service RPCs, dispatch/notification outboxes, derivative and retention maintenance | Raw token persistence in database, analytics, notification metadata, or SMS history |

Raw tokens use an `sr_` namespace so the Field universal link claims only Site
Requests and leaves legacy 64-hex `/field/*` Coordination links on the web.
Only SHA-256 hashes are stored. SMS history retains redacted copy; the raw link
exists only in the provider-bound message.

Original media stays at immutable request/version/attempt paths. A service-only
maintenance job creates deterministic 512px and 1600px JPEG derivatives through
the existing Cloudflare inference rail. Closing or expiry starts a 90-day clock;
after it elapses the job removes originals/derivatives only for deliverables
that were never approved into the Binder and records `purged_at`.

## Delivery and evidence boundaries

- Portals deploy only through `infra/deploy-portal.sh`; Edge functions and
  migrations deploy through the linked Supabase CLI; retained services deploy
  through their Cloudflare Workers/Containers units.
- The App Clip, custom kits/markup, video, TUS/large-transfer work, intelligent
  Binder, and spatial projections remain P2–P4 evidence-gated programs.
- Simulator screenshots prove deterministic render coverage, not camera,
  background transfer, Universal Link, VoiceOver, or production APNs/Twilio.
- P1 pilot approval requires the automated local loop plus explicit physical
  iPhone, mobile Safari, real-provider, and server-side Storage/Binder evidence.
