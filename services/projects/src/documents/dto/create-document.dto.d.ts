export declare enum DocumentCategory {
    CONTRACT = "contract",
    DRAWING = "drawing",
    SPEC = "spec",
    PHOTO = "photo",
    INVOICE = "invoice",
    OTHER = "other"
}
export declare class CreateDocumentDto {
    title: string;
    key: string;
    category: DocumentCategory;
    size?: number;
    mimeType?: string;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=create-document.dto.d.ts.map