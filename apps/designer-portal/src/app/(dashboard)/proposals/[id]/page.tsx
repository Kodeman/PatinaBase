'use client';

import { use, useState } from 'react';
import {
  useProposal,
  useSendProposal,
  useRemoveProposalItem,
  useDeleteProposal,
} from '@/hooks/use-proposals';
import type { ProposalItem } from '@/hooks/use-proposals';
import { Card, CardContent, CardHeader, CardTitle } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Skeleton } from '@patina/design-system';
import {
  ArrowLeft,
  Send,
  Download,
  Trash2,
  Clock,
  CheckCircle2,
  Eye,
  AlertCircle,
} from 'lucide-react';
import { formatCurrency, formatRelativeTime, formatDate } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: proposal, isLoading } = useProposal(id);
  const sendProposal = useSendProposal();
  const removeItem = useRemoveProposalItem();
  const deleteProposal = useDeleteProposal();
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const getStatusConfig = (
    status: string
  ): {
    variant: 'solid' | 'subtle' | 'outline' | 'dot';
    color: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
  } => {
    switch (status) {
      case 'draft':
        return { variant: 'subtle', color: 'neutral' };
      case 'sent':
        return { variant: 'solid', color: 'info' };
      case 'viewed':
        return { variant: 'dot', color: 'warning' };
      case 'accepted':
        return { variant: 'solid', color: 'success' };
      case 'declined':
        return { variant: 'solid', color: 'error' };
      case 'expired':
        return { variant: 'outline', color: 'neutral' };
      default:
        return { variant: 'subtle', color: 'neutral' };
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft':
        return <Clock className="h-4 w-4" />;
      case 'sent':
        return <Send className="h-4 w-4" />;
      case 'viewed':
        return <Eye className="h-4 w-4" />;
      case 'accepted':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'declined':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const handleSend = async () => {
    try {
      await sendProposal.mutateAsync(id);
    } catch (error) {
      console.error('Failed to send proposal:', error);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    setDeletingItemId(itemId);
    try {
      await removeItem.mutateAsync({ itemId, proposalId: id });
    } catch (error) {
      console.error('Failed to remove item:', error);
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this proposal?')) return;
    try {
      await deleteProposal.mutateAsync(id);
      router.push('/proposals');
    } catch (error) {
      console.error('Failed to delete proposal:', error);
    }
  };

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

  const items = proposal.items ?? [];
  const itemCount = items.length;

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
            Client: {proposal.client?.full_name || 'No client assigned'}
          </p>
          {proposal.project && (
            <p className="text-sm text-muted-foreground">
              Project: {proposal.project.name}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          {proposal.status === 'draft' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={deleteProposal.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={sendProposal.isPending}
              >
                <Send className="mr-2 h-4 w-4" />
                Send to Client
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Card */}
      <Card>
        <CardContent className="p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Total amount</p>
              <p className="text-3xl font-bold">
                {formatCurrency(proposal.total_amount)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Valid until</p>
              <p className="text-2xl font-semibold">
                {proposal.valid_until
                  ? formatDate(proposal.valid_until)
                  : 'No expiration'}
              </p>
            </div>
            <div className="flex items-center justify-end gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className="mt-1" {...getStatusConfig(proposal.status)}>
                  <span className="flex items-center gap-1">
                    {getStatusIcon(proposal.status)}
                    {proposal.status}
                  </span>
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Items</p>
                <p className="text-2xl font-semibold">{itemCount}</p>
              </div>
            </div>
          </div>

          {/* Timeline info */}
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm">{formatRelativeTime(proposal.created_at)}</p>
            </div>
            {proposal.sent_at && (
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Sent</p>
                <p className="text-sm">{formatRelativeTime(proposal.sent_at)}</p>
              </div>
            )}
            {proposal.viewed_at && (
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Viewed</p>
                <p className="text-sm">{formatRelativeTime(proposal.viewed_at)}</p>
              </div>
            )}
            {proposal.responded_at && (
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Responded</p>
                <p className="text-sm">
                  {formatRelativeTime(proposal.responded_at)}
                </p>
              </div>
            )}
          </div>

          {proposal.description && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground mb-1">Description</div>
              <p className="text-sm">{proposal.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle>Items ({itemCount})</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No items in this proposal yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item: ProposalItem) => {
                const displayName =
                  item.product?.name || item.custom_name || 'Unnamed item';
                const vendorName = item.product?.vendor_name;
                const imageUrl = item.product?.primary_image_url;
                const lineTotal = item.unit_price * item.quantity;

                return (
                  <div
                    key={item.id}
                    className="flex gap-4 p-4 rounded-lg border hover:border-primary transition-colors"
                  >
                    {/* Image */}
                    <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={displayName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                          No image
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold">{displayName}</h4>
                      {vendorName && (
                        <p className="text-sm text-muted-foreground">
                          {vendorName}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.notes}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          Qty: {item.quantity}
                        </span>
                        <span className="font-semibold">
                          {formatCurrency(item.unit_price)} each
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-end justify-between">
                      {proposal.status === 'draft' && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={deletingItemId === item.id}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">
                          Subtotal
                        </div>
                        <div className="font-bold">
                          {formatCurrency(lineTotal)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Total */}
          {items.length > 0 && (
            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <span className="text-lg font-semibold">Total</span>
              <span className="text-xl font-bold">
                {formatCurrency(proposal.total_amount)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
