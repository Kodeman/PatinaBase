'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useProposals } from '@/hooks/use-proposals';
import { Card, CardContent } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Skeleton } from '@patina/design-system';
import { Plus, FileText, Send, Eye, Target } from 'lucide-react';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';

export default function ProposalsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data: proposals, isLoading } = useProposals({ status: statusFilter });

  const getStatusConfig = (status: string): { variant: 'solid' | 'subtle' | 'outline' | 'dot', color: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' } => {
    switch (status) {
      case 'draft':
        return { variant: 'subtle', color: 'neutral' };
      case 'sent':
        return { variant: 'solid', color: 'info' };
      case 'approved':
        return { variant: 'solid', color: 'success' };
      case 'rejected':
        return { variant: 'solid', color: 'error' };
      default:
        return { variant: 'subtle', color: 'neutral' };
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Proposals</h1>
          <p className="text-muted-foreground">
            Create and manage client proposals
          </p>
        </div>
        <Link href="/proposals/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Proposal
          </Button>
        </Link>
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {['', 'draft', 'ready', 'sent', 'approved'].map((status) => (
          <Button
            key={status || 'all'}
            variant={statusFilter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'All'}
          </Button>
        ))}
      </div>

      {/* Proposal List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2 mb-4" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {proposals?.data.map((proposal: any) => (
            <Card key={proposal.id} className="group hover:border-primary transition-colors">
              <CardContent className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <Link href={`/proposals/${proposal.id}`}>
                        <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                          {proposal.title}
                        </h3>
                      </Link>
                      <p className="text-sm text-muted-foreground">{proposal.clientName}</p>
                    </div>
                  </div>
                  <Badge {...getStatusConfig(proposal.status)}>{proposal.status}</Badge>
                </div>
                <div className="grid gap-3 lg:grid-cols-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Target className="h-4 w-4" />
                    Due {proposal.dueDate ? formatRelativeTime(proposal.dueDate) : '—'}
                  </div>
                  <div>{proposal.itemCount} items</div>
                  <div>Updated {formatRelativeTime(proposal.updatedAt)}</div>
                  <div className="text-right text-base font-semibold text-foreground">
                    {formatCurrency(proposal.totalAmount)}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {proposal.status === 'draft' && (
                    <Button size="sm" variant="outline">
                      <Send className="mr-2 h-4 w-4" />
                      Send
                    </Button>
                  )}
                  <Link href={`/proposals/${proposal.id}`}>
                    <Button size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && proposals?.data.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No proposals yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first proposal to get started
            </p>
            <Link href="/proposals/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Proposal
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
