export declare enum TimelinePhase {
    PLANNING = "planning",
    DESIGN = "design",
    PROCUREMENT = "procurement",
    CONSTRUCTION = "construction",
    COMPLETION = "completion"
}
export declare class CreateTimelineSegmentDto {
    title: string;
    description?: string;
    phase: TimelinePhase;
    startDate: string;
    endDate: string;
    progress?: number;
    dependencies?: string[];
    deliverables?: string[];
    order?: number;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=create-timeline-segment.dto.d.ts.map