'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Input,
  Textarea,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  AlertDescription,
} from '@patina/design-system';
import {
  ArrowLeft,
  Package,
  CreditCard,
  Truck,
  Clock,
  AlertCircle,
  XCircle,
  RefreshCw,
  MapPin,
  CheckCircle2,
  CircleDot,
  Ban,
  DollarSign,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { ordersService } from '@/services/admin';
import { formatCurrency, formatDateTime, formatDate, cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types matching the Orders service Prisma schema
// ---------------------------------------------------------------------------

interface OrderAddress {
  id: string;
  kind: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postal: string;
  country: string;
  phone?: string;
}

interface OrderItemDetail {
  id: string;
  orderId: string;
  productId: string;
  variantId?: string;
  name: string;
  sku?: string;
  qty: number;
  unitPrice: number;
  currency: string;
  subtotal: number;
  total: number;
  discountAlloc?: number;
  qtyFulfilled: number;
  qtyRefunded: number;
  snapshot?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface PaymentDetail {
  id: string;
  orderId: string;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  paymentIntentId?: string;
  chargeId?: string;
  paymentMethodId?: string;
  last4?: string;
  brand?: string;
  failureCode?: string;
  failureMessage?: string;
  createdAt: string;
}

interface RefundDetail {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  reason?: string;
  status: string;
  description?: string;
  providerRefundId?: string;
  processedAt?: string;
  createdAt: string;
  createdBy?: string;
}

interface ShipmentDetail {
  id: string;
  orderId: string;
  shipmentNumber?: string;
  carrier?: string;
  service?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  status: string;
  method?: string;
  items: Array<{ orderItemId: string; qty: number }>;
  publicTrackingUrl?: string;
  estimatedDelivery?: string;
  shippedAt?: string;
  deliveredAt?: string;
  createdAt: string;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  userId: string;
  cartId?: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  total: number;
  shippingMethod?: string;
  customerNotes?: string;
  internalNotes?: string;
  metadata?: Record<string, unknown>;
  paidAt?: string;
  fulfilledAt?: string;
  closedAt?: string;
  canceledAt?: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItemDetail[];
  payments: PaymentDetail[];
  refunds: RefundDetail[];
  shipments: ShipmentDetail[];
  shippingAddress?: OrderAddress;
  billingAddress?: OrderAddress;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusVariant(status: string): 'success' | 'destructive' | 'secondary' | 'outline' | 'warning' {
  switch (status) {
    case 'paid':
    case 'fulfilled':
    case 'closed':
    case 'delivered':
    case 'succeeded':
      return 'success';
    case 'refunded':
    case 'canceled':
    case 'cancelled':
    case 'failed':
    case 'exception':
    case 'returned':
      return 'destructive';
    case 'processing':
    case 'in_transit':
    case 'out_for_delivery':
    case 'authorized':
    case 'partial':
      return 'warning';
    case 'pending':
    case 'created':
    case 'unfulfilled':
      return 'secondary';
    default:
      return 'outline';
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function buildTimeline(order: OrderDetail) {
  const events: Array<{
    label: string;
    date: string | null;
    icon: typeof CheckCircle2;
    done: boolean;
  }> = [
    {
      label: 'Order placed',
      date: order.createdAt,
      icon: Package,
      done: true,
    },
    {
      label: 'Payment received',
      date: order.paidAt ?? null,
      icon: CreditCard,
      done: !!order.paidAt,
    },
    {
      label: 'Shipped',
      date: order.shipments?.[0]?.shippedAt ?? null,
      icon: Truck,
      done: order.shipments?.some((s) => s.shippedAt) ?? false,
    },
    {
      label: 'Delivered',
      date: order.shipments?.[0]?.deliveredAt ?? null,
      icon: CheckCircle2,
      done: order.shipments?.some((s) => s.deliveredAt) ?? false,
    },
  ];

  if (order.canceledAt) {
    events.push({
      label: 'Cancelled',
      date: order.canceledAt,
      icon: XCircle,
      done: true,
    });
  }

  if (order.closedAt) {
    events.push({
      label: 'Closed',
      date: order.closedAt,
      icon: CheckCircle2,
      done: true,
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const orderId = params.id as string;

  // Dialogs
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  // Fetch order
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-orders', orderId],
    queryFn: () => ordersService.getOrder(orderId),
  });

  const order = data?.data as OrderDetail | undefined;

  // Mutations
  const cancelMutation = useMutation({
    mutationFn: () => ordersService.cancelOrder(orderId, cancelReason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      setCancelDialogOpen(false);
      setCancelReason('');
    },
  });

  const refundMutation = useMutation({
    mutationFn: () =>
      ordersService.createRefund(orderId, {
        amount: Math.round(parseFloat(refundAmount) * 100),
        reason: refundReason || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      setRefundDialogOpen(false);
      setRefundAmount('');
      setRefundReason('');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: () => ordersService.updateOrder(orderId, { status: newStatus } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders', orderId] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      setStatusDialogOpen(false);
      setNewStatus('');
    },
  });

  // Loading
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/orders')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="text-muted-foreground">Loading order details...</div>
        </div>
      </div>
    );
  }

  // Error
  if (error || !order) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/orders')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Order Not Found</h1>
        </div>
        <Alert variant="solid" color="error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load order details. The order may not exist or you may not have permission to
            view it.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const timeline = buildTimeline(order);
  const canCancel = !['canceled', 'cancelled', 'refunded', 'closed'].includes(order.status);
  const canRefund = ['paid', 'fulfilled', 'closed'].includes(order.status);

  return (
    <div className="space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/orders')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold tracking-tight">
                Order #{order.orderNumber}
              </h1>
              <Badge variant={getStatusVariant(order.status)}>{order.status}</Badge>
              <Badge variant={getStatusVariant(order.paymentStatus)}>
                {order.paymentStatus}
              </Badge>
              <Badge variant={getStatusVariant(order.fulfillmentStatus)}>
                {order.fulfillmentStatus}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Placed {formatDateTime(order.createdAt)}</span>
              <span className="flex items-center gap-1">
                Customer: <span className="font-mono text-xs">{order.userId}</span>
                <button
                  onClick={() => copyToClipboard(order.userId)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatusDialogOpen(true)}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Update Status
          </Button>
          {canRefund && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRefundAmount((order.total / 100).toFixed(2));
                setRefundDialogOpen(true);
              }}
            >
              <DollarSign className="mr-2 h-4 w-4" />
              Refund
            </Button>
          )}
          {canCancel && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setCancelDialogOpen(true)}
            >
              <Ban className="mr-2 h-4 w-4" />
              Cancel Order
            </Button>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Main content grid                                                 */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Order Items
              </CardTitle>
              <CardDescription>
                {order.items.length} item{order.items.length !== 1 ? 's' : ''} in this order
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-0 divide-y">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                      <Package className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.sku && (
                          <span className="text-xs text-muted-foreground font-mono">
                            SKU: {item.sku}
                          </span>
                        )}
                        {item.variantId && (
                          <span className="text-xs text-muted-foreground font-mono">
                            Variant: {item.variantId.substring(0, 8)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>Fulfilled: {item.qtyFulfilled}/{item.qty}</span>
                        {item.qtyRefunded > 0 && (
                          <span className="text-destructive">
                            Refunded: {item.qtyRefunded}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        {item.qty} x {formatCurrency(item.unitPrice)}
                      </p>
                      <p className="font-medium">{formatCurrency(item.total)}</p>
                      {item.discountAlloc && item.discountAlloc > 0 && (
                        <p className="text-xs text-green-600">
                          -{formatCurrency(item.discountAlloc)} discount
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="mt-6 border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                {order.discountTotal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="text-green-600">-{formatCurrency(order.discountTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatCurrency(order.taxTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>{formatCurrency(order.shippingTotal)}</span>
                </div>
                <div className="flex justify-between font-medium text-lg border-t pt-2">
                  <span>Total</span>
                  <span>{formatCurrency(order.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.payments.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  No payments recorded
                </div>
              ) : (
                <div className="space-y-4">
                  {order.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-primary/10 p-2">
                          <CreditCard className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium capitalize">{payment.provider}</span>
                            <Badge variant={getStatusVariant(payment.status)}>
                              {payment.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                            {payment.brand && payment.last4 && (
                              <span className="capitalize">
                                {payment.brand} ending in {payment.last4}
                              </span>
                            )}
                            {payment.paymentIntentId && (
                              <span className="font-mono text-xs">
                                {payment.paymentIntentId}
                              </span>
                            )}
                          </div>
                          {payment.failureMessage && (
                            <p className="text-sm text-destructive mt-1">
                              {payment.failureMessage}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDateTime(payment.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right font-medium text-lg">
                        {formatCurrency(payment.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Refunds */}
              {order.refunds.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium mb-3">Refunds</h4>
                  <div className="space-y-3">
                    {order.refunds.map((refund) => (
                      <div
                        key={refund.id}
                        className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-4"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Refund</span>
                            <Badge variant={getStatusVariant(refund.status)}>
                              {refund.status}
                            </Badge>
                          </div>
                          {refund.reason && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Reason: {refund.reason}
                            </p>
                          )}
                          {refund.description && (
                            <p className="text-sm text-muted-foreground">
                              {refund.description}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDateTime(refund.createdAt)}
                            {refund.createdBy && ` by ${refund.createdBy}`}
                          </p>
                        </div>
                        <div className="text-right font-medium text-lg text-destructive">
                          -{formatCurrency(refund.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Shipments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.shipments.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  No shipments yet
                </div>
              ) : (
                <div className="space-y-4">
                  {order.shipments.map((shipment) => (
                    <div
                      key={shipment.id}
                      className="rounded-lg border p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {shipment.shipmentNumber || shipment.id.substring(0, 8)}
                          </span>
                          <Badge variant={getStatusVariant(shipment.status)}>
                            {shipment.status}
                          </Badge>
                        </div>
                        {shipment.carrier && (
                          <span className="text-sm text-muted-foreground">
                            {shipment.carrier}
                            {shipment.service && ` - ${shipment.service}`}
                          </span>
                        )}
                      </div>

                      {shipment.trackingNumber && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Tracking:</span>
                          <span className="font-mono">{shipment.trackingNumber}</span>
                          <button
                            onClick={() => copyToClipboard(shipment.trackingNumber!)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          {(shipment.trackingUrl || shipment.publicTrackingUrl) && (
                            <a
                              href={shipment.publicTrackingUrl || shipment.trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              Track
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {shipment.shippedAt && (
                          <span>Shipped: {formatDate(shipment.shippedAt)}</span>
                        )}
                        {shipment.estimatedDelivery && (
                          <span>ETA: {formatDate(shipment.estimatedDelivery)}</span>
                        )}
                        {shipment.deliveredAt && (
                          <span className="text-green-600">
                            Delivered: {formatDate(shipment.deliveredAt)}
                          </span>
                        )}
                      </div>

                      {shipment.items && shipment.items.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {shipment.items.length} item{shipment.items.length !== 1 ? 's' : ''} in
                          this shipment
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column - 1/3 width */}
        <div className="space-y-6">
          {/* Order Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {timeline.map((event, index) => {
                  const Icon = event.icon;
                  return (
                    <div key={event.label} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full',
                            event.done
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        {index < timeline.length - 1 && (
                          <div
                            className={cn(
                              'mt-1 h-6 w-px',
                              event.done ? 'bg-primary' : 'bg-border'
                            )}
                          />
                        )}
                      </div>
                      <div className="pt-1">
                        <p
                          className={cn(
                            'text-sm font-medium',
                            !event.done && 'text-muted-foreground'
                          )}
                        >
                          {event.label}
                        </p>
                        {event.date && (
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(event.date)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Shipping Address */}
          {order.shippingAddress && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Shipping Address
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AddressBlock address={order.shippingAddress} />
              </CardContent>
            </Card>
          )}

          {/* Billing Address */}
          {order.billingAddress && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Billing Address
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AddressBlock address={order.billingAddress} />
              </CardContent>
            </Card>
          )}

          {/* Order Notes */}
          {(order.customerNotes || order.internalNotes) && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {order.customerNotes && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Customer Notes
                    </p>
                    <p className="text-sm">{order.customerNotes}</p>
                  </div>
                )}
                {order.internalNotes && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Internal Notes
                    </p>
                    <p className="text-sm">{order.internalNotes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Order Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Order ID</span>
                <span className="font-mono text-xs">{order.id.substring(0, 12)}...</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Currency</span>
                <span>{order.currency}</span>
              </div>
              {order.shippingMethod && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Shipping Method</span>
                  <span className="capitalize">{order.shippingMethod}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(order.createdAt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Updated</span>
                <span>{formatDate(order.updatedAt)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Cancel Order Dialog                                               */}
      {/* ----------------------------------------------------------------- */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel order #{order.orderNumber}? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Reason (optional)</label>
              <Textarea
                placeholder="Reason for cancellation..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep Order
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------------- */}
      {/* Refund Dialog                                                     */}
      {/* ----------------------------------------------------------------- */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              Issue a refund for order #{order.orderNumber}. The maximum refundable amount is{' '}
              {formatCurrency(order.total)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Refund Amount ($)</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={(order.total / 100).toFixed(2)}
                placeholder="0.00"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Reason (optional)</label>
              <Select value={refundReason} onValueChange={setRefundReason}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="requested_by_customer">Requested by customer</SelectItem>
                  <SelectItem value="duplicate">Duplicate order</SelectItem>
                  <SelectItem value="fraudulent">Fraudulent</SelectItem>
                  <SelectItem value="product_not_received">Product not received</SelectItem>
                  <SelectItem value="product_unacceptable">Product unacceptable</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => refundMutation.mutate()}
              disabled={refundMutation.isPending || !refundAmount || parseFloat(refundAmount) <= 0}
            >
              {refundMutation.isPending ? 'Processing...' : `Refund $${refundAmount || '0.00'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------------- */}
      {/* Update Status Dialog                                              */}
      {/* ----------------------------------------------------------------- */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Order Status</DialogTitle>
            <DialogDescription>
              Change the status of order #{order.orderNumber}. Current status:{' '}
              <Badge variant={getStatusVariant(order.status)} className="ml-1">
                {order.status}
              </Badge>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">New Status</label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select new status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="fulfilled">Fulfilled</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateStatusMutation.mutate()}
              disabled={updateStatusMutation.isPending || !newStatus}
            >
              {updateStatusMutation.isPending ? 'Updating...' : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AddressBlock({ address }: { address: OrderAddress }) {
  return (
    <div className="text-sm space-y-0.5">
      {(address.firstName || address.lastName) && (
        <p className="font-medium">
          {[address.firstName, address.lastName].filter(Boolean).join(' ')}
        </p>
      )}
      {address.company && <p className="text-muted-foreground">{address.company}</p>}
      <p>{address.line1}</p>
      {address.line2 && <p>{address.line2}</p>}
      <p>
        {address.city}
        {address.region && `, ${address.region}`} {address.postal}
      </p>
      <p>{address.country}</p>
      {address.phone && (
        <p className="text-muted-foreground mt-2">{address.phone}</p>
      )}
    </div>
  );
}
