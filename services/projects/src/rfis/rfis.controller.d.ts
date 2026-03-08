import { RfisService } from './rfis.service';
import { CreateRFIDto, RFIStatus } from './dto/create-rfi.dto';
import { UpdateRFIDto } from './dto/update-rfi.dto';
export declare class RfisController {
    private readonly rfisService;
    constructor(rfisService: RfisService);
    create(projectId: string, createDto: CreateRFIDto, userId: string): Promise<{
        status: string;
        title: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        dueDate: Date | null;
        question: string;
        answer: string | null;
    }>;
    findAll(projectId: string, status?: RFIStatus): Promise<{
        status: string;
        title: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        dueDate: Date | null;
        question: string;
        answer: string | null;
    }[]>;
    getOverdue(projectId: string): Promise<({
        project: {
            title: string;
            id: string;
        };
    } & {
        status: string;
        title: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        dueDate: Date | null;
        question: string;
        answer: string | null;
    })[]>;
    findOne(id: string): Promise<{
        project: {
            status: string;
            title: string;
            id: string;
        };
    } & {
        status: string;
        title: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        dueDate: Date | null;
        question: string;
        answer: string | null;
    }>;
    update(id: string, updateDto: UpdateRFIDto, userId: string): Promise<{
        status: string;
        title: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        dueDate: Date | null;
        question: string;
        answer: string | null;
    }>;
}
//# sourceMappingURL=rfis.controller.d.ts.map