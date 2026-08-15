# In-App Messaging — Product Requirements Document

> **Status**: Draft — Open Questions Resolved, Ready for Review
> **Owner**: Kody
> **Version**: 1.0
> **Last Updated**: 2026-04-29
> **Depends On**: Email & Notification System PRD (v1.0), `notify()` package (`@patina/notifications`)
> **Related**: Communications Command Center PRD (separate — admin marketing email)
> **Portals**: Designer Portal, Client Portal, future Vendor Portal

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Scope & Non-Goals](#3-scope--non-goals)
4. [Personas & Use Cases](#4-personas--use-cases)
5. [Information Architecture](#5-information-architecture)
6. [Conceptual Model](#6-conceptual-model)
7. [Screen Specifications](#7-screen-specifications)
8. [User Flows](#8-user-flows)
9. [Data Model](#9-data-model)
10. [Realtime Contract](#10-realtime-contract)
11. [Notification Integration](#11-notification-integration)
12. [API & Hook Surface](#12-api--hook-surface)
13. [Permissions & RLS](#13-permissions--rls)
14. [Legacy Migration](#14-legacy-migration)
15. [Analytics & Telemetry](#15-analytics--telemetry)
16. [Implementation Phases](#16-implementation-phases)
17. [Success Criteria](#17-success-criteria)
18. [Resolved Decisions](#18-resolved-decisions)
19. [Related Documentation](#19-related-documentation)

---

## 1. Executive Summary

### What We're Building

A unified, Supabase-native, real-time in-app messaging system that powers every conversation between Patina's three sides: designers, clients, and vendors. One thread model, one data store, one realtime channel — with surfaces in the designer portal, client portal, project detail pages, and (when it ships) the vendor portal.

This is the conversational backbone of the platform: where a client asks a designer about a sourced piece, where a designer briefs a vendor on a custom build, where a project room becomes a small group chat between everyone working on it. It is the system that makes Patina feel like a service, not a catalog.

### Why Now

The platform is in a structurally broken state today. The designer portal writes messages to a legacy flat `client_messages` table. The client portal calls a `comms` microservice that does not exist in the repository (the API routes proxy to `localhost:3017`, but `services/` contains only `aesthete-engine`, `media`, `orders`, and `projects`). A designer's reply lands in Postgres; a client's reply hits a connection-refused error. **The two halves of the conversation never meet.** Every other roadmap item that depends on cross-side communication — vendor pipeline, project collaboration, scope-change negotiation, decisions surfacing inline, the iOS companion's "ask my designer" affordance — is blocked behind this gap.

Building this now consolidates onto Supabase per the project's stated architecture (`CLAUDE.md`: "Do not add new NestJS services — use Supabase edge functions instead"), retires the phantom microservice proxy, gives realtime for free via Supabase channels, and integrates cleanly with the existing `notify()` system so message-arrival emails are a trigger, not a feature build.

### Who It's For

- **Designers** running multiple projects, fielding decisions and questions from clients, briefing vendors. Today's primary user.
- **Clients** in the middle of a project — pre-purchase questions, decision responses, post-purchase coordination.
- **Vendors / makers** receiving briefs, providing lead-time updates, sharing photos of in-progress work. Future surface, same model.
- **Admins** auditing conversations for quality, compliance, and dispute resolution.

### Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Round-trip latency (send → recipient sees) | < 1.5s p95 | Realtime delivery vs. Postgres insert timestamp |
| Daily active threads (any participant message in 24h) | Trackable from launch; growth tracked | PostHog `thread_message_sent` |
| Designer time per client-question response | < 2 min median | Composer open → send |
| New-message email open-through rate | > 40% (thread-aware deep links) | Resend opens × `notify()` `in_app_message` events |
| Designer↔client conversation completeness | 100% | Zero messages dropped between portals (currently ~50% drop today) |
| Unread-badge accuracy | 100% match between server and client state | Manual QA + PostHog drift monitor |

---

## 2. Problem Statement

### The Two-System Reality

Patina currently has two messaging systems that share neither schema, transport, nor users:

1. **Legacy Supabase `client_messages`** (migration `00014`). Flat sender/recipient model with `subject`, `body`, `attachments`, `read_at`, `archived_by_*`. RLS on. The designer portal's `useClientMessages` and `useSendClientMessage` hooks read and write here.
2. **Phantom `comms` microservice**. Both `apps/designer-portal/src/app/api/comms/*` and `apps/client-portal/src/app/api/comms/*` proxy six route files (threads CRUD, messages CRUD, attachments CRUD) to `COMMS_SERVICE_URL` (default `http://localhost:3017`). The client portal's split-view UI is wired exclusively to this proxy via `commsApi`. **No service implementation exists.**

The designer-portal `/portal/messages` page renders a list of clients sorted by activity but isn't even reachable from the sidebar (`apps/designer-portal/src/config/navigation.ts` has no entry). Filter chips for "unread" and "archived" render but do nothing. The client portal calls a proxy that returns `ECONNREFUSED`.

### What This Blocks

- **Project collaboration**. The Designer Portal MVP Additions Spec calls for Zone 11 ("Communications") on every project detail page — recent project messages with inline reply. Cannot ship without a thread system that supports `project_id` linkage.
- **Vendor pipeline**. The vendor pipeline PRD assumes designer↔vendor briefing threads. There is no schema for those.
- **Decisions inline**. The designer portal already inlines `DecisionCard` components into the conversation view, but they live in a one-to-one model that can't carry the project or proposal context decisions need.
- **iOS companion handoff**. "Ask my designer" can't route into a thread that doesn't exist on the receiving end.
- **Scope-change negotiation**. Recent commits (`#17`) added scope-change request flows on both portals; their natural home is a thread, not an isolated record.

### Why Build Native, Not Repair the Microservice

`CLAUDE.md` is unambiguous: "Do not add new NestJS services — use Supabase edge functions instead." Beyond the stated rule:

- **Realtime is native.** Supabase JS client `.channel().on('postgres_changes', …)` gives sub-second message fan-out without standing up a WebSocket gateway.
- **RLS is the authorization model.** Per-participant access falls out of policy declarations, no service-level guards needed.
- **`notify()` is already wired** to Postgres triggers. New-message emails are a trigger, not a service responsibility.
- **One less deploy unit.** Cloudflare already retains three NestJS Container services while Supabase Strata owns the data plane. A fourth service for messaging is operational debt without offsetting upside.

---

## 3. Scope & Non-Goals

### In Scope (v1)

- Designer↔client direct threads (1:1).
- Designer↔vendor direct threads (1:1).
- Project group threads (designer + client + optionally vendors), scoped to a `project_id`.
- Threads optionally linked to a `proposal_id` or `decision_id` for context.
- Text + Markdown body, with @-mentions resolving to participants.
- Attachments (images, PDFs) up to 25 MB per file, 4 per message.
- Per-participant read state, archive, mute.
- Unread badges in nav.
- Realtime delivery via Supabase channels.
- Typing indicators via Supabase Presence.
- New-message email notifications via `notify()`, debounced.
- Inline `DecisionCard` rendering when a message is associated with a decision.
- Quick-reply templates (designer side, retaining current `QuickReplyBar`).
- Project-detail Zone 11 ("Communications") embedded thread snippet.
- Admin read-only access for moderation.

### Out of Scope (v1)

- Group threads larger than the project participant set (no public channels, no broadcast threads).
- Voice / video calls, voice notes.
- Reactions and emoji responses (deferred to v1.1).
- Threaded replies / quoted reply chains (single-level reply via `reply_to_message_id` is in; full nested threads are not).
- Scheduled messages / send-later.
- Cross-thread search (basic in-thread search is in; global search is v1.1).
- Message translation / multi-language UX.
- E2E encryption beyond Supabase's transport TLS.
- Migration of every historical `client_messages` row (we backfill, but don't expose them as first-class threads — see §14).
- Marketing / campaign sends (those live in the Communications Command Center, separate PRD).

---

## 4. Personas & Use Cases

### Designer (primary)

> "I'm running six active projects. Each one has a client who asks me three things a week. Two of them have a vendor I'm coordinating a custom piece with. I need every conversation in one place, sortable by project, with unread on top."

Top tasks:
- Triage unread across all clients in under 30 seconds at start of day.
- Reply to a decision question without leaving the project context.
- Brief a vendor on a custom build, attach a reference photo, get a quote back in-thread.
- Mute a thread that's gone quiet without losing it.
- Send a quick-reply ("I'll have that proposal to you Friday") in two clicks.

### Client

> "I want to ask my designer a quick question about the dining table. I don't want to call. I don't want to email. I want it to feel like texting someone who knows my home."

Top tasks:
- Read a new message and respond from the client portal or PWA.
- Open a decision card from a message and respond inline.
- Send a photo of a room with a question pinned to it.
- Mark the thread read.

### Vendor (forward-looking, post-vendor-portal)

> "I make sofas. A designer just sent me a brief with a fabric sample photo. I need to confirm I can do it, give a lead time, and ask about the leg style."

Top tasks:
- Receive a brief, respond with quote + lead time.
- Upload a progress photo mid-build.
- Flag a delay.

### Admin

> "A designer reported a difficult conversation with a client. I need to read the thread to mediate."

Top tasks:
- Read any thread (read-only).
- Export a thread for legal/dispute purposes.
- Suspend a participant (rare).

---

## 5. Information Architecture

### Designer Portal

```
Designer Portal
├── Home
├── Projects
├── Clients
│   └── [client]
│       └── Messages tab          ← scoped DM with this client
├── 💬 Messages                   ← NEW top-level entry, replaces hidden /portal/messages
│   ├── Inbox (default — all kinds, unread first)
│   ├── Direct
│   ├── Projects
│   ├── Vendors
│   └── Archived
└── Settings
    └── Notifications              (mute rules, digest preferences)
```

Sidebar: a `Messages` entry with a numeric unread badge. Clicking lands on `/portal/messages`, which is now the canonical inbox view. The existing `messages-panel.tsx` slide-out becomes a peek affordance launchable from anywhere (keyboard `M`).

### Client Portal

```
Client Portal
├── Home
├── My Project
├── 💬 Messages                   ← top-level
└── Account
```

Mobile-first split: thread list is the default screen on mobile; tapping opens the thread (back button returns to list). Desktop is a permanent split-view (already implemented; data layer swaps underneath).

### Project Detail (both portals)

Zone 11 "Communications" panel — the project's group thread plus any 1:1 sub-threads scoped to the project. Three most-recent messages, an inline reply box, and a "View full thread →" link.

### URL Structure

| Portal | Route | Screen |
|--------|-------|--------|
| Designer | `/portal/messages` | Inbox (all threads) |
| Designer | `/portal/messages/:threadId` | Single-thread detail |
| Designer | `/portal/clients/:id/messages` | Client-scoped DM thread (resolves to a thread of `kind='direct'`, `participants={designer, client}`) |
| Designer | `/portal/projects/:id` (Zone 11) | Embedded project thread |
| Client | `/messages` | Inbox |
| Client | `/messages/:threadId` | Single-thread detail |
| Client | `/project` (Zone 11) | Embedded project thread |
| Admin | `/admin/comms/threads/:id` | Read-only audit view (post-launch follow-up) |

---

## 6. Conceptual Model

### Threads

A **thread** is a durable conversation between two or more participants. Every message belongs to exactly one thread. A thread has a `kind`:

| Kind | Participants | Linkage | Notes |
|------|--------------|---------|-------|
| `direct` | Exactly 2 | None required | Designer↔client or designer↔vendor 1:1 |
| `project` | 2+ (designer + client always; vendors optional) | `project_id` required | Group thread for a project |
| `vendor_brief` | Exactly 2 (designer + vendor) | `project_id` optional | Specialized direct thread initiated from a project, distinguished for vendor-portal filtering |
| `support` | 2 (admin + any user) | None | Admin-initiated; v1.1 |

A thread may carry an optional `proposal_id` or `decision_id` to set context for the conversation. This is metadata, not a new thread per decision — a single project thread can reference many decisions over its lifetime; a single message can reference one.

### Participants

A **participant** is the join row between a `profile` and a `thread`. It carries the per-user state that the thread itself does not own:

- `role` — designer, client, vendor, admin
- `joined_at`, `left_at`
- `last_read_at` — drives unread counts
- `archived_at` — soft archive, hides from default inbox
- `muted_at` — suppresses notifications without hiding the thread
- `notification_pref` — `all` | `mentions` | `none`

Participants can be added or removed over a thread's life (e.g., adding a vendor mid-project), with system messages recording the change.

### Messages

A **message** is an immutable insert (with edit/delete soft-state). Fields:

- `body` — text, Markdown subset (bold, italic, links, lists). No raw HTML.
- `attachments` — JSONB array of `{ storage_path, mime, size, width?, height? }`.
- `reply_to_message_id` — optional pointer for single-level reply (renders quoted preview, not nested thread).
- `decision_id` — optional, renders inline `DecisionCard` instead of plain body.
- `mentions` — array of `profile_id`s, parsed from `@username` at send time.
- `edited_at`, `deleted_at` — soft-state. `deleted_at` blanks the body in API responses but keeps the row for audit.
- `system` — boolean. System messages ("Vendor X joined the thread", "Decision Y was approved") are never editable, never authored by a user, and render in a muted style.

### Decision Cards & Quick Replies

Decisions are rendered inline when `decision_id` is set on a message. The current `DecisionCard` component on the designer side is reused; the client side gets a parallel `decision-card-client` (already exists at `apps/client-portal/src/components/decision-card-client.tsx`). Posting a response to a decision creates a new system-flagged message in the same thread, preserving narrative continuity.

Quick replies (designer-side `QuickReplyBar`) become user-managed templates stored in `comms_quick_replies` (per-designer). v1 ships with a curated default set; users can edit, add, and reorder.

---

## 7. Screen Specifications

### 7.1 Designer Inbox (`/portal/messages`)

**Layout**: Two-column. Left rail (320px): filter tabs + thread list. Right pane: active thread (default empty state on first load).

**Filter tabs** (top of left rail):
- `Inbox` (default) — all unarchived threads, sorted unread-first then `last_message_at` desc.
- `Direct` — `kind='direct'`.
- `Projects` — `kind='project'`, grouped by project name.
- `Vendors` — `kind='vendor_brief'`, grouped by vendor.
- `Archived` — participant `archived_at` is not null.

**Search input**: filters threads by participant name, project name, or message body (server-side ILIKE on indexed columns; full-text search is a v1.1 enhancement).

**Thread row**:
- Avatar (counterpart's avatar for `direct`, project thumbnail for `project`).
- Title (counterpart name for `direct`, project name for `project`).
- Subtitle (last message preview, 60 chars, truncated).
- Right side: relative timestamp + unread dot + count badge if multi-unread.
- Decision indicator: small Clay-tinted icon if any unread message has `decision_id`.
- Muted indicator: bell-with-slash if `muted_at` is set.

**Empty state**: large illustration + "No conversations yet. Reach a client from a project page." with CTA to projects.

**Right pane (active thread)**:
- Header: counterpart info, project link if applicable, action menu (mute, archive, mark unread, view participants).
- Message list: virtualized, paginated 50 at a time, infinite-scroll-up.
- Date separators (Today / Yesterday / `MMM D`).
- Decision messages render `DecisionCard` inline.
- System messages render centered, muted.
- Composer: rich text input with Markdown shortcuts, attachment button, mention picker on `@`, send button (Cmd/Ctrl+Enter), `QuickReplyBar` row of templates above the input.
- Typing indicator: italicized "Anna is typing…" footer, driven by Presence.

### 7.2 Client Inbox (`/messages`)

Same conceptual layout as designer (split-view on desktop, stacked mobile). Differences:
- No filter tabs — client typically has 1–3 threads. List is a simple chronological roll.
- No vendor or admin tabs — RLS hides those threads anyway.
- "Quick replies" not exposed (clients write fresh).
- Decision cards render in `decision-card-client.tsx` style.

### 7.3 Client-Scoped DM (designer: `/portal/clients/:id/messages`)

The current page shape is preserved: scoped to a specific client. Internally resolves to (or creates) a `thread` of `kind='direct'` with participants `{designer, client}`. URL stays for muscle memory but is a thin wrapper over the new thread route.

### 7.4 Project Zone 11 — Communications

Embedded panel on `/portal/projects/:id` (designer) and `/project` (client):
- Title: "Communications".
- Three most-recent messages from the project thread.
- Inline composer below.
- Right-aligned link: "View full thread →" → `/portal/messages/:threadId`.
- Empty state: "No messages yet. Kick off the conversation."
- Updates in realtime as new messages arrive.

### 7.5 Vendor Brief (designer-initiated)

Triggered from a project's vendor row. Opens a thread of `kind='vendor_brief'` pre-seeded with:
- A system message: "Designer opened a brief for {project_name}."
- A composer pre-filled with the project's brief template (configurable).

### 7.6 Slide-Out Peek Panel (designer)

The existing `messages-panel.tsx` becomes a global peek panel:
- Keyboard shortcut `M`.
- Fixed 400px right rail.
- Thread list + last 10 messages of active thread.
- Reply inline.
- Closes on Esc.

### 7.7 Notification Settings

`Settings → Notifications` adds a "Messages" section:
- Per-thread defaults (all / mentions / none).
- Quiet hours (inherits from `@patina/notifications` preferences).
- Per-thread overrides accessible from the thread header menu.

---

## 8. User Flows

### F1 — Designer replies to a client question (cold)

1. Push notification or email lands; deep-link opens `/portal/messages/:threadId`.
2. Thread renders with the unread message at top of viewport, marked unread.
3. Composer focused; designer types and sends.
4. Optimistic insert renders the message instantly (status: pending).
5. Postgres insert fires; realtime channel broadcasts; UI flips to delivered.
6. `last_read_at` advances on the designer's participant row.
7. Client receives realtime broadcast; their UI shows new message + unread badge updates.
8. Trigger schedules a debounced `notify(client, 'in_app_message', …)` — fires only if client hasn't opened the thread within 5 minutes.

### F2 — Client opens a decision-card message

1. Client sees a thread row with a Clay-tinted decision indicator.
2. Opens thread; the decision message renders as a `DecisionCard` inline.
3. Selects an option, writes a comment, submits.
4. Submission posts a new system message: "Client responded to decision: Option B."
5. Designer's thread updates in realtime; the decision row's status shifts to `responded`.

### F3 — Designer briefs a vendor

1. From `/portal/projects/:id`, designer clicks "Brief vendor" on a vendor row.
2. New `vendor_brief` thread created with participants `{designer, vendor}`, `project_id` set.
3. System message + pre-filled composer appears.
4. Designer attaches reference image, sends.
5. Vendor receives email (vendor portal not live yet → email contains thread deep-link to a future portal route + a fallback "reply by email" address routed via Resend inbound parsing).

> Vendor reply by email is a v1.1 enhancement. For v1, the brief-by-thread shape is in place; vendor responses come through the future vendor portal.

### F4 — Mute / archive

1. From thread header menu, designer selects "Mute".
2. Participant `muted_at` set to `now()`.
3. New messages in thread no longer trigger `notify()` for the designer (UI badge still updates).
4. Archive sets `archived_at`; thread disappears from default inbox until a new message arrives, which clears `archived_at` automatically.

### F5 — @-mention

1. Designer types `@` in composer; popover lists thread participants by name.
2. Selecting "Anna" inserts `@Anna` styled chip.
3. On send, `mentions` array on the message includes Anna's `profile_id`.
4. `notify()` fires with `priority='high'` for mentioned users — bypasses quiet hours like transactional types do.

### F6 — Realtime drop / reconnect

1. Network interruption; client UI shows offline indicator.
2. Reconnection: client refetches the active thread (`useThreadMessages`) and re-subscribes to the channel.
3. Any messages sent during the gap appear in order; unread state is reconciled from server.

---

## 9. Data Model

All tables live in the `public` schema (consistent with other Supabase-native domains). Migrations are additive; legacy `client_messages` is preserved through migration N+1 (see §14) and dropped in migration N+2.

### `comms_threads`

```sql
CREATE TABLE comms_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL CHECK (kind IN ('direct','project','vendor_brief','support')),
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  proposal_id     UUID REFERENCES proposals(id) ON DELETE SET NULL,
  title           TEXT, -- optional; usually derived from participants/project
  created_by      UUID NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_comms_threads_project ON comms_threads(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_comms_threads_last_message ON comms_threads(last_message_at DESC);
CREATE INDEX idx_comms_threads_kind ON comms_threads(kind);
```

Constraint: `direct` and `vendor_brief` threads must have exactly 2 participants. Enforced via a deferred trigger so participants can be inserted in the same transaction as the thread.

### `comms_thread_participants`

```sql
CREATE TABLE comms_thread_participants (
  thread_id          UUID NOT NULL REFERENCES comms_threads(id) ON DELETE CASCADE,
  profile_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role               TEXT NOT NULL CHECK (role IN ('designer','client','vendor','admin')),
  joined_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at            TIMESTAMPTZ,
  last_read_at       TIMESTAMPTZ NOT NULL DEFAULT 'epoch',
  archived_at        TIMESTAMPTZ,
  muted_at           TIMESTAMPTZ,
  notification_pref  TEXT NOT NULL DEFAULT 'all'
                     CHECK (notification_pref IN ('all','mentions','none')),
  PRIMARY KEY (thread_id, profile_id)
);

CREATE INDEX idx_participants_profile_unread
  ON comms_thread_participants(profile_id)
  WHERE archived_at IS NULL AND left_at IS NULL;
```

### `comms_messages`

```sql
CREATE TABLE comms_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id           UUID NOT NULL REFERENCES comms_threads(id) ON DELETE CASCADE,
  sender_id           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  body                TEXT NOT NULL DEFAULT '',
  attachments         JSONB NOT NULL DEFAULT '[]'::jsonb,
  reply_to_message_id UUID REFERENCES comms_messages(id) ON DELETE SET NULL,
  decision_id         UUID REFERENCES decisions(id) ON DELETE SET NULL,
  mentions            UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  system              BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at           TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_messages_thread_created ON comms_messages(thread_id, created_at DESC);
CREATE INDEX idx_messages_sender ON comms_messages(sender_id);
CREATE INDEX idx_messages_decision ON comms_messages(decision_id) WHERE decision_id IS NOT NULL;
CREATE INDEX idx_messages_mentions ON comms_messages USING GIN(mentions);
```

### `comms_quick_replies` (designer-side templates)

```sql
CREATE TABLE comms_quick_replies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  body        TEXT NOT NULL,
  position    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quick_replies_profile ON comms_quick_replies(profile_id, position);
```

### Trigger: bump `last_message_at`

```sql
CREATE FUNCTION comms_bump_thread_activity() RETURNS TRIGGER AS $$
BEGIN
  UPDATE comms_threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comms_bump_thread_activity
AFTER INSERT ON comms_messages
FOR EACH ROW EXECUTE FUNCTION comms_bump_thread_activity();
```

### Trigger: dispatch notifications

```sql
CREATE FUNCTION comms_dispatch_notifications() RETURNS TRIGGER AS $$
BEGIN
  -- Enqueue a debounced notification job; the edge function decides whether to fire
  -- based on each recipient's last_read_at, muted_at, and notification_pref.
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/comms-notification-dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := jsonb_build_object('message_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_comms_dispatch_notifications
AFTER INSERT ON comms_messages
FOR EACH ROW WHEN (NEW.system = false)
EXECUTE FUNCTION comms_dispatch_notifications();
```

The actual notification logic lives in an edge function `supabase/functions/comms-notification-dispatch/` that calls `notify()` per eligible participant — see §11.

---

## 10. Realtime Contract

### Channels

Each thread maps to a Supabase Realtime channel:

```
thread:{thread_id}
```

Subscribers (clients with active thread view) receive:
- `INSERT` on `comms_messages` where `thread_id = :id`
- `UPDATE` on `comms_messages` where `thread_id = :id` (for edits, deletes)
- `UPDATE` on `comms_thread_participants` where `thread_id = :id` (for read-state sync — optional broadcast for "seen" indicators in v1.1)

### Inbox-level subscription

Each user's inbox subscribes to:

```
inbox:{profile_id}
```

A lightweight broadcast channel (not Postgres CDC) the dispatch edge function pings whenever a participant's relevant thread changes — used to update the unread badge in the sidebar without subscribing to every thread the user is in.

### Presence (typing)

Each thread channel uses Supabase Presence with payload `{ profile_id, is_typing: bool }`. Clients update presence on `keydown` (debounced 300ms) and clear on send or 5s idle.

### Reconnect strategy

- TanStack Query handles cold reload via `staleTime: 0` on the thread detail.
- On channel reconnect, the client refetches messages with `created_at > last_seen_message_created_at` and merges in.

---

## 11. Notification Integration

Message-arrival notifications are dispatched via the existing `@patina/notifications` `notify()` function. A new notification type:

```ts
type NotificationType = '...' | 'in_app_message' | 'in_app_message_mention';
```

Default channels: `['email', 'in_app']`. (Push reserved for the iOS companion phase.)

### Eligibility rules (per recipient, per message)

The `comms-notification-dispatch` edge function evaluates:

1. Recipient is a participant on the message's thread, with `left_at IS NULL`.
2. Recipient is **not** the sender.
3. `muted_at IS NULL` — muted users get nothing.
4. `notification_pref` is:
   - `all` → eligible.
   - `mentions` → eligible only if recipient `profile_id ∈ message.mentions`.
   - `none` → ineligible.
5. Recipient hasn't read the thread within the last 5 minutes (debounce window).
6. No other notification sent for this thread to this recipient in the last 5 minutes (coalescing window — multiple rapid messages produce one email).

If eligible, calls `notify(ctx, recipient_id, type, data, options)` where:

- `type` is `'in_app_message_mention'` if the recipient is in `message.mentions`, else `'in_app_message'`.
- `data` carries `{ thread_id, sender_name, sender_avatar_url, preview_body, deep_link }`.
- `options.priority` is `'high'` for mentions, `'normal'` otherwise.

### Email template

A new React Email template `email-templates/in-app-message.tsx` rendering:
- Subject: `New message from {sender_name}` (or `{sender_name} mentioned you`).
- Header: thread context (project name if `kind='project'`).
- Body preview (first 200 chars of message, attachments as inline thumbnails for images).
- CTA: "Open conversation →" deep-link to `/portal/messages/:threadId` or `/messages/:threadId` depending on recipient role.
- Footer: per-thread mute link + global preferences link.

### Digest mode (v1.1 candidate)

Per-user pref: `instant` | `15m_digest` | `hourly_digest`. v1 is `instant` only. Digest infrastructure already exists in `@patina/notifications` queue.

---

## 12. API & Hook Surface

The system is Supabase-native. There is no NestJS service. All access is via:

1. **Direct PostgREST** through the Supabase client (RLS-enforced).
2. **Postgres RPC** for compound operations.
3. **Edge functions** for cross-cutting concerns (notifications, attachment uploads, vendor email gateway).

### Hooks (in `@patina/supabase`, exported from `src/hooks/index.ts`)

```ts
useThreads(params?: {
  scope?: 'inbox' | 'direct' | 'project' | 'vendor_brief' | 'archived'
  projectId?: string
  search?: string
}): UseQueryResult<ThreadSummary[]>

useThread(threadId: string): UseQueryResult<ThreadDetail>

useThreadMessages(threadId: string, opts?: {
  limit?: number  // default 50
  before?: string // cursor: created_at of oldest currently loaded
}): UseInfiniteQueryResult<Message[]>

useSendMessage(): UseMutationResult<Message, Error, SendMessageInput>

useEditMessage(): UseMutationResult<Message, Error, { messageId: string; body: string }>

useDeleteMessage(): UseMutationResult<void, Error, { messageId: string }>

useMarkThreadRead(): UseMutationResult<void, Error, { threadId: string }>

useArchiveThread(): UseMutationResult<void, Error, { threadId: string; archived: boolean }>

useMuteThread(): UseMutationResult<void, Error, { threadId: string; muted: boolean }>

useThreadParticipants(threadId: string): UseQueryResult<Participant[]>
useAddParticipant(): UseMutationResult<Participant, Error, AddParticipantInput>
useRemoveParticipant(): UseMutationResult<void, Error, RemoveParticipantInput>

useUnreadCount(): UseQueryResult<{ total: number; byThread: Record<string, number> }>

useThreadRealtime(threadId: string): void   // side-effect hook; subscribes + updates query cache
useInboxRealtime(): void                     // subscribes to inbox:{profile_id}
useTypingIndicator(threadId: string): {
  typingUsers: Profile[]
  setTyping: (isTyping: boolean) => void
}

useQuickReplies(): UseQueryResult<QuickReply[]>
useUpsertQuickReply(): UseMutationResult<QuickReply, Error, UpsertQuickReplyInput>
useDeleteQuickReply(): UseMutationResult<void, Error, { id: string }>

useStartDirectThread(): UseMutationResult<Thread, Error, {
  counterpartProfileId: string
}>  // RPC: idempotent — returns existing direct thread or creates one

useStartProjectThread(): UseMutationResult<Thread, Error, { projectId: string }>
useStartVendorBrief(): UseMutationResult<Thread, Error, {
  vendorProfileId: string
  projectId: string
  initialMessage?: string
}>
```

### RPC

```sql
-- Idempotent: returns existing direct thread or creates one
CREATE FUNCTION rpc_start_direct_thread(counterpart UUID) RETURNS UUID ...;

-- Atomic: creates thread + participants + initial system message
CREATE FUNCTION rpc_start_vendor_brief(
  vendor UUID, project UUID, body TEXT
) RETURNS UUID ...;

-- Atomic mark-read: bumps last_read_at to now()
CREATE FUNCTION rpc_mark_thread_read(t UUID) RETURNS VOID ...;
```

### Edge Functions

| Function | Purpose |
|----------|---------|
| `comms-notification-dispatch` | Evaluates eligibility, calls `notify()`, applies coalescing window |
| `comms-attachment-upload` | Issues signed upload URLs to `message-attachments` bucket; validates mime/size before granting |
| `comms-vendor-email-gateway` (v1.1) | Resend inbound parsing for vendors replying by email pre-portal |

### Removed surfaces

The following are deleted as part of this work:
- `apps/designer-portal/src/app/api/comms/*` (six files)
- `apps/client-portal/src/app/api/comms/*` (six files)
- `apps/client-portal/src/lib/api-client.ts` `commsApi` block
- `commsApiUrl` from `apps/client-portal/src/lib/env.ts`
- `COMMS_SERVICE_URL` and `COMMS_API_URL` from every `.env.example`, deploy config, and `packages/api-routes/{EXAMPLES,MIGRATION_GUIDE,AGENT_3_DELIVERABLE,README}.md`

---

## 13. Permissions & RLS

### Role definitions

The system reuses existing `profiles.role` values: `super_admin`, `admin`, `designer`, `client`, `vendor`. Role on the participant row (`comms_thread_participants.role`) is independent and reflects the user's role *within that thread*.

### Permission matrix

| Action | Super Admin | Admin | Participant | Non-participant |
|--------|:---:|:---:|:---:|:---:|
| Read thread | ✓ | ✓ | ✓ | — |
| Read messages | ✓ | ✓ | ✓ | — |
| Send message | ✓ | ✓ | ✓ | — |
| Edit own message | ✓ | ✓ | ✓ (within 15 min) | — |
| Delete own message | ✓ | ✓ | ✓ | — |
| Edit/delete others' messages | ✓ | — | — | — |
| Add participant (project threads) | ✓ | ✓ | ✓ (designer-role only) | — |
| Remove participant | ✓ | ✓ | ✓ (designer-role only, except cannot remove client of own project) | — |
| Mute / archive | ✓ (own) | ✓ (own) | ✓ (own) | — |
| Audit / export | ✓ | ✓ | — | — |

### RLS sketch

```sql
ALTER TABLE comms_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE comms_thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE comms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE comms_quick_replies ENABLE ROW LEVEL SECURITY;

-- Threads: visible if you're a participant (or admin)
CREATE POLICY threads_read ON comms_threads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM comms_thread_participants p
      WHERE p.thread_id = comms_threads.id
        AND p.profile_id = auth.uid()
        AND p.left_at IS NULL
    )
    OR (auth.jwt() ->> 'role') IN ('super_admin','admin')
  );

-- Messages: visible if you can read the thread
CREATE POLICY messages_read ON comms_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM comms_thread_participants p
      WHERE p.thread_id = comms_messages.thread_id
        AND p.profile_id = auth.uid()
        AND p.left_at IS NULL
    )
    OR (auth.jwt() ->> 'role') IN ('super_admin','admin')
  );

-- Messages: insertable only into threads you participate in, only as yourself
CREATE POLICY messages_insert ON comms_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM comms_thread_participants p
      WHERE p.thread_id = comms_messages.thread_id
        AND p.profile_id = auth.uid()
        AND p.left_at IS NULL
    )
  );

-- Messages: editable only by sender within 15 minutes
CREATE POLICY messages_update_own ON comms_messages
  FOR UPDATE USING (
    sender_id = auth.uid()
    AND created_at > now() - interval '15 minutes'
  );

-- Participants: own row updatable (mute, archive, mark-read)
CREATE POLICY participants_update_own ON comms_thread_participants
  FOR UPDATE USING (profile_id = auth.uid());
```

Edge cases (non-participant reads for system surfaces like project Zone 11) are handled via security-definer RPCs that return only the count or last-message-preview without exposing message bodies.

---

## 14. Legacy Migration

Migration plan for `client_messages` (table from `00014`):

1. **Snapshot.** First migration of this PRD's series: do not modify `client_messages`. Add the new tables alongside.
2. **Backfill.** Second migration: for each unique `(sender_id, recipient_id)` pair, create one `comms_threads` row of `kind='direct'`, two `comms_thread_participants` rows, and one `comms_messages` row per legacy message. Preserve `created_at`, `read_at` (mapped to participant `last_read_at`), and `archived_by_*` (mapped to participant `archived_at`). Body and attachments map straight across.
3. **Dual-read window (one release).** New hooks read from `comms_*`; legacy hooks remain available but log a deprecation warning. Designer portal's `useClientMessages` is rewritten to call `useThreadMessages` of the relevant `direct` thread under the hood — same component contract, new data source.
4. **Deprecation.** Remove `useClientMessages` and `useSendClientMessage` from `@patina/supabase`.
5. **Drop.** Final migration: `DROP TABLE client_messages` once all dual-read traffic has stopped (verified by zero hits on the deprecation log for one full week).

`messages-panel.tsx` and `decision-comment-thread.tsx` get rewired during step 3.

---

## 15. Analytics & Telemetry

### PostHog events

| Event | Properties | Trigger |
|-------|------------|---------|
| `thread_opened` | `thread_id`, `kind`, `from` (`inbox`, `project_zone`, `notification`, `peek_panel`) | Thread detail mounts |
| `thread_message_sent` | `thread_id`, `kind`, `has_attachment`, `has_mention`, `decision_id?` | After successful insert |
| `thread_message_read` | `thread_id`, `messages_marked_read` | After `mark_thread_read` RPC |
| `thread_archived` / `thread_unarchived` | `thread_id` | Toggle |
| `thread_muted` / `thread_unmuted` | `thread_id` | Toggle |
| `quick_reply_used` | `quick_reply_id`, `thread_id` | Send |
| `mention_sent` | `thread_id`, `mention_count` | Send with mentions |
| `notification_email_sent_message` | `recipient_id`, `thread_id`, `is_mention` | Edge function dispatch |
| `notification_email_opened_message` | `recipient_id`, `thread_id` | Resend webhook |
| `notification_email_clicked_message` | `recipient_id`, `thread_id` | Resend webhook |

### Funnels

- Notification → open: `notification_email_sent_message` → `notification_email_clicked_message` → `thread_opened`.
- Decision response: `thread_opened` (with `decision_id` in cohort) → `decision_responded`.
- First-message activation (designer onboarding): `signup_complete` → first `thread_message_sent` within 7 days.

### Internal dashboard

A simple admin view at `/admin/comms/threads` (post-launch) showing thread count, message volume by day, average response time per designer (designer's first message after a client-sent message in the same thread).

---

## 16. Implementation Phases

This PRD is the deliverable for **Phase 0** of the prior planning conversation. Subsequent phases roughly follow:

| Phase | Scope | Dependency |
|-------|-------|------------|
| **1** | Schema migration (new tables, indexes, triggers) + RLS policies + RPCs | Phase 0 PRD approved |
| **2** | `@patina/supabase` hooks + types + realtime wiring | Phase 1 schema in dev |
| **3** | Client portal cutover (UI swap; remove proxy + commsApi) | Phase 2 hooks |
| **4** | Designer portal upgrade (inbox + nav entry + filter wiring + thread route) | Phase 2 hooks |
| **5** | Project Zone 11 + vendor brief + admin audit view | Phase 4 |
| **6** | `notify()` integration: edge function + email template + email-template wiring | Phase 1 schema |
| **7** | Legacy `client_messages` migration + decommission | Phase 4–6 stable |
| **1.1** | Reactions, digest mode, vendor inbound email gateway, global search | Post-launch |

Each phase ships behind an environment flag (`COMMS_NEW_SYSTEM_ENABLED`) so we can dark-launch the schema and dual-read until the UI is confidently swapped.

---

## 17. Success Criteria

### Launch checklist

- [ ] All `comms_*` migrations applied to staging and reset-tested locally.
- [ ] RLS policies verified with a participant matrix test (3 users × 3 thread kinds).
- [ ] `useThreads`, `useThreadMessages`, `useSendMessage` covered by integration tests against a real Supabase instance.
- [ ] Realtime delivery measured at < 1.5s p95 over 10k synthetic sends.
- [ ] `notify()` dispatch produces exactly one email per coalescing window in load-test.
- [ ] Designer portal `Messages` entry visible in nav, unread badge accurate.
- [ ] Client portal mobile + desktop flows pass manual QA on iOS Safari, Chrome, Firefox.
- [ ] Legacy `client_messages` backfill produces correct thread structure for top-100 designers.
- [ ] All `apps/*/src/app/api/comms/*` route files deleted.
- [ ] `COMMS_SERVICE_URL` / `COMMS_API_URL` removed from every `.env.example`, deploy config, and doc reference.
- [ ] Operations runbook section added to `docs/operations/`.
- [ ] PostHog events firing and visible in the funnel dashboard.

### Post-launch metrics (30-day)

- Round-trip latency p95 < 1.5s.
- Zero dropped messages between portals (parity check across `comms_messages` count vs. UI-acknowledged sends).
- Notification email open rate > 40%.
- Median designer response time within business hours < 4 hours.
- Zero RLS violations in audit log.

---

## 18. Resolved Decisions

Resolved 2026-04-29.

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Vendor identity**: pending profile placeholders. Create `profiles` rows for vendors at brief-creation time; vendor claims the account at first login and the existing `profile_id` is reused. | Unblocks the vendor brief flow before the vendor portal ships. Same `profile_id` survives the claim, so threads, mentions, and history persist. |
| 2 | **Attachment limits**: 25 MB / file, 4 / message. | Covers HEIC photos and PDFs comfortably. Storage cost scales linearly with limit; raising later is non-breaking. |
| 3 | **Edit window**: 15 minutes, symmetric across designer, client, vendor. | Single RLS policy. Asymmetric windows complicate the audit story without meaningful UX gain. |
| 4 | **Cross-thread search**: defer to v1.1. v1 is in-thread search only. | Postgres FTS over `comms_messages` is a single-migration follow-up; not worth slipping launch. |
| 5 | **Voice notes**: defer to post-iOS-companion. | Storage cost, transcription expectations, and accessibility burden don't carry their weight pre-companion. Native iOS recording will be the first natural surface. |
| 6 | **Read receipts**: hide in UI; track `last_read_at` server-side. | Privacy and response-pressure trade favors hiding. Server-side tracking means we can flip the toggle later with no schema work. |
| 7 | **Admin moderation**: read-only audit in v1; active moderation (suspend, lock) deferred. | Building moderation against hypothetical disputes typically produces the wrong tool. Revisit at first concrete case. |
| 8 | **iOS push**: deferred to the iOS companion phase. v1 is email + in-app realtime only. | APNs registration and device-token plumbing arrive with the companion app; `notify()` adds an `apns` channel handler then. |

### Implications baked into the spec

- §7.5 vendor brief flow assumes a `profile_id` exists for the vendor — the placeholder pattern from decision (1) creates one if needed before the brief is opened.
- §13 RLS `messages_update_own` policy uses `created_at > now() - interval '15 minutes'` for all roles per decision (3).
- §3 Non-Goals correctly excludes voice notes, global search, and `apns` push for v1 per decisions (4), (5), (8).
- §11 Notification channels remain `['email', 'in_app']` for v1 per decision (8).
- §13 Permission Matrix "Audit / export" row covers admin v1 capability per decision (7); active moderation rows are forward-looking and not implemented in v1.

---

## 19. Related Documentation

- **Email & Notification System PRD** (`docs/prds/patina-email-notification-prd.docx`) — defines `notify()`, preferences, channels, queue.
- **Communications Command Center PRD** (`docs/prds/communications-command-center-prd.md`) — admin marketing email orchestration. **Distinct system**; this PRD does not modify it.
- **Designer Portal MVP Additions Spec** (`docs/prds/Projects/patina-designer-portal-mvp-additions-spec.md`) — Zone 11 "Communications" requirement satisfied by §7.4.
- **Vendor Pipeline PRD** (`docs/prds/vendor-pipeline-prd.md`) — vendor brief flow consumes `kind='vendor_brief'` threads.
- **Email operations runbook** (`infra/runbooks/email-ops.md`) — operational context for `notify()` and Resend integration.
- **CLAUDE.md** — architectural directive: Supabase-native over new NestJS services.
