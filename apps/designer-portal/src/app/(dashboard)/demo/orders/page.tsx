'use client';

import { useState } from 'react';
import { Card } from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Input } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@patina/design-system';
import {
  Search,
  Package,
  ShoppingBag,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Calendar,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Order {
  id: string;
  orderNumber: string;
  clientName: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  paymentStatus: 'pending' | 'paid' | 'refunded';
  totalAmount: number;
  itemCount: number;
  createdAt: string;
  trackingNumber?: string;
}

export default function OrdersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Mock data - replace with real API
  const mockOrders: Order[] = [
    {
      id: '1',
      orderNumber: 'ORD-2024-001',
      clientName: 'Sarah Johnson',
      status: 'delivered',
      paymentStatus: 'paid',
      totalAmount: 4589000,
      itemCount: 8,
      createdAt: '2024-01-15T10:30:00Z',
      trackingNumber: 'TRK123456789',
    },
    {
      id: '2',
      orderNumber: 'ORD-2024-002',
      clientName: 'Michael Chen',
      status: 'shipped',
      paymentStatus: 'paid',
      totalAmount: 2345000,
      itemCount: 5,
      createdAt: '2024-01-20T14:20:00Z',
      trackingNumber: 'TRK987654321',
    },
    {
      id: '3',
      orderNumber: 'ORD-2024-003',
      clientName: 'Emily Davis',
      status: 'processing',
      paymentStatus: 'paid',
      totalAmount: 6789000,
      itemCount: 12,
      createdAt: '2024-01-25T09:15:00Z',
    },
  ];

  const orders = mockOrders.filter((o) =>
    statusFilter === 'all' ? true : o.status === statusFilter
  );

  const getStatusConfig = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return { variant: 'subtle' as const, color: 'warning' as const, icon: Clock, label: 'Pending' };
      case 'processing':
        return { variant: 'solid' as const, color: 'info' as const, icon: Package, label: 'Processing' };
      case 'shipped':
        return { variant: 'solid' as const, color: 'primary' as const, icon: Truck, label: 'Shipped' };
      case 'delivered':
        return { variant: 'solid' as const, color: 'success' as const, icon: CheckCircle2, label: 'Delivered' };
      case 'cancelled':
        return { variant: 'solid' as const, color: 'error' as const, icon: XCircle, label: 'Cancelled' };
    }
  };

  const getPaymentStatusBadge = (status: Order['paymentStatus']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="subtle" color="neutral">Pending Payment</Badge>;
      case 'paid':
        return <Badge variant="solid" color="success">Paid</Badge>;
      case 'refunded':
        return <Badge variant="solid" color="error">Refunded</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Orders</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Track and manage all client orders
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <ShoppingBag className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Orders</p>
              <p className="text-xl font-bold">{orders.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
              <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Processing</p>
              <p className="text-xl font-bold">
                {orders.filter((o) => o.status === 'processing').length}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <Truck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Shipped</p>
              <p className="text-xl font-bold">
                {orders.filter((o) => o.status === 'shipped').length}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Revenue</p>
              <p className="text-xl font-bold">
                {formatCurrency(orders.reduce((sum, o) => sum + o.totalAmount, 0))}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
        <TabsList>
          <TabsTrigger value="all">All Orders</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
          <TabsTrigger value="shipped">Shipped</TabsTrigger>
          <TabsTrigger value="delivered">Delivered</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="mt-6">
          {orders.length === 0 ? (
            <Card className="p-12 text-center">
              <ShoppingBag className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No orders found</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => {
                const statusConfig = getStatusConfig(order.status);
                const StatusIcon = statusConfig.icon;

                return (
                  <Card key={order.id} className="p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {/* Order Header */}
                        <div className="flex items-center gap-3 mb-3">
                          <Link href={`/demo/orders/${order.id}`}>
                            <h3 className="text-lg font-semibold hover:text-purple-600 transition-colors">
                              {order.orderNumber}
                            </h3>
                          </Link>
                          <Badge variant={statusConfig.variant} color={statusConfig.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig.label}
                          </Badge>
                          {getPaymentStatusBadge(order.paymentStatus)}
                        </div>

                        {/* Order Details */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <span>{order.clientName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            <span>{order.itemCount} items</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {formatCurrency(order.totalAmount)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>{formatRelativeTime(order.createdAt)}</span>
                          </div>
                        </div>

                        {/* Tracking */}
                        {order.trackingNumber && (
                          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div className="flex items-center gap-2 text-sm">
                              <Truck className="h-4 w-4 text-purple-600" />
                              <span className="text-gray-600 dark:text-gray-400">
                                Tracking:
                              </span>
                              <span className="font-mono font-medium">
                                {order.trackingNumber}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div>
                        <Link href={`/demo/orders/${order.id}`}>
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
