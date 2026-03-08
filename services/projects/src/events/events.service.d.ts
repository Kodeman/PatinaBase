import { PrismaService } from '../prisma/prisma.service';
export declare class EventsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    handleProjectCreated(payload: any): Promise<void>;
    handleProjectStatusChanged(payload: any): Promise<void>;
    handleTaskCreated(payload: any): Promise<void>;
    handleTaskStatusChanged(payload: any): Promise<void>;
    handleTaskCompleted(payload: any): Promise<void>;
    handleTaskDeleted(payload: any): Promise<void>;
    handleTaskBulkUpdated(payload: any): Promise<void>;
    handleRFICreated(payload: any): Promise<void>;
    handleRFIStatusChanged(payload: any): Promise<void>;
    handleRFIAnswered(payload: any): Promise<void>;
    handleChangeOrderCreated(payload: any): Promise<void>;
    handleChangeOrderSubmitted(payload: any): Promise<void>;
    handleChangeOrderApproved(payload: any): Promise<void>;
    handleChangeOrderRejected(payload: any): Promise<void>;
    handleChangeOrderImplemented(payload: any): Promise<void>;
    handleIssueCreated(payload: any): Promise<void>;
    handleIssueStatusChanged(payload: any): Promise<void>;
    handleIssueResolved(payload: any): Promise<void>;
    handleLogCreated(payload: any): Promise<void>;
    handleDocumentUploaded(payload: any): Promise<void>;
    handleMilestoneCreated(payload: any): Promise<void>;
    handleMilestoneStatusChanged(payload: any): Promise<void>;
    handleMilestoneCompleted(payload: any): Promise<void>;
    /**
     * Create an outbox event for transactional publishing
     */
    private createOutboxEvent;
    /**
     * Process outbox events - runs every 10 seconds
     */
    processOutboxEvents(): Promise<void>;
    /**
     * Publish event to OCI Streaming
     */
    private publishToStream;
    /**
     * Clean up old published events - runs daily
     */
    cleanupPublishedEvents(): Promise<void>;
}
//# sourceMappingURL=events.service.d.ts.map