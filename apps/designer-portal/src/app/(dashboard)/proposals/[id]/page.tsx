'use client';

import { use } from 'react';
import { useProposal } from '@/hooks/use-proposals';
import { Card, CardContent, CardHeader, CardTitle } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Skeleton } from '@patina/design-system';
import {
  ArrowLeft,
  Send,
  Download,
  Edit,
  Trash2,
  Plus,
  CheckCircle2,
  Timer,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

export default function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: proposal, isLoading } = useProposal(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <h2 className="text-2xl font-semibold mb-2">Proposal not found</h2>
        <Link href="/proposals">
          <Button variant="outline">Back to Proposals</Button>
        </Link>
      </div>
    );
  }

  const totalAmount = proposal.sections.reduce(
    (total: number, section: any) =>
      total +
      section.items.reduce(
        (sectionTotal: number, item: any) =>
          sectionTotal + item.price * item.quantity,
        0
      ),
    0
  );

  const budgetUsage = proposal.targetBudget
    ? Math.min((totalAmount / proposal.targetBudget) * 100, 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Link
            href="/proposals"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Proposals
          </Link>
          <h1 className="text-3xl font-bold">{proposal.title}</h1>
          <p className="text-muted-foreground">
            Client: {proposal.clientName}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          {proposal.status === 'draft' && (
            <Button size="sm">
              <Send className="mr-2 h-4 w-4" />
              Send to Client
            </Button>
          )}
        </div>
      </div>

      {/* Summary Card */}
      <Card>
        <CardContent className="p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Total amount</p>
              <p className="text-3xl font-bold">{formatCurrency(totalAmount)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Target budget</p>
              <p className="text-2xl font-semibold">
                {proposal.targetBudget ? formatCurrency(proposal.targetBudget) : '—'}
              </p>
              {proposal.targetBudget && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Usage</span>
                    <span>{budgetUsage.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${budgetUsage}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className="mt-1 uppercase">{proposal.status}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Items</p>
                <p className="text-2xl font-semibold">
                  {proposal.sections.reduce(
                    (total: number, s: any) => total + s.items.length,
                    0
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Approval</span>
                <span>{proposal.approvals.status}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {proposal.approvals.decisionBy} by{' '}
                {formatRelativeTime(proposal.approvals.dueDate)}
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Timer className="h-4 w-4" />
                Timeline
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {proposal.timeline.map((entry: any) => (
                  <li key={entry.id} className="flex items-center justify-between">
                    <span>{entry.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(entry.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {proposal.notes && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground mb-1">Notes</div>
              <p className="text-sm">{proposal.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sections */}
      <div className="space-y-6">
        {proposal.sections.map((section: any) => (
          <Card key={section.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{section.name}</CardTitle>
              <Button variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {section.items.map((item: any) => (
                  <div
                    key={item.id}
                    className="flex gap-4 p-4 rounded-lg border hover:border-primary transition-colors"
                  >
                    {/* Image */}
                    <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                      <img
                        src={item.imageUrl}
                        alt={item.productName}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold">{item.productName}</h4>
                      <p className="text-sm text-muted-foreground">
                        {item.brand}
                      </p>
                      <div className="mt-2 flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          Qty: {item.quantity}
                        </span>
                        <span className="font-semibold">
                          {formatCurrency(item.price)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-end justify-between">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">
                          Subtotal
                        </div>
                        <div className="font-bold">
                          {formatCurrency(item.price * item.quantity)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Section Total */}
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <span className="text-sm font-medium">Section Total</span>
                <span className="text-lg font-bold">
                  {formatCurrency(
                    section.items.reduce(
                      (total: number, item: any) =>
                        total + item.price * item.quantity,
                      0
                    )
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add Section Button */}
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Add Section
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Version history</h2>
          <div className="space-y-3">
            {proposal.versions.map((version: any) => (
              <div key={version.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">{version.label}</p>
                  <p className="text-sm text-muted-foreground">{version.summary}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatRelativeTime(version.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
