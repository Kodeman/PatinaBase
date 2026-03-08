import { IssuesService } from './issues.service';
import { CreateIssueDto, IssueStatus } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
export declare class IssuesController {
    private readonly issuesService;
    constructor(issuesService: IssuesService);
    create(projectId: string, createDto: CreateIssueDto, userId: string): Promise<{
        status: string;
        id: string;
        createdAt: Date;
        description: string;
        updatedAt: Date;
        projectId: string;
        severity: string;
    }>;
    findAll(projectId: string, status?: IssueStatus): Promise<{
        status: string;
        id: string;
        createdAt: Date;
        description: string;
        updatedAt: Date;
        projectId: string;
        severity: string;
    }[]>;
    findOne(id: string): Promise<{
        project: {
            title: string;
            id: string;
        };
    } & {
        status: string;
        id: string;
        createdAt: Date;
        description: string;
        updatedAt: Date;
        projectId: string;
        severity: string;
    }>;
    update(id: string, updateDto: UpdateIssueDto, userId: string): Promise<{
        status: string;
        id: string;
        createdAt: Date;
        description: string;
        updatedAt: Date;
        projectId: string;
        severity: string;
    }>;
}
//# sourceMappingURL=issues.controller.d.ts.map