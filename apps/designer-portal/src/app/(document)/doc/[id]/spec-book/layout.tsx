"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useFeatureFlag } from "@/hooks/use-feature-flag";

export default function SpecBookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const { value: enabled, isLoading } = useFeatureFlag(
    "spec-book-workspace-pilot",
  );

  if (isLoading) {
    return (
      <main
        className="min-h-screen bg-[var(--doc-paper)] px-6 py-10 md:px-12"
        aria-busy="true"
        aria-label="Loading spec book workspace"
      >
        <div className="mx-auto max-w-7xl animate-pulse">
          <div className="h-3 w-24 bg-[var(--color-pearl)]" />
          <div className="mt-6 h-9 w-80 bg-[var(--color-pearl)]" />
          <div className="mt-10 grid gap-4 md:grid-cols-[220px_1fr_320px]">
            <div className="h-[70vh] bg-[var(--color-pearl)]" />
            <div className="h-[70vh] bg-[var(--color-pearl)]" />
            <div className="h-[70vh] bg-[var(--color-pearl)]" />
          </div>
        </div>
      </main>
    );
  }

  if (!enabled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--doc-paper)] px-6">
        <div className="max-w-md text-center">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Private pilot
          </p>
          <h1 className="mt-3 font-heading text-2xl text-[var(--color-charcoal)]">
            Spec books are not enabled for this studio.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
            Your project schedule is unchanged. Ask your studio administrator
            about the pilot when you are ready.
          </p>
          <Link
            href={`/doc/${params.id}`}
            className="mt-6 inline-block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay)]"
          >
            ← Return to project
          </Link>
        </div>
      </main>
    );
  }

  return children;
}
