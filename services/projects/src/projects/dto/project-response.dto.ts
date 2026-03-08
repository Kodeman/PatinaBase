import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Project Response DTO
 * Excludes sensitive internal fields
 */
@Exclude()
export class ProjectResponseDto {
  @Expose()
  @ApiProperty({ description: 'Project ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Proposal ID', nullable: true, example: '123e4567-e89b-12d3-a456-426614174001' })
  proposalId: string | null;

  @Expose()
  @ApiProperty({ description: 'Project title', example: 'Modern Living Room Redesign' })
  title: string;

  @Expose()
  @ApiProperty({ description: 'Client ID', example: '123e4567-e89b-12d3-a456-426614174002' })
  clientId: string;

  @Expose()
  @ApiProperty({ description: 'Designer ID', example: '123e4567-e89b-12d3-a456-426614174003' })
  designerId: string;

  @Expose()
  @ApiProperty({
    description: 'Project status',
    enum: ['draft', 'active', 'substantial_completion', 'closed'],
    example: 'active',
  })
  status: string;

  @Expose()
  @ApiProperty({ description: 'Project start date', nullable: true })
  startDate: Date | null;

  @Expose()
  @ApiProperty({ description: 'Planned end date', nullable: true })
  endDate: Date | null;

  @Expose()
  @ApiProperty({ description: 'Actual end date', nullable: true })
  actualEnd: Date | null;

  @Expose()
  @ApiProperty({ description: 'Budget amount (decimal)', nullable: true, example: '50000.00' })
  budget: string | null;

  @Expose()
  @ApiProperty({ description: 'Currency code', example: 'USD' })
  currency: string;

  @Expose()
  @ApiProperty({ description: 'Project description', nullable: true })
  description: string | null;

  @Expose()
  @ApiProperty({ description: 'Project creation date' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Project last update date' })
  updatedAt: Date;

  // EXCLUDED FIELDS:
  // - metadata (internal)

  static fromPrisma(project: any): ProjectResponseDto | undefined {
    if (!project) return undefined;
    const dto = new ProjectResponseDto();

    dto.id = project.id;
    dto.proposalId = project.proposalId;
    dto.title = project.title;
    dto.clientId = project.clientId;
    dto.designerId = project.designerId;
    dto.status = project.status;
    dto.startDate = project.startDate;
    dto.endDate = project.endDate;
    dto.actualEnd = project.actualEnd;

    // Transform Decimal to string
    dto.budget = project.budget ? project.budget.toString() : null;
    dto.currency = project.currency;

    dto.description = project.description;
    dto.createdAt = project.createdAt;
    dto.updatedAt = project.updatedAt;

    return dto;
  }

  static fromPrismaMany(projects: any[]): ProjectResponseDto[] {
    return (
      projects?.map((p) => this.fromPrisma(p)).filter((p): p is ProjectResponseDto => p !== undefined) || []
    );
  }
}
