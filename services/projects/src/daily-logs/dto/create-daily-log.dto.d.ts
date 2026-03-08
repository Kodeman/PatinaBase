export declare enum Weather {
    GOOD = "Good",
    FAIR = "Fair",
    POOR = "Poor",
    NA = "N/A"
}
export declare class CreateDailyLogDto {
    date: string;
    notes?: string;
    weather?: Weather;
    photos?: string[];
    attendees?: string[];
    activities?: string[];
}
//# sourceMappingURL=create-daily-log.dto.d.ts.map