'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Mail, UserPlus, Check, X, Archive } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  useApplication,
  useUpdateApplication,
} from '@/hooks/use-applications';
import type {
  ApplicationStatus,
  ApplicationType,
  DesignerApplication,
  MakerApplication,
} from '@/services/applications';
import { formatDate } from '@/lib/utils';
import { SendEmailDialog } from './SendEmailDialog';
import { OnboardApplicantDialog } from './OnboardApplicantDialog';

interface Props {
  type: ApplicationType;
  applicationId: string | null;
  onClose: () => void;
}

export function ApplicationDetailDrawer({ type, applicationId, onClose }: Props) {
  const { data, isLoading } = useApplication(type, applicationId);
  const [emailOpen, setEmailOpen] = useState(false);
  const [onboardOpen, setOnboardOpen] = useState(false);

  return (
    <Sheet open={!!applicationId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {isLoading || !data ? (
          <div className="py-12 text-center text-muted-foreground">Loading…</div>
        ) : (
          <>
            <DrawerBody
              type={type}
              application={data.application as any}
              communications={data.communications}
              onSendEmail={() => setEmailOpen(true)}
              onOnboard={() => setOnboardOpen(true)}
            />

            <SendEmailDialog
              open={emailOpen}
              onOpenChange={setEmailOpen}
              type={type}
              application={data.application as any}
            />
            <OnboardApplicantDialog
              open={onboardOpen}
              onOpenChange={setOnboardOpen}
              type={type}
              application={data.application as any}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  type,
  application,
  communications,
  onSendEmail,
  onOnboard,
}: {
  type: ApplicationType;
  application: DesignerApplication | MakerApplication;
  communications: Array<{
    id: string;
    subject: string;
    status: string;
    created_at: string;
    to_email: string;
  }>;
  onSendEmail: () => void;
  onOnboard: () => void;
}) {
  const update = useUpdateApplication(type);
  const [notes, setNotes] = useState(application.review_notes ?? '');

  useEffect(() => {
    setNotes(application.review_notes ?? '');
  }, [application.id, application.review_notes]);

  const isDesigner = type === 'designer';
  const designer = application as DesignerApplication;
  const maker = application as MakerApplication;

  const headerName = isDesigner
    ? [designer.first_name, designer.last_name].filter(Boolean).join(' ')
    : maker.brand_name;
  const headerSub = isDesigner ? designer.company ?? designer.email : maker.contact_name;

  const handleStatus = (status: ApplicationStatus) => {
    update.mutate(
      { id: application.id, status },
      {
        onSuccess: () => toast.success(`Marked as ${status.replace('_', ' ')}`),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Update failed'),
      },
    );
  };

  const handleSaveNotes = () => {
    update.mutate(
      { id: application.id, reviewNotes: notes },
      {
        onSuccess: () => toast.success('Notes saved'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed'),
      },
    );
  };

  const alreadyOnboarded = !!application.auth_user_id;

  return (
    <>
      <SheetHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <SheetTitle className="truncate">{headerName || 'Applicant'}</SheetTitle>
            <SheetDescription className="truncate">{headerSub}</SheetDescription>
          </div>
          <Badge variant={statusVariant(application.status)}>
            {application.status.replace('_', ' ')}
          </Badge>
        </div>
      </SheetHeader>

      <div className="mt-6 space-y-6">
        <section className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Detail label="Email" value={application.email} copy />
          <Detail label="Submitted" value={formatDate(application.created_at)} />
          {isDesigner ? (
            <>
              <Detail label="First name" value={designer.first_name} />
              <Detail label="Last name" value={designer.last_name} />
              <Detail label="Company" value={designer.company ?? '—'} />
              <Detail label="Website" value={designer.website ?? '—'} link={designer.website} />
            </>
          ) : (
            <>
              <Detail label="Brand" value={maker.brand_name} />
              <Detail label="Contact" value={maker.contact_name} />
              <Detail label="Website" value={maker.website ?? '—'} link={maker.website} />
              <Detail label="Referral" value={maker.referral_source ?? '—'} />
            </>
          )}
          {isDesigner && designer.referral_source && (
            <Detail label="Referral" value={designer.referral_source} />
          )}
        </section>

        {isDesigner && designer.motivation && (
          <Block label="Motivation">{designer.motivation}</Block>
        )}
        {!isDesigner && maker.description && (
          <Block label="About the workshop">{maker.description}</Block>
        )}

        <Separator />

        <section>
          <h3 className="text-sm font-medium mb-2">Decision</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={update.isPending || application.status === 'in_review'}
              onClick={() => handleStatus('in_review')}
            >
              Move to review
            </Button>
            <Button
              size="sm"
              disabled={update.isPending || application.status === 'approved'}
              onClick={() => handleStatus('approved')}
            >
              <Check className="h-4 w-4 mr-1" /> Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={update.isPending || application.status === 'rejected'}
              onClick={() => handleStatus('rejected')}
            >
              <X className="h-4 w-4 mr-1" /> Reject
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={update.isPending || application.status === 'archived'}
              onClick={() => handleStatus('archived')}
            >
              <Archive className="h-4 w-4 mr-1" /> Archive
            </Button>
          </div>
          {application.reviewed_at && (
            <p className="mt-2 text-xs text-muted-foreground">
              Last reviewed {formatDate(application.reviewed_at)}
            </p>
          )}
        </section>

        <section>
          <h3 className="text-sm font-medium mb-2">Internal notes</h3>
          <Textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Visible to admins only"
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={update.isPending || notes === (application.review_notes ?? '')}
              onClick={handleSaveNotes}
            >
              Save notes
            </Button>
          </div>
        </section>

        <Separator />

        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Communications</h3>
            <Button size="sm" variant="outline" onClick={onSendEmail}>
              <Mail className="h-4 w-4 mr-1" /> Send email
            </Button>
          </div>
          {communications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No emails sent yet.</p>
          ) : (
            <ul className="space-y-2">
              {communications.map((c) => (
                <li key={c.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{c.subject}</span>
                    <Badge variant={c.status === 'sent' ? 'success' : 'destructive'}>
                      {c.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    to {c.to_email} · {formatDate(c.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Separator />

        <section>
          <h3 className="text-sm font-medium mb-2">Onboarding</h3>
          {alreadyOnboarded ? (
            <p className="text-sm text-muted-foreground">
              Account created {application.converted_at ? formatDate(application.converted_at) : ''} ·
              user id {application.auth_user_id?.slice(0, 8)}…
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Create a user account and send an invitation email. Designers receive the
                <code className="mx-1 text-xs">independent_designer</code> role; makers receive
                <code className="mx-1 text-xs">brand_admin</code>.
              </p>
              <Button size="sm" onClick={onOnboard} disabled={application.status !== 'approved'}>
                <UserPlus className="h-4 w-4 mr-1" /> Create account & invite
              </Button>
              {application.status !== 'approved' && (
                <p className="text-xs text-muted-foreground">
                  Approve the application first to enable onboarding.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Detail({
  label,
  value,
  link,
  copy,
}: {
  label: string;
  value: string;
  link?: string | null;
  copy?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium break-all flex items-center gap-1">
        {link ? (
          <a
            href={link.startsWith('http') ? link : `https://${link}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
          >
            {value}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <span>{value}</span>
        )}
        {copy && (
          <button
            className="ml-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              navigator.clipboard.writeText(value);
              toast.success('Copied');
            }}
            aria-label={`Copy ${label}`}
          >
            copy
          </button>
        )}
      </div>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <p className="text-sm whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function statusVariant(status: ApplicationStatus): 'default' | 'success' | 'destructive' | 'warning' | 'secondary' {
  switch (status) {
    case 'approved':
      return 'success';
    case 'rejected':
      return 'destructive';
    case 'in_review':
      return 'warning';
    case 'archived':
      return 'secondary';
    default:
      return 'default';
  }
}
