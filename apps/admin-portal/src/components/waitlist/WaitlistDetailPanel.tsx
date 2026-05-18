'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ActivityTimeline } from './ActivityTimeline';
import { TaskList } from './TaskList';
import {
  useUpdateWaitlistEntry,
  useWaitlistEntry,
} from '@/hooks/use-waitlist';
import { usersService } from '@/services/users';
import { toast } from 'sonner';
import type { QualificationStage, WaitlistEntry } from '@/services/waitlist';

const STAGE_OPTIONS: { value: QualificationStage; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'nurture', label: 'Nurture' },
  { value: 'converted', label: 'Converted' },
  { value: 'disqualified', label: 'Disqualified' },
];

const UNASSIGNED_VALUE = '__unassigned__';

function toLocalDateTimeInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDateTimeInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

interface WaitlistDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: string | null;
  onRequestConvert: (entry: WaitlistEntry) => void;
}

export function WaitlistDetailPanel({
  open,
  onOpenChange,
  entryId,
  onRequestConvert,
}: WaitlistDetailPanelProps) {
  const { data: entry } = useWaitlistEntry(open ? entryId : null);
  const updateEntry = useUpdateWaitlistEntry();

  const { data: admins } = useQuery({
    queryKey: ['admin-users-for-assignment'],
    queryFn: () => usersService.getUsers({ role: 'admin', pageSize: 100 }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // Local editable mirrors for fields that should debounce on blur
  const [notes, setNotes] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [disqualifiedReason, setDisqualifiedReason] = useState('');

  useEffect(() => {
    if (!entry) return;
    setNotes(entry.notes ?? '');
    setFullName(entry.fullName ?? '');
    setCompanyName(entry.companyName ?? '');
    setPhone(entry.phone ?? '');
    setFollowUp(toLocalDateTimeInputValue(entry.nextFollowUpAt));
    setDisqualifiedReason(entry.disqualifiedReason ?? '');
  }, [entry]);

  const patch = (fields: Parameters<typeof updateEntry.mutateAsync>[0]['patch'], successMessage?: string) => {
    if (!entry) return;
    updateEntry.mutate(
      { id: entry.id, patch: fields },
      {
        onSuccess: () => {
          if (successMessage) toast.success(successMessage);
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  };

  const isPanelLoading = open && entryId && !entry;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl" side="right">
        {isPanelLoading || !entry ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading prospect…
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-3 border-b border-[var(--border-default)] p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="break-all text-base">{entry.email}</SheetTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{entry.role}</Badge>
                    <Badge variant="secondary">{entry.source}</Badge>
                    {entry.utmCampaign && (
                      <Badge variant="secondary">campaign: {entry.utmCampaign}</Badge>
                    )}
                  </div>
                  {(entry.fullName || entry.companyName) && (
                    <div className="mt-2 text-sm text-[var(--text-secondary)]">
                      {entry.fullName}
                      {entry.fullName && entry.companyName ? ' · ' : ''}
                      {entry.companyName}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Stage</Label>
                  <Select
                    value={entry.qualificationStage}
                    onValueChange={(v) =>
                      patch({ qualificationStage: v as QualificationStage }, 'Stage updated')
                    }
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGE_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Owner</Label>
                  <Select
                    value={entry.assignedAdminId ?? UNASSIGNED_VALUE}
                    onValueChange={(v) =>
                      patch(
                        { assignedAdminId: v === UNASSIGNED_VALUE ? null : v },
                        'Owner updated',
                      )
                    }
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                      {(admins?.data ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.displayName || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SheetHeader>

            <Tabs defaultValue="overview" className="flex flex-1 min-h-0 flex-col">
              <TabsList className="mx-6 mt-4 w-fit">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                <TabsContent value="overview" className="mt-0 space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="full_name" className="text-xs">Full name</Label>
                      <Input
                        id="full_name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        onBlur={() => {
                          if ((entry.fullName ?? '') !== fullName) {
                            patch({ fullName: fullName || null });
                          }
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="company_name" className="text-xs">Company</Label>
                      <Input
                        id="company_name"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        onBlur={() => {
                          if ((entry.companyName ?? '') !== companyName) {
                            patch({ companyName: companyName || null });
                          }
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone" className="text-xs">Phone</Label>
                      <Input
                        id="phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onBlur={() => {
                          if ((entry.phone ?? '') !== phone) {
                            patch({ phone: phone || null });
                          }
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="follow_up" className="text-xs">Next follow-up</Label>
                      <Input
                        id="follow_up"
                        type="datetime-local"
                        value={followUp}
                        onChange={(e) => setFollowUp(e.target.value)}
                        onBlur={() => {
                          const iso = fromLocalDateTimeInputValue(followUp);
                          if ((entry.nextFollowUpAt ?? null) !== iso) {
                            patch({ nextFollowUpAt: iso });
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="notes" className="text-xs">Notes</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      onBlur={() => {
                        if ((entry.notes ?? '') !== notes) {
                          patch({ notes: notes || null });
                        }
                      }}
                      rows={4}
                      placeholder="Internal summary — qualification rationale, scope, budget hints…"
                    />
                  </div>

                  {entry.qualificationStage === 'disqualified' && (
                    <div>
                      <Label htmlFor="dq_reason" className="text-xs">Disqualified reason</Label>
                      <Input
                        id="dq_reason"
                        value={disqualifiedReason}
                        onChange={(e) => setDisqualifiedReason(e.target.value)}
                        onBlur={() => {
                          if ((entry.disqualifiedReason ?? '') !== disqualifiedReason) {
                            patch({ disqualifiedReason: disqualifiedReason || null });
                          }
                        }}
                      />
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-2 text-sm">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Attribution
                    </h4>
                    {entry.utmSource && (
                      <Row label="UTM source" value={entry.utmSource} />
                    )}
                    {entry.utmMedium && (
                      <Row label="UTM medium" value={entry.utmMedium} />
                    )}
                    {entry.utmCampaign && (
                      <Row label="UTM campaign" value={entry.utmCampaign} />
                    )}
                    {entry.referrer && <Row label="Referrer" value={entry.referrer} />}
                    {entry.signupPage && <Row label="Signup page" value={entry.signupPage} />}
                    {entry.ctaText && <Row label="CTA" value={entry.ctaText} />}
                    <Row
                      label="Signed up"
                      value={new Date(entry.createdAt).toLocaleString('en-US')}
                    />
                    {entry.lastContactedAt && (
                      <Row
                        label="Last contacted"
                        value={new Date(entry.lastContactedAt).toLocaleString('en-US')}
                      />
                    )}
                    {entry.authUserId && (
                      <div className="flex justify-between py-1.5">
                        <span className="text-sm text-muted-foreground">User profile</span>
                        <Link
                          href={`/users/${entry.authUserId}`}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          View user <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="activity" className="mt-0">
                  <ActivityTimeline waitlistId={entry.id} />
                </TabsContent>

                <TabsContent value="tasks" className="mt-0">
                  <TaskList waitlistId={entry.id} />
                </TabsContent>
              </div>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  patch(
                    {
                      qualificationStage: 'contacted',
                      lastContactedAt: new Date().toISOString(),
                    },
                    'Marked contacted',
                  )
                }
                disabled={entry.qualificationStage === 'contacted'}
              >
                Mark contacted
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => patch({ qualificationStage: 'qualified' }, 'Marked qualified')}
                disabled={entry.qualificationStage === 'qualified'}
              >
                Mark qualified
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => patch({ qualificationStage: 'disqualified' }, 'Disqualified')}
                disabled={entry.qualificationStage === 'disqualified'}
              >
                Disqualify
              </Button>
              <div className="ml-auto">
                {!entry.convertedAt && (
                  <Button size="sm" onClick={() => onRequestConvert(entry)}>
                    Convert to user
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="max-w-[60%] break-all text-right text-sm font-medium">{value}</span>
    </div>
  );
}
