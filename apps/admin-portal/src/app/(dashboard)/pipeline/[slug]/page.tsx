'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { StageTag } from '@/components/pipeline/stage-tag';
import { ScoreBadge } from '@/components/pipeline/score-badge';
import { RubricGrid } from '@/components/pipeline/detail/rubric-grid';
import { OnboardingPhases } from '@/components/pipeline/detail/onboarding-phases';
import { CoworkActivityLog } from '@/components/pipeline/detail/cowork-activity-log';
import { VendorNotes } from '@/components/pipeline/detail/vendor-notes';
import { CoworkActionSidebar } from '@/components/pipeline/detail/cowork-action-sidebar';
import { useVendor } from '@/hooks/use-pipeline';

export default function VendorDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data, isLoading, error } = useVendor(slug);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/pipeline"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to pipeline
        </Link>
        <div className="rounded-sm border border-dashed py-12 text-center text-sm text-muted-foreground">
          Vendor not found.
        </div>
      </div>
    );
  }

  const vendor = data;
  const locationLine = [vendor.location_city, vendor.location_state]
    .filter(Boolean)
    .join(', ');
  const priceRange =
    vendor.price_range_low != null && vendor.price_range_high != null
      ? `$${vendor.price_range_low.toLocaleString()}–$${vendor.price_range_high.toLocaleString()}`
      : null;

  return (
    <div className="space-y-8">
      <Link
        href="/pipeline"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to pipeline
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2">
          <h1 className="font-display text-4xl font-bold tracking-tight">
            {vendor.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {locationLine && <span>{locationLine}</span>}
            {vendor.year_established && (
              <>
                <span>·</span>
                <span>Est. {vendor.year_established}</span>
              </>
            )}
            {priceRange && (
              <>
                <span>·</span>
                <span>{priceRange}</span>
              </>
            )}
            {vendor.website_url && (
              <>
                <span>·</span>
                <a
                  href={vendor.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-foreground hover:underline"
                >
                  {new URL(vendor.website_url).hostname}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StageTag stage={vendor.stage} />
            {vendor.product_categories?.map((c) => (
              <span
                key={c}
                className="rounded-full bg-muted px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
        <ScoreBadge
          score={vendor.total_score}
          triage={vendor.triage_level}
          size="lg"
          showLabel
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
        <div className="space-y-8">
          <section>
            <h2 className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
              Onboarding
            </h2>
            <div className="mt-3">
              <OnboardingPhases stage={vendor.stage} />
            </div>
          </section>

          <Separator />

          <section>
            <h2 className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
              Qualification rubric
            </h2>
            <div className="mt-3">
              <RubricGrid scores={vendor.scores ?? []} />
            </div>
          </section>

          <Separator />

          <section>
            <h2 className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
              Notes
            </h2>
            <div className="mt-3">
              <VendorNotes
                slug={vendor.slug}
                initialNotes={vendor.notes}
                initialLeahNotes={vendor.leah_notes}
              />
            </div>
          </section>

          <Separator />

          <section>
            <h2 className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
              Cowork activity
            </h2>
            <div className="mt-3">
              <CoworkActivityLog tasks={vendor.cowork_tasks ?? []} />
            </div>
          </section>
        </div>

        <CoworkActionSidebar vendor={vendor} />
      </div>
    </div>
  );
}
