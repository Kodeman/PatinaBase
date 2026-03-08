import { DocumentsService } from './documents.service';
import { CreateDocumentDto, DocumentCategory } from './dto/create-document.dto';
export declare class DocumentsController {
    private readonly documentsService;
    constructor(documentsService: DocumentsService);
    create(projectId: string, createDto: CreateDocumentDto, userId: string): Promise<{
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
    remove(id: string, userId: string): Promise<{
        message: string;
    }>;
}
//# sourceMappingURL=documents.controller.d.ts.map