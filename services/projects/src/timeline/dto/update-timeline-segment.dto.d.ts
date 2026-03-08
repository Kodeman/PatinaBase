import { CreateTimelineSegmentDto } from './create-timeline-segment.dto';
export declare enum TimelineSegmentStatus {
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    DELAYED = "delayed"
}
declare const UpdateTimelineSegmentDto_base: import("@nestjs/common").Type<Partial<CreateTimelineSegmentDto>>;
export declare class UpdateTimelineSegmentDto extends UpdateTimelineSegmentDto_base {
    status?: TimelineSegmentStatus;
}
export {};
//# sourceMappingURL=update-timeline-segment.dto.d.ts.map