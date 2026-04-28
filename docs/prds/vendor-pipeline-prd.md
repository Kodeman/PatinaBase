# Vendor Pipeline Management — Implementation PRD

**For: Claude Code**
**Location: `apps/admin-portal/` in the strata monorepo**
**Version: 1.0 — April 2026**
**Status: Ready for implementation**

---

## Context

The Patina admin portal at `admin.patina.cloud` needs a vendor pipeline management system. This system tracks furniture manufacturers from discovery through onboarding to live partnership. It integrates with Claude Cowork (an external automation agent) via a shared Supabase database — Cowork writes task results, the portal reads and displays them. The portal also writes task requests that Cowork picks up.

The admin portal is a Next.js 15 App Router application using React 18, TypeScript, Tailwind CSS, and Supabase. It lives at `apps/admin-portal/` in the strata monorepo (pnpm workspaces + Turborepo). Shared types go in `packages/types/`.

### What exists today

The admin portal shell exists with basic auth (Supabase Auth, admin role check) and a placeholder dashboard. The Supabase project (`kv3qrinl`, dataset `production`) has existing tables for `users`, `products`, `style_profiles`, `rooms`, `interactions`, `designer_feedback`, `affiliate_feeds`, and `leads`. The vendor pipeline tables are **new** and do not exist yet.

### What this PRD adds

- 3 new Supabase tables: `vendors`, `vendor_scores`, `cowork_tasks`
- 6 new pages in the admin portal
- 7 new API routes (Next.js Server Actions)
- 12 new React components
- Row Level Security policies for admin-only access

---

## Database Schema

### Migration: `20260415_vendor_pipeline.sql`

Run via Supabase SQL editor or `supabase migration new vendor_pipeline`.

```sql
-- ============================================================
-- VENDORS TABLE
-- Core record for each manufacturer in the pipeline
-- ============================================================
CREATE TABLE public.vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    website_url TEXT,
    location_city VARCHAR(100),
    location_state VARCHAR(50),
    location_country VARCHAR(50) DEFAULT 'US',
    year_established INTEGER,
    
    -- Classification
    product_categories TEXT[] DEFAULT '{}',  -- e.g. {'seating', 'dining', 'storage'}
    price_range_low INTEGER,                 -- in dollars
    price_range_high INTEGER,                -- in dollars
    company_size VARCHAR(50),                -- 'solo', 'small', 'medium', 'large'
    
    -- Pipeline state
    stage VARCHAR(50) NOT NULL DEFAULT 'discovery',
    -- Valid stages: discovery, qualification, outreach, negotiation, onboarding, live, paused, rejected
    stage_changed_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Qualification
    total_score INTEGER,                     -- 0–500, computed from vendor_scores
    triage_level VARCHAR(20),                -- green, yellow, orange, red
    has_hard_veto BOOLEAN DEFAULT FALSE,
    veto_reason TEXT,
    
    -- Contacts
    primary_contact_name VARCHAR(255),
    primary_contact_email VARCHAR(255),
    primary_contact_phone VARCHAR(50),
    primary_contact_role VARCHAR(100),
    
    -- Trade relationship
    trade_account_status VARCHAR(50),        -- none, applied, approved, active
    trade_discount_pct DECIMAL(5,2),
    payment_terms VARCHAR(50),               -- cod, net_30, net_60
    drop_ship_capable BOOLEAN,
    
    -- Data & feed
    data_format VARCHAR(50),                 -- csv, api, pdf, manual, none
    feed_url TEXT,
    feed_frequency VARCHAR(50),              -- daily, weekly, monthly, manual
    last_feed_sync_at TIMESTAMPTZ,
    
    -- Ownership
    scored_by_kody BOOLEAN DEFAULT FALSE,
    scored_by_leah BOOLEAN DEFAULT FALSE,
    awaiting_leah_review BOOLEAN DEFAULT FALSE,
    
    -- Notes & metadata
    notes TEXT,
    leah_notes TEXT,
    source VARCHAR(100),                     -- how we found them: cowork_scan, leah_existing, manual, referral
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_vendors_stage ON public.vendors(stage);
CREATE INDEX idx_vendors_triage ON public.vendors(triage_level);
CREATE INDEX idx_vendors_score ON public.vendors(total_score DESC NULLS LAST);
CREATE INDEX idx_vendors_awaiting_leah ON public.vendors(awaiting_leah_review) WHERE awaiting_leah_review = TRUE;
CREATE INDEX idx_vendors_slug ON public.vendors(slug);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendors_updated_at
    BEFORE UPDATE ON public.vendors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- VENDOR SCORES TABLE
-- Individual rubric dimension scores per vendor
-- ============================================================
CREATE TABLE public.vendor_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    
    -- Dimension identification
    dimension INTEGER NOT NULL,              -- 1–8
    dimension_name VARCHAR(100) NOT NULL,
    weight INTEGER NOT NULL,                 -- multiplier (8, 10, 12, or 15)
    
    -- Scoring
    raw_score INTEGER CHECK (raw_score >= 1 AND raw_score <= 5),
    weighted_score INTEGER GENERATED ALWAYS AS (raw_score * weight) STORED,
    
    -- Attribution
    scored_by VARCHAR(50) NOT NULL,          -- 'cowork', 'kody', 'leah'
    scored_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Evidence & notes
    evidence TEXT,                           -- why this score
    data_sources TEXT[],                     -- URLs or file paths consulted
    
    CONSTRAINT unique_vendor_dimension UNIQUE(vendor_id, dimension)
);

CREATE INDEX idx_vendor_scores_vendor ON public.vendor_scores(vendor_id);


-- ============================================================
-- COWORK TASKS TABLE
-- Task queue shared between portal and Cowork
-- ============================================================
CREATE TABLE public.cowork_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Task definition
    task_type VARCHAR(100) NOT NULL,
    -- Valid types: prospect_scan, auto_score, generate_brief, draft_email,
    --             ingest_feed, normalize_data, image_audit, feed_sync, rescore
    
    -- Linking
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- Valid statuses: pending, picked_up, running, completed, failed, cancelled
    
    -- Payload
    input_payload JSONB DEFAULT '{}',        -- context sent to Cowork
    output_payload JSONB DEFAULT '{}',       -- results from Cowork
    output_files TEXT[],                     -- file paths Cowork wrote
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    picked_up_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Scheduling
    is_recurring BOOLEAN DEFAULT FALSE,
    cron_expression VARCHAR(100),            -- e.g. '0 6 * * 1' for Monday 6AM
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ
);

CREATE INDEX idx_cowork_tasks_status ON public.cowork_tasks(status);
CREATE INDEX idx_cowork_tasks_vendor ON public.cowork_tasks(vendor_id);
CREATE INDEX idx_cowork_tasks_type ON public.cowork_tasks(task_type);
CREATE INDEX idx_cowork_tasks_pending ON public.cowork_tasks(status, created_at)
    WHERE status = 'pending';


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cowork_tasks ENABLE ROW LEVEL SECURITY;

-- Admin-only policies (role = 'admin' in users table)
CREATE POLICY vendors_admin_all ON public.vendors
    FOR ALL USING (
        auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
    );

CREATE POLICY vendor_scores_admin_all ON public.vendor_scores
    FOR ALL USING (
        auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
    );

CREATE POLICY cowork_tasks_admin_all ON public.cowork_tasks
    FOR ALL USING (
        auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin')
    );

-- Service role bypass for Cowork (uses service_role key)
-- Cowork accesses Supabase with the service_role key, which bypasses RLS.
-- This is intentional — Cowork needs to read/write all pipeline data.
```

---

## TypeScript Types

### File: `packages/types/src/vendor-pipeline.ts`

```typescript
// ============================================================
// VENDOR PIPELINE TYPES
// Shared between admin-portal and any service reading pipeline data
// ============================================================

export type VendorStage =
  | 'discovery'
  | 'qualification'
  | 'outreach'
  | 'negotiation'
  | 'onboarding'
  | 'live'
  | 'paused'
  | 'rejected';

export type TriageLevel = 'green' | 'yellow' | 'orange' | 'red';

export type CoworkTaskType =
  | 'prospect_scan'
  | 'auto_score'
  | 'generate_brief'
  | 'draft_email'
  | 'ingest_feed'
  | 'normalize_data'
  | 'image_audit'
  | 'feed_sync'
  | 'rescore';

export type CoworkTaskStatus =
  | 'pending'
  | 'picked_up'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ScoreDimension = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type ScoredBy = 'cowork' | 'kody' | 'leah';

export interface Vendor {
  id: string;
  name: string;
  slug: string;
  website_url: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string;
  year_established: number | null;

  product_categories: string[];
  price_range_low: number | null;
  price_range_high: number | null;
  company_size: string | null;

  stage: VendorStage;
  stage_changed_at: string;

  total_score: number | null;
  triage_level: TriageLevel | null;
  has_hard_veto: boolean;
  veto_reason: string | null;

  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  primary_contact_role: string | null;

  trade_account_status: string | null;
  trade_discount_pct: number | null;
  payment_terms: string | null;
  drop_ship_capable: boolean | null;

  data_format: string | null;
  feed_url: string | null;
  feed_frequency: string | null;
  last_feed_sync_at: string | null;

  scored_by_kody: boolean;
  scored_by_leah: boolean;
  awaiting_leah_review: boolean;

  notes: string | null;
  leah_notes: string | null;
  source: string | null;

  created_at: string;
  updated_at: string;
}

export interface VendorScore {
  id: string;
  vendor_id: string;
  dimension: ScoreDimension;
  dimension_name: string;
  weight: number;
  raw_score: number | null;
  weighted_score: number | null;
  scored_by: ScoredBy;
  scored_at: string;
  evidence: string | null;
  data_sources: string[] | null;
}

export interface CoworkTask {
  id: string;
  task_type: CoworkTaskType;
  vendor_id: string | null;
  status: CoworkTaskStatus;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown>;
  output_files: string[] | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  picked_up_at: string | null;
  completed_at: string | null;
  is_recurring: boolean;
  cron_expression: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
}

// Derived types for UI
export interface VendorWithScores extends Vendor {
  scores: VendorScore[];
}

export interface VendorListItem extends Vendor {
  last_activity_description: string | null;
  last_activity_at: string | null;
  active_cowork_task: string | null;
  next_step: string | null;
  next_step_owner: 'kody' | 'leah' | 'cowork' | null;
}

export interface PipelineMetrics {
  total_vendors: number;
  by_triage: Record<TriageLevel, number>;
  by_stage: Record<VendorStage, number>;
  awaiting_leah: number;
  active_cowork_tasks: number;
  live_partners: number;
}

// Rubric dimension definitions (constant — matches the rubric document)
export const RUBRIC_DIMENSIONS: {
  dimension: ScoreDimension;
  name: string;
  weight: number;
  owner: 'kody' | 'leah';
}[] = [
  { dimension: 1, name: 'Drop-Ship Readiness', weight: 15, owner: 'kody' },
  { dimension: 2, name: 'Data Quality', weight: 15, owner: 'kody' },
  { dimension: 3, name: 'Margin Viability', weight: 15, owner: 'kody' },
  { dimension: 4, name: 'Channel Conflict', weight: 10, owner: 'kody' },
  { dimension: 5, name: 'Brand Alignment', weight: 12, owner: 'leah' },
  { dimension: 6, name: 'Category Coverage', weight: 10, owner: 'leah' },
  { dimension: 7, name: 'Sustainability & Craft', weight: 8, owner: 'leah' },
  { dimension: 8, name: 'Relationship Warmth', weight: 15, owner: 'leah' },
];

export const TRIAGE_THRESHOLDS = {
  green: 400,   // 400–500
  yellow: 300,  // 300–399
  orange: 200,  // 200–299
  red: 0,       // below 200
} as const;

export function computeTriageLevel(score: number): TriageLevel {
  if (score >= 400) return 'green';
  if (score >= 300) return 'yellow';
  if (score >= 200) return 'orange';
  return 'red';
}
```

---

## File Structure

```
apps/admin-portal/
├── src/
│   ├── app/
│   │   ├── layout.tsx                          # existing shell
│   │   ├── page.tsx                            # existing dashboard (update with pipeline summary)
│   │   ├── pipeline/
│   │   │   ├── page.tsx                        # Pipeline Dashboard (vendor table view)
│   │   │   ├── [slug]/
│   │   │   │   └── page.tsx                    # Vendor Detail view
│   │   │   ├── review/
│   │   │   │   └── page.tsx                    # Leah's Review interface
│   │   │   └── onboarding/
│   │   │       └── page.tsx                    # Onboarding tracker view
│   │   ├── cowork/
│   │   │   └── page.tsx                        # Cowork Task Queue view
│   │   └── feeds/
│   │       └── page.tsx                        # Feed Monitor view
│   │
│   ├── actions/
│   │   ├── vendors.ts                          # Server actions: CRUD vendors
│   │   ├── scores.ts                           # Server actions: score management
│   │   └── cowork-tasks.ts                     # Server actions: task queue management
│   │
│   ├── components/
│   │   ├── pipeline/
│   │   │   ├── pipeline-metrics.tsx            # Top-level metrics bar (5 numbers)
│   │   │   ├── vendor-table.tsx                # Sortable, filterable vendor table
│   │   │   ├── vendor-row.tsx                  # Single vendor row with score, stage, activity
│   │   │   ├── leah-queue-banner.tsx           # "Leah's Queue" callout banner
│   │   │   ├── stage-tag.tsx                   # Colored stage badge
│   │   │   └── score-badge.tsx                 # Triage-colored score display
│   │   ├── vendor-detail/
│   │   │   ├── vendor-header.tsx               # Name, location, stage, score
│   │   │   ├── rubric-grid.tsx                 # 8-dimension rubric visualization
│   │   │   ├── rubric-item.tsx                 # Single dimension with bar fill
│   │   │   ├── onboarding-phases.tsx           # 6-phase horizontal tracker
│   │   │   ├── cowork-activity-log.tsx         # Vertical timeline of Cowork actions
│   │   │   └── vendor-notes.tsx                # Editable notes field
│   │   ├── review/
│   │   │   ├── review-card.tsx                 # Full-width vendor review for Leah
│   │   │   └── dimension-slider.tsx            # 1–5 slider with Leah's vocabulary labels
│   │   ├── cowork/
│   │   │   ├── task-queue-table.tsx            # Task list with status
│   │   │   ├── task-row.tsx                    # Single task row
│   │   │   └── cowork-status-indicator.tsx     # Pulsing dot + label
│   │   └── shared/
│   │       ├── admin-sidebar.tsx               # Left nav (update with pipeline items)
│   │       └── cowork-trigger-button.tsx       # Button that writes a task to the queue
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                       # existing Supabase browser client
│   │   │   └── server.ts                       # existing Supabase server client
│   │   └── pipeline/
│   │       ├── queries.ts                      # Supabase query functions for pipeline data
│   │       └── mutations.ts                    # Supabase mutation functions
│   │
│   └── hooks/
│       ├── use-pipeline-metrics.ts             # SWR/React Query hook for dashboard metrics
│       ├── use-vendor-list.ts                  # Hook for filtered/sorted vendor list
│       └── use-cowork-poll.ts                  # 30-second polling for active task status
```

---

## Server Actions

### File: `src/actions/vendors.ts`

```typescript
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Vendor, VendorStage } from '@strata/types/vendor-pipeline';

export async function getVendors(filters?: {
  stage?: VendorStage;
  triage_level?: string;
  awaiting_leah?: boolean;
  sort_by?: 'total_score' | 'updated_at' | 'name' | 'stage';
  sort_dir?: 'asc' | 'desc';
}) {
  const supabase = await createServerClient();
  let query = supabase.from('vendors').select('*');

  if (filters?.stage) query = query.eq('stage', filters.stage);
  if (filters?.triage_level) query = query.eq('triage_level', filters.triage_level);
  if (filters?.awaiting_leah) query = query.eq('awaiting_leah_review', true);

  const sortCol = filters?.sort_by || 'total_score';
  const sortDir = filters?.sort_dir === 'asc';
  query = query.order(sortCol, { ascending: sortDir, nullsFirst: false });

  const { data, error } = await query;
  if (error) throw error;
  return data as Vendor[];
}

export async function getVendorBySlug(slug: string) {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('vendors')
    .select('*, vendor_scores(*)')
    .eq('slug', slug)
    .single();
  if (error) throw error;
  return data;
}

export async function createVendor(input: {
  name: string;
  website_url?: string;
  location_city?: string;
  location_state?: string;
  product_categories?: string[];
  source?: string;
  notes?: string;
}) {
  const supabase = await createServerClient();
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const { data, error } = await supabase.from('vendors').insert({
    ...input,
    slug,
    stage: 'discovery',
  }).select().single();

  if (error) throw error;
  revalidatePath('/pipeline');
  return data;
}

export async function updateVendor(id: string, updates: Partial<Vendor>) {
  const supabase = await createServerClient();
  const { error } = await supabase.from('vendors').update(updates).eq('id', id);
  if (error) throw error;
  revalidatePath('/pipeline');
}

export async function advanceVendorStage(id: string, newStage: VendorStage) {
  const supabase = await createServerClient();
  const { error } = await supabase.from('vendors').update({
    stage: newStage,
    stage_changed_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
  revalidatePath('/pipeline');
}
```

### File: `src/actions/scores.ts`

```typescript
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  RUBRIC_DIMENSIONS,
  computeTriageLevel,
  type ScoreDimension,
  type ScoredBy,
} from '@strata/types/vendor-pipeline';

export async function upsertScore(input: {
  vendor_id: string;
  dimension: ScoreDimension;
  raw_score: number;
  scored_by: ScoredBy;
  evidence?: string;
}) {
  const supabase = await createServerClient();
  const dim = RUBRIC_DIMENSIONS.find(d => d.dimension === input.dimension);
  if (!dim) throw new Error(`Invalid dimension: ${input.dimension}`);

  // Upsert the individual score
  const { error } = await supabase.from('vendor_scores').upsert({
    vendor_id: input.vendor_id,
    dimension: input.dimension,
    dimension_name: dim.name,
    weight: dim.weight,
    raw_score: input.raw_score,
    scored_by: input.scored_by,
    scored_at: new Date().toISOString(),
    evidence: input.evidence || null,
  }, { onConflict: 'vendor_id,dimension' });

  if (error) throw error;

  // Recompute total score on vendor
  await recomputeVendorScore(input.vendor_id);
  revalidatePath('/pipeline');
}

export async function recomputeVendorScore(vendorId: string) {
  const supabase = await createServerClient();

  const { data: scores } = await supabase
    .from('vendor_scores')
    .select('*')
    .eq('vendor_id', vendorId);

  if (!scores || scores.length === 0) return;

  const total = scores.reduce((sum, s) => sum + (s.weighted_score || 0), 0);
  const triage = computeTriageLevel(total);

  const kodyScoredDims = scores.filter(s => s.scored_by === 'cowork' || s.scored_by === 'kody');
  const leahScoredDims = scores.filter(s => s.scored_by === 'leah');

  await supabase.from('vendors').update({
    total_score: total,
    triage_level: triage,
    scored_by_kody: kodyScoredDims.length >= 4,
    scored_by_leah: leahScoredDims.length >= 4,
    awaiting_leah_review: kodyScoredDims.length >= 4 && leahScoredDims.length < 4,
  }).eq('id', vendorId);
}

export async function submitLeahReview(input: {
  vendor_id: string;
  scores: { dimension: ScoreDimension; raw_score: number; evidence?: string }[];
  leah_notes?: string;
}) {
  // Batch insert Leah's 4 dimension scores
  for (const score of input.scores) {
    await upsertScore({
      vendor_id: input.vendor_id,
      dimension: score.dimension,
      raw_score: score.raw_score,
      scored_by: 'leah',
      evidence: score.evidence,
    });
  }

  // Update Leah's notes
  const supabase = await createServerClient();
  await supabase.from('vendors').update({
    leah_notes: input.leah_notes,
    awaiting_leah_review: false,
  }).eq('id', input.vendor_id);

  revalidatePath('/pipeline');
  revalidatePath('/pipeline/review');
}
```

### File: `src/actions/cowork-tasks.ts`

```typescript
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { CoworkTaskType, CoworkTask } from '@strata/types/vendor-pipeline';

export async function createCoworkTask(input: {
  task_type: CoworkTaskType;
  vendor_id?: string;
  input_payload?: Record<string, unknown>;
}) {
  const supabase = await createServerClient();
  const { data, error } = await supabase.from('cowork_tasks').insert({
    task_type: input.task_type,
    vendor_id: input.vendor_id || null,
    input_payload: input.input_payload || {},
    status: 'pending',
  }).select().single();

  if (error) throw error;
  revalidatePath('/cowork');
  return data as CoworkTask;
}

export async function getCoworkTasks(filters?: {
  status?: string;
  vendor_id?: string;
  limit?: number;
}) {
  const supabase = await createServerClient();
  let query = supabase.from('cowork_tasks').select('*');

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.vendor_id) query = query.eq('vendor_id', filters.vendor_id);

  query = query.order('created_at', { ascending: false });
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data as CoworkTask[];
}

export async function getActiveTaskCount(): Promise<number> {
  const supabase = await createServerClient();
  const { count, error } = await supabase
    .from('cowork_tasks')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'picked_up', 'running']);
  if (error) throw error;
  return count || 0;
}

export async function cancelCoworkTask(taskId: string) {
  const supabase = await createServerClient();
  const { error } = await supabase.from('cowork_tasks')
    .update({ status: 'cancelled' })
    .eq('id', taskId)
    .in('status', ['pending']); // can only cancel pending tasks
  if (error) throw error;
  revalidatePath('/cowork');
}
```

---

## Polling Hook for Cowork Status

### File: `src/hooks/use-cowork-poll.ts`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import type { CoworkTask } from '@strata/types/vendor-pipeline';

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export function useCoworkPoll(vendorId?: string) {
  const [activeTasks, setActiveTasks] = useState<CoworkTask[]>([]);
  const [isPolling, setIsPolling] = useState(true);

  useEffect(() => {
    const supabase = createBrowserClient();

    async function poll() {
      let query = supabase
        .from('cowork_tasks')
        .select('*')
        .in('status', ['pending', 'picked_up', 'running'])
        .order('created_at', { ascending: false })
        .limit(20);

      if (vendorId) query = query.eq('vendor_id', vendorId);

      const { data } = await query;
      setActiveTasks((data as CoworkTask[]) || []);
    }

    poll(); // initial fetch
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [vendorId]);

  return { activeTasks, isPolling, taskCount: activeTasks.length };
}
```

---

## Page Specifications

### Page 1: Pipeline Dashboard (`/pipeline`)

**Purpose:** Show all vendors in a sortable, filterable table with triage-colored scores and pipeline stage indicators.

**Data requirements:**
- `getVendors()` with filter/sort params from URL search params
- `getPipelineMetrics()` — aggregate counts by triage and stage
- `getActiveTaskCount()` — for Cowork status indicator

**Layout:**
- Top bar: page title "Vendor Pipeline" (Playfair h2), vendor count + active task count (mono), Cowork status button, "+ Add Vendor" button
- Metrics row: 5 numbers — Green count, Yellow count, Watch List count, In Onboarding count, Live Partners count
- Leah's Queue banner (conditionally rendered when `awaiting_leah > 0`): clay accent, lists vendor names awaiting her review
- Vendor table: sortable columns — Vendor (name + location + categories + price range), Score (triage-colored Playfair numeral), Stage (colored tag), Last Activity (description + relative time), Cowork (status indicator), Next Step (text + owner color)
- Click any row → navigate to `/pipeline/[slug]`

**Acceptance criteria:**
- [ ] Table sorts by score (desc) by default
- [ ] Clicking column headers toggles sort
- [ ] Stage filter dropdown works (all / discovery / outreach / etc.)
- [ ] Triage filter works (all / green / yellow / orange / red)
- [ ] Leah queue banner only shows when vendors await review
- [ ] Cowork status indicator pulses when tasks are active
- [ ] "+ Add Vendor" opens a dialog/drawer with name, website, location, categories, source, notes
- [ ] New vendor saves to DB with stage='discovery' and appears in table

### Page 2: Vendor Detail (`/pipeline/[slug]`)

**Purpose:** Full vendor dossier — score, rubric breakdown, onboarding phase, Cowork activity log, notes.

**Data requirements:**
- `getVendorBySlug(slug)` — vendor + all scores
- `getCoworkTasks({ vendor_id })` — all tasks for this vendor (completed + active)

**Layout:**
- Header: vendor name (Playfair h2), location + est. year + categories (Inter body), stage tag, Cowork status
- Score block (right-aligned): total score (Playfair 3.5rem, triage-colored), triage label, "Qualification Score" mono label
- Rubric grid: 2-column grid, 8 items. Each shows dimension name, raw score (1–5), weight label, visual bar fill (green for Kody/Cowork scores, clay for Leah scores). Scored-by attribution in mono.
- Onboarding phases: horizontal 6-phase tracker (Discovery → Qualification → Outreach → Negotiation → Data Intake → Live). Current phase highlighted in clay, completed in green, future phases in pearl.
- Cowork Activity Log: vertical timeline with blue left border. Each entry: timestamp (mono), action description (Inter semibold), detail paragraph (Inter muted). Sorted newest-first.
- Notes: editable textarea with auto-save on blur. Separate fields for general notes and Leah's notes.

**Sidebar actions (vendor-specific):**
- "← Back to Pipeline" link
- "Re-score with Cowork" → creates `rescore` task
- "Generate Brief" → creates `generate_brief` task
- "Draft Outreach Email" → creates `draft_email` task
- "Begin Onboarding" → advances stage to `onboarding`, creates `ingest_feed` task
- "Advance Stage" dropdown → manual stage progression

**Acceptance criteria:**
- [ ] All 8 rubric dimensions render with correct weights
- [ ] Bar fill widths = (raw_score / 5) × 100%
- [ ] Unscored dimensions show empty state with "Awaiting score" text
- [ ] Cowork trigger buttons write tasks to the queue and show confirmation toast
- [ ] Notes auto-save on blur with optimistic UI update
- [ ] Onboarding phases accurately reflect current stage
- [ ] Activity log shows all completed + active Cowork tasks for this vendor

### Page 3: Leah's Review (`/pipeline/review`)

**Purpose:** Stripped-down interface for Leah to score dimensions 5–8 on vendors awaiting her review.

**Data requirements:**
- `getVendors({ awaiting_leah: true })` — only vendors needing her scores
- Vendor's existing scores (dimensions 1–4 visible as read-only context)

**Layout:**
- One vendor at a time, full-width
- Vendor brand info: name (Playfair h2), website link, location, categories, price range
- Existing scores section (read-only): dimensions 1–4 with Cowork's evidence notes
- Leah's scoring section: 4 slider inputs, one per dimension (5–8)
  - Dimension 5: "Brand Alignment" — labels: "Not Our World" (1) → "This Is Patina" (5)
  - Dimension 6: "Category Value" — labels: "Redundant" (1) → "Critical Gap" (5)
  - Dimension 7: "Sustainability & Craft" — labels: "No Story" (1) → "Founding Partner Material" (5)
  - Dimension 8: "Relationship Warmth" — labels: "Cold Outreach" (1) → "Existing Relationship" (5)
- Each slider has an optional text field for notes/evidence
- Leah notes textarea for general impressions
- "Submit & Next" button → saves scores, advances to next vendor
- Progress indicator: "3 of 7 vendors reviewed"

**Acceptance criteria:**
- [ ] Only shows vendors where `awaiting_leah_review = true`
- [ ] Sliders default to 3 (middle) and allow 1–5
- [ ] Submit writes all 4 scores via `submitLeahReview()`
- [ ] After submit, automatically loads the next vendor
- [ ] When no vendors remain, shows "All caught up" empty state
- [ ] Scores recompute vendor total and triage level on save
- [ ] Vendor's `awaiting_leah_review` flips to false on save

### Page 4: Cowork Task Queue (`/cowork`)

**Purpose:** System view of all Cowork tasks — running, scheduled, completed, failed.

**Data requirements:**
- `getCoworkTasks()` — all tasks, grouped by status

**Layout:**
- Three summary cards at top: "Running Now" (count + list), "Scheduled" (recurring tasks), "Last 24 Hours" (completed count + failure count)
- Task table: columns — Task Type, Linked Vendor (clickable), Status (colored), Created At, Duration (completed_at - created_at), Output
- Failed tasks highlighted with terracotta border and error message visible
- Cancel button on pending tasks

**Acceptance criteria:**
- [ ] Tasks grouped or filterable by status
- [ ] Linked vendor names are clickable → navigate to vendor detail
- [ ] Failed tasks show error_message text
- [ ] Cancel button only appears on pending status tasks
- [ ] Table auto-refreshes via polling hook

### Page 5: Feed Monitor (`/feeds`)

**Purpose:** Track ongoing vendor feed synchronization status for live partners.

**Data requirements:**
- `getVendors({ stage: 'live' })` — only live partners
- Their most recent `feed_sync` task from `cowork_tasks`

**Layout:**
- Table: Vendor Name, Data Format, Feed Frequency, Last Sync (timestamp), Sync Status (success/failed/running), Products Imported (from output_payload), Next Sync (from scheduled task)
- "Trigger Sync" button per vendor → creates `feed_sync` task

**Acceptance criteria:**
- [ ] Only shows vendors with stage = 'live'
- [ ] Last sync pulls from most recent completed `feed_sync` task
- [ ] Product count extracted from task's `output_payload.products_imported`
- [ ] "Trigger Sync" button creates task and shows running indicator

### Page 6: Add/Edit Vendor Dialog

**Purpose:** Modal form for creating a new vendor or editing an existing one.

**Fields:**
- Name (required, text)
- Website URL (optional, url)
- City (optional, text)
- State (optional, text)
- Product Categories (multi-select: seating, dining, tables, storage, lighting, bedroom, textiles, accessories, outdoor)
- Price Range Low (optional, number)
- Price Range High (optional, number)
- Source (select: cowork_scan, leah_existing, manual, referral)
- Notes (optional, textarea)

**Behavior:**
- On create: writes vendor with stage='discovery', then optionally triggers `auto_score` Cowork task
- On edit: updates vendor record, revalidates pipeline page
- Slug auto-generated from name on create, immutable on edit

**Acceptance criteria:**
- [ ] Name is required, shows validation error if empty
- [ ] Slug generated correctly (lowercase, hyphens, no special chars)
- [ ] After create, user is redirected to the new vendor's detail page
- [ ] "Auto-score with Cowork" checkbox on create dialog (default checked)

---

## Sidebar Navigation Update

Update `admin-sidebar.tsx` to include the pipeline navigation items. Structure:

```
Vendor Pipeline (collapsible, expanded by default)
  ├── Pipeline Dashboard     /pipeline         [badge: total vendor count]
  ├── Outreach Tracker       /pipeline?stage=outreach
  ├── Onboarding             /pipeline?stage=onboarding
  └── Feed Monitor           /feeds

Product Catalog (collapsible)
  ├── Intake Queue           /catalog/intake    [badge: pending count]
  ├── Data Quality           /catalog/quality
  └── Affiliate Feeds        /catalog/affiliates

Aesthete Engine (collapsible)
  ├── Style Taxonomy         /engine/taxonomy
  ├── Model Health           /engine/health
  └── Training Data          /engine/training

System (collapsible)
  ├── Cowork Tasks           /cowork            [dot indicator when tasks active]
  ├── Infrastructure         /system/infra
  └── Settings               /system/settings
```

---

## Design Tokens

Use Patina's established design system. No box-shadows on content. Type-weight hierarchy for visual structure. Strata Mark hairline dividers for section separation.

```typescript
// tailwind.config.ts extension for admin portal
const patinaColors = {
  'off-white': '#FAF7F2',
  'clay': '#C4A57B',
  'aged-oak': '#8B7355',
  'mocha': '#5C4A3C',
  'charcoal': '#2C2926',
  'sage': '#A8B5A0',
  'dusty-blue': '#8B9CAD',
  'terracotta': '#D4A090',
  'pearl': '#E5E2DD',
  'golden-hour': '#E8C547',
  'green-go': '#7A9E7E',
  'amber-wait': '#D4A84B',
  'red-stop': '#C47A6E',
};

// Font families — loaded via Google Fonts in layout.tsx
// Display: Playfair Display (scores, headings, page titles)
// Body: Inter (content, labels, buttons)
// Mono: DM Mono (metadata, timestamps, statuses)
```

**Component conventions:**
- Score numbers: `font-playfair text-[2.2rem] font-bold` + triage color
- Stage tags: `font-mono text-[0.6rem] uppercase tracking-wide px-2 py-0.5 rounded-sm` + stage-specific bg/text
- Cowork indicators: `font-mono text-[0.55rem] uppercase text-dusty-blue` with animated pulse dot
- Section dividers: 1px `border-pearl` — no card shadows, no bg containers
- Table rows: `border-b border-pearl/60 hover:bg-clay/[0.04]` — subtle, not card-like
- Leah's queue banner: `bg-clay/[0.06] border-l-3 border-clay` left-accent style

---

## Build Sequence

### Sprint 1 (Week 1–2): Data Layer + Pipeline Dashboard
1. Run database migration
2. Create TypeScript types package
3. Build server actions (vendors, scores, cowork-tasks)
4. Build Pipeline Dashboard page with vendor table
5. Build pipeline metrics component
6. Build add vendor dialog
7. Update sidebar navigation

### Sprint 2 (Week 3–4): Vendor Detail + Leah's Review
1. Build vendor detail page with rubric grid
2. Build onboarding phase tracker
3. Build Cowork activity log component
4. Build vendor notes (auto-save)
5. Build Leah's review page with sliders
6. Build Cowork trigger buttons (sidebar actions)

### Sprint 3 (Week 5–6): Cowork Integration + Task Queue
1. Build Cowork Task Queue page
2. Build polling hook for active task status
3. Connect trigger buttons to task creation
4. Build Cowork status indicator in sidebar
5. Build feed monitor page (basic)

### Sprint 4 (Week 7–8): Polish + Data Migration
1. Migrate existing Cowork folder data into Supabase
2. Test full flow: create vendor → auto-score → Leah review → outreach → onboarding
3. Add loading states, error boundaries, empty states
4. Mobile responsive pass on all pages
5. Deploy to admin.patina.cloud via Coolify

---

## Acceptance Criteria — Full System

- [ ] A new vendor can be created from the dashboard and appears in the table
- [ ] Cowork can write scores to `vendor_scores` via service_role key and they appear in the portal
- [ ] Leah's review page only shows vendors awaiting her input
- [ ] Submitting Leah's review recomputes the total score and triage level
- [ ] Cowork trigger buttons in vendor detail create tasks in the queue
- [ ] The task queue page shows all tasks with accurate statuses
- [ ] Polling hook updates active task count every 30 seconds without page reload
- [ ] Pipeline metrics accurately reflect current database state
- [ ] Vendor detail page loads in under 2 seconds on first visit
- [ ] All pages work on mobile viewports (sidebar collapses, table scrolls horizontally)
- [ ] No box-shadows on any content element (Patina design principle)
- [ ] Typography hierarchy uses Playfair for scores/headings, Inter for body, DM Mono for metadata

---

*Patina · admin.patina.cloud · Where Time Adds Value*
