export declare class ApproveDto {
    comments?: string;
    signature?: {
        data: string;
        timestamp: string;
        ipAddress?: string;
    };
    metadata?: Record<string, any>;
}
export declare class RejectDto {
    reason: string;
    comments?: string;
    metadata?: Record<string, any>;
}
export declare class DiscussDto {
    comment: string;
    metadata?: Record<string, any>;
}
export declare class SignatureDto {
    data: string;
    signerName?: string;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=approval-action.dto.d.ts.map