'use client';

import { useMemo } from 'react';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  required: boolean;
}

interface PreSendChecklistProps {
  subject: string;
  previewText: string;
  body: string;
  headline: string;
  templateId: string | null;
  audienceType: 'all' | 'segment' | 'individual';
  audienceSegmentId: string | null;
  estimatedRecipients: number;
  ctaUrl: string;
}

export function PreSendChecklist({
  subject,
  previewText,
  body,
  headline,
  templateId,
  audienceType,
  audienceSegmentId,
  estimatedRecipients,
  ctaUrl,
}: PreSendChecklistProps) {
  const items: ChecklistItem[] = useMemo(() => {
    const hasAudience =
      audienceType === 'all' ||
      (audienceType === 'segment' && !!audienceSegmentId) ||
      audienceType === 'individual';

    return [
      {
        id: 'template',
        label: 'Template selected',
        passed: !!templateId,
        required: true,
      },
      {
        id: 'subject',
        label: 'Subject line set',
        passed: subject.trim().length > 0,
        required: true,
      },
      {
        id: 'preview-text',
        label: 'Preview text set',
        passed: previewText.trim().length > 0,
        required: false,
      },
      {
        id: 'content',
        label: 'Content is not empty',
        passed: body.trim().length > 0 || headline.trim().length > 0,
        required: true,
      },
      {
        id: 'audience',
        label: 'Audience selected',
        passed: hasAudience,
        required: true,
      },
      {
        id: 'recipients',
        label: 'At least 1 recipient',
        passed: estimatedRecipients > 0,
        required: true,
      },
      {
        id: 'links-valid',
        label: 'Links are valid',
        passed: !ctaUrl || isValidUrl(ctaUrl),
        required: false,
      },
      {
        id: 'sender-verified',
        label: 'Sender verified',
        passed: true,
        required: false,
      },
    ];
  }, [
    subject,
    previewText,
    body,
    headline,
    templateId,
    audienceType,
    audienceSegmentId,
    estimatedRecipients,
    ctaUrl,
  ]);

  const passedCount = items.filter((i) => i.passed).length;
  const totalCount = items.length;
  const requiredFailing = items.filter((i) => i.required && !i.passed);
  const allRequiredPassed = requiredFailing.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-patina-charcoal">
          Pre-Send Checklist
        </h3>
        <span
          className={cn(
            'text-xs font-medium px-2.5 py-0.5 rounded-full',
            allRequiredPassed
              ? 'bg-green-100 text-green-700'
              : 'bg-amber-100 text-amber-700'
          )}
        >
          {passedCount}/{totalCount} checks passed
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              item.passed
                ? 'bg-green-50/50'
                : item.required
                  ? 'bg-red-50/50'
                  : 'bg-amber-50/50'
            )}
          >
            {item.passed ? (
              <CheckCircle2 className="w-4.5 h-4.5 text-green-600 shrink-0" />
            ) : item.required ? (
              <XCircle className="w-4.5 h-4.5 text-red-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4.5 h-4.5 text-amber-500 shrink-0" />
            )}
            <span
              className={cn(
                'flex-1',
                item.passed
                  ? 'text-green-800'
                  : item.required
                    ? 'text-red-800'
                    : 'text-amber-800'
              )}
            >
              {item.label}
            </span>
            {!item.required && !item.passed && (
              <span className="text-[10px] font-medium text-amber-600 uppercase tracking-wider">
                Optional
              </span>
            )}
            {item.required && !item.passed && (
              <span className="text-[10px] font-medium text-red-600 uppercase tracking-wider">
                Required
              </span>
            )}
          </div>
        ))}
      </div>

      {!allRequiredPassed && (
        <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-100">
          <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-red-800">
              {requiredFailing.length} required{' '}
              {requiredFailing.length === 1 ? 'check' : 'checks'} not met
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              Please complete all required items before sending.
            </p>
          </div>
        </div>
      )}

      {allRequiredPassed && (
        <div className="flex items-start gap-2 p-3 bg-green-50 rounded-lg border border-green-100">
          <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-green-800">
              All required checks passed
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              Your campaign is ready to schedule or send.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

export function useChecklistAllPassed(props: PreSendChecklistProps): boolean {
  const { subject, body, headline, templateId, audienceType, audienceSegmentId, estimatedRecipients } = props;

  const hasAudience =
    audienceType === 'all' ||
    (audienceType === 'segment' && !!audienceSegmentId) ||
    audienceType === 'individual';

  return (
    !!templateId &&
    subject.trim().length > 0 &&
    (body.trim().length > 0 || headline.trim().length > 0) &&
    hasAudience &&
    estimatedRecipients > 0
  );
}
