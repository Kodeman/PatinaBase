import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto, DocumentCategory } from './dto/create-document.dto';
export declare class DocumentsService {
    private prisma;
    private eventEmitter;
    private readonly logger;
    constructor(prisma: PrismaService, eventEmitter: EventEmitter2);
    create(projectId: string, createDto: CreateDocumentDto, uploadedBy: string): Promise<{
        key: string;
        title: string;
        id: string;
        version: number;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        fileType: string | null;
        fileSize: number | null;
    }>;
    findAll(projectId: string, category?: DocumentCategory): Promise<{
        key: string;
        title: string;
        id: string;
        version: number;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        fileType: string | null;
        fileSize: number | null;
    }[]>;
    findOne(id: string): Promise<{
        project: {
            title: string;
            id: string;
        };
    } & {
        key: string;
        title: string;
        id: string;
        version: number;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        fileType: string | null;
        fileSize: number | null;
    }>;
    getVersions(projectId: string, title: string): Promise<{
        key: string;
        title: string;
        id: string;
        version: number;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        fileType: string | null;
        fileSize: number | null;
    }[]>;
    remove(id: string, userId: string): Promise<{
        message: string;
    }>;
}
//# sourceMappingURL=documents.service.d.ts.map