'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { WaitlistEntry } from '@/services/waitlist';

interface WaitlistDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: WaitlistEntry | null;
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%] break-all">{value}</span>
    </div>
  );
}

export function WaitlistDetailDialog({ open, onOpenChange, entry }: WaitlistDetailDialogProps) {
  if (!entry) return null;

  const isConverted = !!entry.convertedAt;

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Waitlist Entry Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Core Info */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Contact</h4>
            <DetailRow label="Email" value={entry.email} />
            <div className="flex justify-between py-1.5">
              <span className="text-sm text-muted-foreground">Role</span>
              <Badge variant="outline">{entry.role}</Badge>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-sm text-muted-foreground">Source</span>
              <Badge variant="secondary">{entry.source}</Badge>
            </div>
          </div>

          <Separator />

          {/* UTM Attribution */}
          {(entry.utmSource || entry.utmMedium || entry.utmCampaign) && (
            <>
              <div>
                <h4 className="text-sm font-semibold mb-2">UTM Attribution</h4>
                <DetailRow label="Source" value={entry.utmSource} />
                <DetailRow label="Medium" value={entry.utmMedium} />
                <DetailRow label="Campaign" value={entry.utmCampaign} />
                <DetailRow label="Content" value={entry.utmContent} />
                <DetailRow label="Term" value={entry.utmTerm} />
              </div>
              <Separator />
            </>
          )}

          {/* Behavioral Context */}
          {(entry.referrer || entry.signupPage || entry.ctaText) && (
            <>
              <div>
                <h4 className="text-sm font-semibold mb-2">Behavioral Context</h4>
                <DetailRow label="Referrer" value={entry.referrer} />
                <DetailRow label="Signup Page" value={entry.signupPage} />
                <DetailRow label="CTA Text" value={entry.ctaText} />
              </div>
              <Separator />
            </>
          )}

          {/* Timestamps & Conversion */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Timeline</h4>
            <DetailRow label="Signed Up" value={formatDate(entry.createdAt)} />
            {isConverted && entry.convertedAt && (
              <DetailRow label="Converted" value={formatDate(entry.convertedAt)} />
            )}
            <div className="flex justify-between py-1.5">
              <span className="text-sm text-muted-foreground">Status</span>
              {isConverted ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  Converted
                </Badge>
              ) : (
                <Badge variant="outline">Pending</Badge>
              )}
            </div>
            {isConverted && entry.authUserId && (
              <div className="flex justify-between py-1.5">
                <span className="text-sm text-muted-foreground">User Profile</span>
                <Link
                  href={`/users/${entry.authUserId}`}
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                >
                  View User <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
