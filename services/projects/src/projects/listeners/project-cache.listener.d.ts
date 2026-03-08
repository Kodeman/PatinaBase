import { CacheService } from '@patina/cache';
interface ProjectEventPayload {
    projectId?: string;
}
export declare class ProjectCacheInvalidationListener {
    private readonly cacheService;
    private readonly logger;
    constructor(cacheService: CacheService);
    private invalidateProjectCache;
    onProjectMutations(payload: ProjectEventPayload): Promise<void>;
    onTaskEvents(payload: ProjectEventPayload): Promise<void>;
    onChangeOrderEvents(payload: ProjectEventPayload): Promise<void>;
    onRfiEvents(payload: ProjectEventPayload): Promise<void>;
    onIssueEvents(payload: ProjectEventPayload): Promise<void>;
    onMilestoneEvents(payload: ProjectEventPayload): Promise<void>;
    onTimelineEvents(payload: ProjectEventPayload): Promise<void>;
    onApprovalEvents(payload: ProjectEventPayload): Promise<void>;
    onLogOrDocumentEvents(payload: ProjectEventPayload): Promise<void>;
}
export {};
//# sourceMappingURL=project-cache.listener.d.ts.map