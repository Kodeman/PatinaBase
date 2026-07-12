#!/usr/bin/env tsx
// Renders the 17 designer-onboarding email templates
// (packages/email/src/templates/*) to static HTML via @react-email/render
// and prints an idempotent `INSERT ... ON CONFLICT (slug) DO UPDATE` SQL
// statement, suitable for pasting straight into
// supabase/migrations/00293_seed_designer_onboarding_templates.sql.
//
// Run: pnpm --filter @patina/email render:onboarding-templates
//   (stdout carries ONLY the SQL — progress goes to stderr — so
//    `... > out.sql` is safe)
//
// Column shape verified against 00045_email_templates.sql (slug, name,
// description, category, subject_default, variables, is_active — category
// is the `email_template_category` enum: 'transactional' | 'engagement' |
// 'campaign' | 'sequence') + 00051_email_templates_html_content.sql
// (html_content TEXT NOT NULL DEFAULT ''). The
// `INSERT ... ON CONFLICT (slug) DO UPDATE` shape mirrors
// 00284_field_dispatch_wiring.sql's proven template-seed pattern.
//
// Copy revisions: re-run this script and ship the refreshed SQL as a NEW
// migration (00293 is a point-in-time snapshot, not a live template store —
// see that migration's header).

import * as React from 'react';
import { render } from '@react-email/render';

import { DesignerInvite } from '../src/templates/designer-invite';
import { DesignerInviteNudge1 } from '../src/templates/designer-invite-nudge-1';
import { DesignerInviteNudge2 } from '../src/templates/designer-invite-nudge-2';
import { DesignerWelcome } from '../src/templates/designer-welcome';
import { OnboardingDocumentModel } from '../src/templates/onboarding-document-model';
import { OnboardingCapture } from '../src/templates/onboarding-capture';
import { OnboardingLibrary } from '../src/templates/onboarding-library';
import { OnboardingDraftingRoom } from '../src/templates/onboarding-drafting-room';
import { OnboardingOpenRequests } from '../src/templates/onboarding-open-requests';
import { OnboardingHours } from '../src/templates/onboarding-hours';
import { OnboardingBooks } from '../src/templates/onboarding-books';
import { OnboardingAesthete } from '../src/templates/onboarding-aesthete';
import { OnboardingSixWeeks } from '../src/templates/onboarding-six-weeks';
import { MilestoneProposalSent } from '../src/templates/milestone-proposal-sent';
import { MilestoneProposalSigned } from '../src/templates/milestone-proposal-signed';
import { MilestoneRequestClaimed } from '../src/templates/milestone-request-claimed';
import { MilestoneFirstPayment } from '../src/templates/milestone-first-payment';

type Category = 'transactional' | 'sequence';

interface TemplateSpec {
  slug: string;
  name: string;
  description: string;
  category: Category;
  subject: string;
  variables: string[];
  Component: React.FC;
}

// Category per docs/marketing/founding-onboarding/copy-deck.md's own
// "track / category" line for each email — NOT the "9 spine emails" count
// in the wave brief (that undercounts by one; the deck lists 10
// track:spine/category:sequence emails: W0 + E2-E10).
const TEMPLATES: TemplateSpec[] = [
  // ── Invite track (T0/N1/N2) — transactional ──────────────────────────
  {
    slug: 'designer-invite',
    name: 'Designer Invite (T0)',
    description: 'Founding-designer invitation letter -- the first email in the invite track.',
    category: 'transactional',
    subject: 'An invitation to Patina',
    variables: ['first_name', 'personal_observation', 'action_link'],
    Component: DesignerInvite,
  },
  {
    slug: 'designer-invite-nudge-1',
    name: 'Designer Invite Nudge 1 (N1)',
    description: 'First invite-track nudge -- skipped once designer_first_signin has occurred.',
    category: 'transactional',
    subject: 'Holding your seat',
    variables: ['first_name', 'action_link'],
    Component: DesignerInviteNudge1,
  },
  {
    slug: 'designer-invite-nudge-2',
    name: 'Designer Invite Nudge 2 (N2)',
    description: 'Final invite-track nudge -- plain-text style, no header block, no button.',
    category: 'transactional',
    subject: 'Is the timing wrong?',
    variables: ['first_name'],
    Component: DesignerInviteNudge2,
  },
  // ── Spine (W0, E2-E10) — sequence ─────────────────────────────────────
  {
    slug: 'designer-welcome',
    name: 'Designer Welcome (W0)',
    description: 'First spine email -- sent first-sign-in + 2h.',
    category: 'sequence',
    subject: 'Your desk is ready',
    variables: ['first_name'],
    Component: DesignerWelcome,
  },
  {
    slug: 'onboarding-document-model',
    name: 'Onboarding: Document Model (E2)',
    description: 'Day-2 spine email -- the one-document idea. Skipped if project_created.',
    category: 'sequence',
    subject: 'One client, one document',
    variables: ['first_name'],
    Component: OnboardingDocumentModel,
  },
  {
    slug: 'onboarding-capture',
    name: 'Onboarding: Capture (E3)',
    description: 'Day-4 spine email -- clipper + Field capture. Skipped if first_capture.',
    category: 'sequence',
    subject: 'Your eye, everywhere',
    variables: ['first_name'],
    Component: OnboardingCapture,
  },
  {
    slug: 'onboarding-library',
    name: 'Onboarding: Library (E4)',
    description: 'Day-7 spine email -- the three shelves. Never skipped.',
    category: 'sequence',
    subject: 'Three shelves',
    variables: ['first_name'],
    Component: OnboardingLibrary,
  },
  {
    slug: 'onboarding-drafting-room',
    name: 'Onboarding: Drafting Room (E5)',
    description: 'Day-10 spine email -- boards to signed proposal. Skipped if proposal_sent.',
    category: 'sequence',
    subject: 'From shelf to proposal',
    variables: ['first_name'],
    Component: OnboardingDraftingRoom,
  },
  {
    slug: 'onboarding-open-requests',
    name: 'Onboarding: Open Requests (E6)',
    description: 'Day-14 spine email -- the design-request pool. Skipped if design_request_claimed.',
    category: 'sequence',
    subject: 'Work, waiting on the desk',
    variables: ['first_name'],
    Component: OnboardingOpenRequests,
  },
  {
    slug: 'onboarding-hours',
    name: 'Onboarding: Hours (E7)',
    description: 'Day-18 spine email -- the auto timer. Skipped if hours_logged.',
    category: 'sequence',
    subject: 'Hours that keep themselves',
    variables: ['first_name'],
    Component: OnboardingHours,
  },
  {
    slug: 'onboarding-books',
    name: 'Onboarding: Books (E8)',
    description: 'Day-24 spine email -- Accounts + Orders. Skipped if invoice_sent.',
    category: 'sequence',
    subject: 'The books, in order',
    variables: ['first_name'],
    Component: OnboardingBooks,
  },
  {
    slug: 'onboarding-aesthete',
    name: 'Onboarding: Aesthete (E9)',
    description: 'Day-30 spine email -- teaching Aesthete taste. Never skipped.',
    category: 'sequence',
    subject: 'Teach it your taste',
    variables: ['first_name'],
    Component: OnboardingAesthete,
  },
  {
    slug: 'onboarding-six-weeks',
    name: 'Onboarding: Six Weeks (E10)',
    description: 'Day-40 closing letter -- always sends, carries firsts_summary.',
    category: 'sequence',
    subject: 'Six weeks in',
    variables: ['first_name', 'firsts_summary'],
    Component: OnboardingSixWeeks,
  },
  // ── Milestones (M1-M4) — transactional ────────────────────────────────
  {
    slug: 'milestone-proposal-sent',
    name: 'Milestone: Proposal Sent (M1)',
    description: 'Fires once on the first proposal_sent engagement event.',
    category: 'transactional',
    subject: "It's in their hands now",
    variables: ['first_name', 'client_first_name'],
    Component: MilestoneProposalSent,
  },
  {
    slug: 'milestone-proposal-signed',
    name: 'Milestone: Proposal Signed (M2)',
    description: 'Fires once on the first proposal_signed engagement event.',
    category: 'transactional',
    subject: 'Signed.',
    variables: ['first_name', 'client_first_name'],
    Component: MilestoneProposalSigned,
  },
  {
    slug: 'milestone-request-claimed',
    name: 'Milestone: Request Claimed (M3)',
    description: 'Fires once on the first design_request_claimed engagement event.',
    category: 'transactional',
    subject: "It's yours",
    variables: ['first_name'],
    Component: MilestoneRequestClaimed,
  },
  {
    slug: 'milestone-first-payment',
    name: 'Milestone: First Payment (M4)',
    description: 'Fires once on the first payment_received engagement event.',
    category: 'transactional',
    subject: 'First money through the books',
    variables: ['first_name'],
    Component: MilestoneFirstPayment,
  },
];

// Dollar-quote tag. Guarded below so a rendered template can never silently
// break the SQL it's embedded in.
const DQ = '$html$';

function dollarQuote(value: string): string {
  if (value.includes(DQ)) {
    throw new Error(`Value contains the dollar-quote tag ${DQ} -- pick a different tag.`);
  }
  return `${DQ}${value}${DQ}`;
}

async function main() {
  const rows: string[] = [];

  for (const spec of TEMPLATES) {
    const html = await render(React.createElement(spec.Component), { pretty: false });
    const variablesJson = JSON.stringify(spec.variables);

    rows.push(
      `  (${dollarQuote(spec.slug)}, ${dollarQuote(spec.name)}, ${dollarQuote(spec.description)}, ` +
        `${dollarQuote(spec.category)}::email_template_category, ${dollarQuote(spec.subject)}, ` +
        `${dollarQuote(html)}, ${dollarQuote(variablesJson)}::jsonb, true)`
    );

    console.error(`[render-db-templates] rendered ${spec.slug} (${html.length} bytes)`);
  }

  const sql = `INSERT INTO public.email_templates
  (slug, name, description, category, subject_default, html_content, variables, is_active)
VALUES
${rows.join(',\n')}
ON CONFLICT (slug) DO UPDATE
  SET name            = EXCLUDED.name,
      description     = EXCLUDED.description,
      category        = EXCLUDED.category,
      subject_default = EXCLUDED.subject_default,
      html_content     = EXCLUDED.html_content,
      variables       = EXCLUDED.variables,
      is_active       = true,
      updated_at      = now();
`;

  process.stdout.write(sql);
  console.error(`\n[render-db-templates] done -- rendered ${TEMPLATES.length} templates.`);
}

main().catch((err) => {
  console.error('[render-db-templates] failed:', err);
  process.exit(1);
});
