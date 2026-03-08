
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.CartScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  sessionToken: 'sessionToken',
  status: 'status',
  currency: 'currency',
  discountCode: 'discountCode',
  discountAmount: 'discountAmount',
  subtotal: 'subtotal',
  taxTotal: 'taxTotal',
  shippingTotal: 'shippingTotal',
  total: 'total',
  metadata: 'metadata',
  expiresAt: 'expiresAt',
  convertedAt: 'convertedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  shippingAddressId: 'shippingAddressId',
  billingAddressId: 'billingAddressId'
};

exports.Prisma.CartItemScalarFieldEnum = {
  id: 'id',
  cartId: 'cartId',
  productId: 'productId',
  variantId: 'variantId',
  name: 'name',
  sku: 'sku',
  qty: 'qty',
  unitPrice: 'unitPrice',
  currency: 'currency',
  discountAlloc: 'discountAlloc',
  taxAmount: 'taxAmount',
  snapshot: 'snapshot',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DiscountScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  description: 'description',
  kind: 'kind',
  value: 'value',
  currency: 'currency',
  minPurchase: 'minPurchase',
  maxDiscount: 'maxDiscount',
  usageLimit: 'usageLimit',
  usageCount: 'usageCount',
  perUserLimit: 'perUserLimit',
  eligibleProducts: 'eligibleProducts',
  eligibleCategories: 'eligibleCategories',
  startsAt: 'startsAt',
  endsAt: 'endsAt',
  rules: 'rules',
  active: 'active',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdBy: 'createdBy'
};

exports.Prisma.OrderScalarFieldEnum = {
  id: 'id',
  orderNumber: 'orderNumber',
  userId: 'userId',
  cartId: 'cartId',
  status: 'status',
  paymentStatus: 'paymentStatus',
  fulfillmentStatus: 'fulfillmentStatus',
  currency: 'currency',
  subtotal: 'subtotal',
  discountTotal: 'discountTotal',
  taxTotal: 'taxTotal',
  shippingTotal: 'shippingTotal',
  total: 'total',
  paymentIntentId: 'paymentIntentId',
  checkoutSessionId: 'checkoutSessionId',
  customerId: 'customerId',
  shippingAddressId: 'shippingAddressId',
  billingAddressId: 'billingAddressId',
  shippingMethod: 'shippingMethod',
  taxLines: 'taxLines',
  snapshot: 'snapshot',
  customerNotes: 'customerNotes',
  internalNotes: 'internalNotes',
  metadata: 'metadata',
  paidAt: 'paidAt',
  fulfilledAt: 'fulfilledAt',
  closedAt: 'closedAt',
  canceledAt: 'canceledAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OrderItemScalarFieldEnum = {
  id: 'id',
  orderId: 'orderId',
  productId: 'productId',
  variantId: 'variantId',
  name: 'name',
  sku: 'sku',
  qty: 'qty',
  unitPrice: 'unitPrice',
  currency: 'currency',
  taxLines: 'taxLines',
  discountAlloc: 'discountAlloc',
  subtotal: 'subtotal',
  total: 'total',
  snapshot: 'snapshot',
  metadata: 'metadata',
  qtyFulfilled: 'qtyFulfilled',
  qtyRefunded: 'qtyRefunded',
  createdAt: 'createdAt'
};

exports.Prisma.PaymentScalarFieldEnum = {
  id: 'id',
  orderId: 'orderId',
  provider: 'provider',
  status: 'status',
  amount: 'amount',
  currency: 'currency',
  paymentIntentId: 'paymentIntentId',
  chargeId: 'chargeId',
  paymentMethodId: 'paymentMethodId',
  last4: 'last4',
  brand: 'brand',
  country: 'country',
  riskScore: 'riskScore',
  riskLevel: 'riskLevel',
  raw: 'raw',
  metadata: 'metadata',
  failureCode: 'failureCode',
  failureMessage: 'failureMessage',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RefundScalarFieldEnum = {
  id: 'id',
  orderId: 'orderId',
  amount: 'amount',
  currency: 'currency',
  reason: 'reason',
  status: 'status',
  provider: 'provider',
  providerRefundId: 'providerRefundId',
  chargeId: 'chargeId',
  paymentIntentId: 'paymentIntentId',
  description: 'description',
  metadata: 'metadata',
  raw: 'raw',
  processedAt: 'processedAt',
  createdAt: 'createdAt',
  createdBy: 'createdBy'
};

exports.Prisma.ShipmentScalarFieldEnum = {
  id: 'id',
  orderId: 'orderId',
  shipmentNumber: 'shipmentNumber',
  carrier: 'carrier',
  service: 'service',
  trackingNumber: 'trackingNumber',
  trackingUrl: 'trackingUrl',
  status: 'status',
  method: 'method',
  items: 'items',
  carrierShipmentId: 'carrierShipmentId',
  labelUrl: 'labelUrl',
  labelFormat: 'labelFormat',
  labelSize: 'labelSize',
  commercialInvoiceUrl: 'commercialInvoiceUrl',
  rateId: 'rateId',
  trackingStatus: 'trackingStatus',
  trackingEvents: 'trackingEvents',
  publicTrackingUrl: 'publicTrackingUrl',
  fromAddress: 'fromAddress',
  toAddress: 'toAddress',
  addressId: 'addressId',
  parcel: 'parcel',
  cost: 'cost',
  currency: 'currency',
  estimatedDelivery: 'estimatedDelivery',
  shippedAt: 'shippedAt',
  deliveredAt: 'deliveredAt',
  notes: 'notes',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdBy: 'createdBy'
};

exports.Prisma.AddressScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  kind: 'kind',
  firstName: 'firstName',
  lastName: 'lastName',
  company: 'company',
  line1: 'line1',
  line2: 'line2',
  city: 'city',
  region: 'region',
  postal: 'postal',
  country: 'country',
  phone: 'phone',
  verified: 'verified',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ReconciliationScalarFieldEnum = {
  id: 'id',
  jobId: 'jobId',
  status: 'status',
  window: 'window',
  stripeCount: 'stripeCount',
  patinaCount: 'patinaCount',
  matchedCount: 'matchedCount',
  discrepancies: 'discrepancies',
  orphanStripe: 'orphanStripe',
  orphanPatina: 'orphanPatina',
  mismatches: 'mismatches',
  resolutionNotes: 'resolutionNotes',
  resolvedBy: 'resolvedBy',
  resolvedAt: 'resolvedAt',
  startedAt: 'startedAt',
  completedAt: 'completedAt'
};

exports.Prisma.IdempotencyKeyScalarFieldEnum = {
  id: 'id',
  key: 'key',
  endpoint: 'endpoint',
  statusCode: 'statusCode',
  response: 'response',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  entityType: 'entityType',
  entityId: 'entityId',
  action: 'action',
  actor: 'actor',
  actorType: 'actorType',
  changes: 'changes',
  metadata: 'metadata',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  createdAt: 'createdAt'
};

exports.Prisma.OutboxEventScalarFieldEnum = {
  id: 'id',
  type: 'type',
  payload: 'payload',
  headers: 'headers',
  published: 'published',
  createdAt: 'createdAt',
  publishedAt: 'publishedAt',
  retryCount: 'retryCount',
  lastError: 'lastError'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  Cart: 'Cart',
  CartItem: 'CartItem',
  Discount: 'Discount',
  Order: 'Order',
  OrderItem: 'OrderItem',
  Payment: 'Payment',
  Refund: 'Refund',
  Shipment: 'Shipment',
  Address: 'Address',
  Reconciliation: 'Reconciliation',
  IdempotencyKey: 'IdempotencyKey',
  AuditLog: 'AuditLog',
  OutboxEvent: 'OutboxEvent'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
