'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  Input,
  Button,
  Badge,
} from '@patina/design-system';
import { Search, Filter, Eye, Package } from 'lucide-react';
import Link from 'next/link';
import { ordersService } from '@/services/admin';
import { formatCurrency, formatDateTime } from '@/lib/utils';

interface Order {
  id: string;
  userId: string;
  status: string;
  currency: string;
  total: number;
  items?: Array<any>;
  createdAt: string;
}

export default function OrdersPage() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', { page, status: statusFilter !== 'all' ? statusFilter : undefined }],
    queryFn: () =>
      ordersService.getOrders({
        page,
        pageSize: 20,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
  });

  const orders = data?.data?.data || [];
  const meta = data?.data?.meta;

  const statuses = ['all', 'created', 'paid', 'fulfilled', 'closed', 'refunded', 'canceled'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground">
          View and manage customer orders
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search orders by ID, user email..."
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              {statuses.map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                >
                  {status}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading orders...
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No orders found
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((order: Order) => (
                <div
                  key={order.id}
                  className="flex items-center gap-4 rounded-lg border p-4 hover:bg-accent transition-colors"
                >
                  <Package className="h-10 w-10 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium font-mono text-sm">
                        #{order.id.substring(0, 8)}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {order.items?.length || 0} items
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {order.userId}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDateTime(order.createdAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-lg">
                      {formatCurrency(order.total, order.currency)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {order.items?.length || 0} items
                    </div>
                  </div>
                  <Badge
                    variant={
                      order.status === 'paid' || order.status === 'fulfilled' || order.status === 'closed'
                        ? 'success'
                        : order.status === 'refunded' || order.status === 'canceled'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {order.status}
                  </Badge>
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/admin/orders/${order.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Page {meta.page} of {meta.totalPages} ({meta.total} orders)
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
