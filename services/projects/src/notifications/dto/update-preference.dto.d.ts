export declare enum NotificationFrequency {
    IMMEDIATE = "immediate",
    DAILY_DIGEST = "daily_digest",
    WEEKLY_DIGEST = "weekly_digest"
}
export declare class QuietHours {
    start?: string;
    end?: string;
}
export declare class UpdatePreferenceDto {
    email?: boolean;
    emailAddress?: string;
    sms?: boolean;
    phoneNumber?: string;
    push?: boolean;
    pushTokens?: string[];
    channels?: Record<string, {
        email?: boolean;
        sms?: boolean;
        push?: boolean;
    }>;
    frequency?: NotificationFrequency;
    quietHours?: QuietHours;
}
//# sourceMappingURL=update-preference.dto.d.ts.map