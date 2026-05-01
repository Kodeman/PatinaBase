'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { createBrowserClient, useShareRoomScan } from '@patina/supabase';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';

interface ShareScanDialogProps {
  scanId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MyDesigner {
  id: string;
  fullName: string | null;
  businessName: string | null;
  avatarUrl: string | null;
}

function useMyDesigners() {
  return useQuery({
    queryKey: ['my-designers'],
    queryFn: async (): Promise<MyDesigner[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('designer_clients')
        .select(
          'designer_id, designer:profiles!designer_id(id, full_name, business_name, avatar_url)',
        )
        .eq('client_id', user.id);

      if (error) throw error;

      const seen = new Set<string>();
      const designers: MyDesigner[] = [];
      for (const row of data ?? []) {
        const d = row.designer as
          | { id: string; full_name: string | null; business_name: string | null; avatar_url: string | null }
          | null;
        if (!d || seen.has(d.id)) continue;
        seen.add(d.id);
        designers.push({
          id: d.id,
          fullName: d.full_name,
          businessName: d.business_name,
          avatarUrl: d.avatar_url,
        });
      }
      return designers;
    },
  });
}

export function ShareScanDialog({ scanId, open, onOpenChange }: ShareScanDialogProps) {
  const { data: designers = [], isLoading } = useMyDesigners();
  const share = useShareRoomScan();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function handleShare(designerId: string) {
    setPendingId(designerId);
    share.mutate(
      { scanId, designerId, accessLevel: 'full' },
      {
        onSuccess: () => {
          setPendingId(null);
          onOpenChange(false);
        },
        onError: () => {
          setPendingId(null);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Get design help</DialogTitle>
          <DialogDescription>
            Share this room with a designer so they can give you tailored recommendations.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          {isLoading ? (
            <p className="type-body-small text-[var(--text-muted)]">Loading designers…</p>
          ) : designers.length === 0 ? (
            <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
              <p className="type-body-small text-[var(--text-muted)]">
                You&rsquo;re not connected with any designers yet. Once you start a project with a Patina designer, you&rsquo;ll be able to share rooms with them here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)] rounded border border-[var(--border-default)]">
              {designers.map((d) => {
                const name = d.fullName?.trim() || d.businessName?.trim() || 'Designer';
                const isPending = share.isPending && pendingId === d.id;
                return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">{name}</p>
                      {d.businessName && d.fullName ? (
                        <p className="truncate type-meta-small text-[var(--text-muted)]">
                          {d.businessName}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleShare(d.id)}
                      disabled={isPending}
                      className="shrink-0 rounded-[3px] bg-[var(--accent-primary)] px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                      data-testid={`share-with-${d.id}`}
                    >
                      {isPending ? 'Sharing…' : 'Share'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {share.isError ? (
            <p className="mt-3 type-meta-small text-patina-terracotta" role="alert">
              Couldn&rsquo;t share. Please try again.
            </p>
          ) : null}
        </div>

        <DialogFooter className="mt-4">
          <DialogClose asChild>
            <button
              type="button"
              className="rounded-[3px] border border-[var(--border-default)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition hover:bg-[var(--bg-surface)]"
            >
              Close
            </button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
