/**
 * Task Response DTO
 * Excludes sensitive internal fields
 */
export declare class TaskResponseDto {
    id: string;
    projectId: string;
    title: string;
    description: string | null;
    assigneeId: string | null;
    dueDate: Date | null;
    status: string;
    priority: string;
    order: number;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    static fromPrisma(task: any): TaskResponseDto | undefined;
    static fromPrismaMany(tasks: any[]): TaskResponseDto[];
}
//# sourceMappingURL=task-response.dto.d.ts.map