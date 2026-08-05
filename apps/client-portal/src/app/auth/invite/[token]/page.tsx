import Link from 'next/link';

import { createAdminClient } from '@patina/supabase/client';

import { AcceptInviteForm } from '@/components/auth/AcceptInviteForm';
import { ClientAuthShell } from '@/components/auth/ClientAuthShell';

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

interface InviteRow {
  id: string;
  token: string;
  email: string;
  designer_id: string;
  project_id: string | null;
  personal_message: string | null;
  expires_at: string;
  accepted_at: string | null;
}

interface DesignerRow {
  id: string;
  full_name: string | null;
  business_name: string | null;
}

interface ProjectRow {
  id: string;
  name: string | null;
}

async function loadInvite(token: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: invite } = await admin
    .from('client_invitations')
    .select(
      'id, token, email, designer_id, project_id, personal_message, expires_at, accepted_at',
    )
    .eq('token', token)
    .maybeSingle();

  if (!invite) return null;

  const row = invite as InviteRow;

  let designer: DesignerRow | null = null;
  let project: ProjectRow | null = null;

  if (row.designer_id) {
    const { data } = await admin
      .from('profiles')
      .select('id, full_name, business_name')
      .eq('id', row.designer_id)
      .maybeSingle();
    designer = (data as DesignerRow) ?? null;
  }
  if (row.project_id) {
    const { data } = await admin
      .from('projects')
      .select('id, name')
      .eq('id', row.project_id)
      .maybeSingle();
    project = (data as ProjectRow) ?? null;
  }

  return { row, designer, project };
}

function ErrorShell({ title, body }: { title: string; body: string }) {
  return (
    <ClientAuthShell title={title} description={body}>
      <Link
        href="/auth/signin"
        className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
      >
        Sign in instead
      </Link>
    </ClientAuthShell>
  );
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

  const result = await loadInvite(token);

  if (!result) {
    return (
      <ErrorShell
        title="Invitation not found"
        body="We couldn't find this invitation. It may have already been used or revoked."
      />
    );
  }

  const { row, designer, project } = result;

  if (row.accepted_at) {
    return (
      <ErrorShell
        title="Already accepted"
        body="This invitation has already been used. You can sign in below."
      />
    );
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return (
      <ErrorShell
        title="Invitation expired"
        body="This invitation has expired. Please ask your designer to send a new one."
      />
    );
  }

  const designerName =
    designer?.full_name?.trim() ||
    designer?.business_name?.trim() ||
    'Your designer';
  const projectName = project?.name ?? null;

  return (
    <ClientAuthShell
      title="Welcome to Patina."
      description={`${designerName} invited you to collaborate${projectName ? ` on “${projectName}”` : ''}.`}
    >
      {row.personal_message ? (
        <blockquote className="mb-6 border-l-2 border-[#8FA18B] bg-[#f3f0e8] px-4 py-3 text-sm leading-6 text-[#252a25]">
          {row.personal_message}
        </blockquote>
      ) : null}
      <div>
        <AcceptInviteForm email={row.email} token={row.token} />
      </div>
    </ClientAuthShell>
  );
}
