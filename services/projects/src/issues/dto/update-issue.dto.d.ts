import { IssueSeverity, IssueStatus } from './create-issue.dto';
export declare class UpdateIssueDto {
    title?: string;
    description?: string;
    assignedTo?: string;
    severity?: IssueSeverity;
    status?: IssueStatus;
    resolution?: string;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=update-issue.dto.d.ts.map