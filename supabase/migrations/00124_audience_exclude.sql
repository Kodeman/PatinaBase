-- Audience exclude-segment composition
--
-- No schema change. The campaigns.audience_segment JSONB column already exists
-- and is used additively. Documents the extended shape:
--
--   campaigns.audience_segment :=
--     {
--       segment_id?: uuid,             -- pre-saved AudienceSegment id (legacy field)
--       rules?: SegmentRules,          -- inline rules { logic, conditions[] }
--       exclude_segment_ids?: uuid[],  -- audience_segments to subtract from final audience
--       user_ids?: uuid[],             -- audience_type='individual'
--       role?: text,                   -- legacy convenience
--       is_founding_circle?: boolean,  -- legacy convenience
--       engagement_tier?: text         -- legacy convenience
--     }
--
-- The notification engine (packages/notifications/src/audience.ts resolveAudience)
-- and supabase/functions/campaign-dispatch/index.ts both honor exclude_segment_ids
-- by resolving each excluded segment's rules and subtracting matched user_ids
-- from the resolved audience. Suppression filters (opt-out, hard-bounce, frequency
-- cap) continue to apply on top.

COMMENT ON COLUMN campaigns.audience_segment IS
  'Audience definition: { segment_id?, rules?, exclude_segment_ids?, user_ids?, role?, is_founding_circle?, engagement_tier? }. exclude_segment_ids subtracts members of those audience_segments from the resolved audience.';
