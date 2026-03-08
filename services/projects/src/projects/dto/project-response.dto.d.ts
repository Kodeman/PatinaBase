/**
 * Project Response DTO
 * Excludes sensitive internal fields
 */
export declare class ProjectResponseDto {
    id: string;
    proposalId: string | null;
    title: string;
    clientId: string;
    designerId: string;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
    actualEnd: Date | null;
    budget: string | null;
    currency: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    static fromPrisma(project: any): ProjectResponseDto | undefined;
    static fromPrismaMany(projects: any[]): ProjectResponseDto[];
}
//# sourceMappingURL=project-response.dto.d.ts.map