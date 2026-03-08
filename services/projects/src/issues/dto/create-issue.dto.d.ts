export declare enum IssueSeverity {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export declare enum IssueStatus {
    OPEN = "open",
    INVESTIGATING = "investigating",
    RESOLVED = "resolved",
    CLOSED = "closed",
    WONT_FIX = "wont_fix"
}
export declare class CreateIssueDto {
    title: string;
    description: string;
    assignedTo?: string;
    severity?: IssueSeverity;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=create-issue.dto.d.ts.map