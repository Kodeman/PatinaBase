export declare enum ProjectStatus {
    DRAFT = "draft",
    ACTIVE = "active",
    SUBSTANTIAL_COMPLETION = "substantial_completion",
    CLOSED = "closed"
}
export declare class CreateProjectDto {
    proposalId?: string;
    title: string;
    clientId: string;
    designerId: string;
    startDate?: string;
    endDate?: string;
    budget?: number;
    currency?: string;
    description?: string;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=create-project.dto.d.ts.map