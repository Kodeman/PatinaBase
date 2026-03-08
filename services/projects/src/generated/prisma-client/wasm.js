
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

exports.Prisma.ProjectScalarFieldEnum = {
  id: 'id',
  proposalId: 'proposalId',
  title: 'title',
  clientId: 'clientId',
  designerId: 'designerId',
  status: 'status',
  startDate: 'startDate',
  endDate: 'endDate',
  actualEnd: 'actualEnd',
  budget: 'budget',
  currency: 'currency',
  description: 'description',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TaskScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  title: 'title',
  description: 'description',
  assigneeId: 'assigneeId',
  dueDate: 'dueDate',
  status: 'status',
  priority: 'priority',
  order: 'order',
  completedAt: 'completedAt',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RFIScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  title: 'title',
  question: 'question',
  answer: 'answer',
  requestedBy: 'requestedBy',
  assignedTo: 'assignedTo',
  dueDate: 'dueDate',
  status: 'status',
  priority: 'priority',
  answeredAt: 'answeredAt',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ChangeOrderScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  title: 'title',
  description: 'description',
  requestedBy: 'requestedBy',
  costImpact: 'costImpact',
  scheduleImpact: 'scheduleImpact',
  status: 'status',
  reason: 'reason',
  approvedBy: 'approvedBy',
  approvedAt: 'approvedAt',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.IssueScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  title: 'title',
  description: 'description',
  reportedBy: 'reportedBy',
  assignedTo: 'assignedTo',
  severity: 'severity',
  status: 'status',
  resolution: 'resolution',
  resolvedAt: 'resolvedAt',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DailyLogScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  authorId: 'authorId',
  date: 'date',
  notes: 'notes',
  weather: 'weather',
  photos: 'photos',
  attendees: 'attendees',
  activities: 'activities',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DocumentScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  title: 'title',
  key: 'key',
  category: 'category',
  version: 'version',
  size: 'size',
  mimeType: 'mimeType',
  uploadedBy: 'uploadedBy',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MilestoneScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  title: 'title',
  description: 'description',
  targetDate: 'targetDate',
  completedAt: 'completedAt',
  status: 'status',
  order: 'order',
  media: 'media',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProjectUpdateScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  title: 'title',
  content: 'content',
  authorId: 'authorId',
  media: 'media',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
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

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  entityType: 'entityType',
  entityId: 'entityId',
  action: 'action',
  actor: 'actor',
  changes: 'changes',
  metadata: 'metadata',
  createdAt: 'createdAt'
};

exports.Prisma.TimelineSegmentScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  title: 'title',
  description: 'description',
  phase: 'phase',
  startDate: 'startDate',
  endDate: 'endDate',
  status: 'status',
  progress: 'progress',
  dependencies: 'dependencies',
  deliverables: 'deliverables',
  order: 'order',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ClientActivityScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  segmentId: 'segmentId',
  userId: 'userId',
  activityType: 'activityType',
  entityType: 'entityType',
  entityId: 'entityId',
  duration: 'duration',
  metadata: 'metadata',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  createdAt: 'createdAt'
};

exports.Prisma.ApprovalRecordScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  segmentId: 'segmentId',
  title: 'title',
  description: 'description',
  approvalType: 'approvalType',
  status: 'status',
  priority: 'priority',
  requestedBy: 'requestedBy',
  assignedTo: 'assignedTo',
  dueDate: 'dueDate',
  approvedAt: 'approvedAt',
  approvedBy: 'approvedBy',
  rejectedAt: 'rejectedAt',
  rejectedBy: 'rejectedBy',
  rejectionReason: 'rejectionReason',
  documents: 'documents',
  comments: 'comments',
  signature: 'signature',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EngagementMetricsScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  clientId: 'clientId',
  totalViews: 'totalViews',
  totalTimeSpent: 'totalTimeSpent',
  lastActivity: 'lastActivity',
  approvalVelocity: 'approvalVelocity',
  responseRate: 'responseRate',
  satisfactionScore: 'satisfactionScore',
  commentsCount: 'commentsCount',
  approvalsCount: 'approvalsCount',
  rejectionsCount: 'rejectionsCount',
  documentsViewed: 'documentsViewed',
  documentsDownloaded: 'documentsDownloaded',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NotificationPreferenceScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  email: 'email',
  emailAddress: 'emailAddress',
  sms: 'sms',
  phoneNumber: 'phoneNumber',
  push: 'push',
  pushTokens: 'pushTokens',
  channels: 'channels',
  frequency: 'frequency',
  quietHours: 'quietHours',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  projectId: 'projectId',
  type: 'type',
  priority: 'priority',
  title: 'title',
  message: 'message',
  actionUrl: 'actionUrl',
  channels: 'channels',
  status: 'status',
  sentAt: 'sentAt',
  readAt: 'readAt',
  deliveryStatus: 'deliveryStatus',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ActiveConnectionScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  projectId: 'projectId',
  socketId: 'socketId',
  userAgent: 'userAgent',
  ipAddress: 'ipAddress',
  connectedAt: 'connectedAt',
  lastPingAt: 'lastPingAt',
  metadata: 'metadata'
};

exports.Prisma.QueuedMessageScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  event: 'event',
  payload: 'payload',
  projectId: 'projectId',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt'
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
  Project: 'Project',
  Task: 'Task',
  RFI: 'RFI',
  ChangeOrder: 'ChangeOrder',
  Issue: 'Issue',
  DailyLog: 'DailyLog',
  Document: 'Document',
  Milestone: 'Milestone',
  ProjectUpdate: 'ProjectUpdate',
  OutboxEvent: 'OutboxEvent',
  AuditLog: 'AuditLog',
  TimelineSegment: 'TimelineSegment',
  ClientActivity: 'ClientActivity',
  ApprovalRecord: 'ApprovalRecord',
  EngagementMetrics: 'EngagementMetrics',
  NotificationPreference: 'NotificationPreference',
  Notification: 'Notification',
  ActiveConnection: 'ActiveConnection',
  QueuedMessage: 'QueuedMessage'
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
