-- 00144_user_settings_preferred_home_mode.sql
--
-- Adds preferred_home_mode to user_settings so dual-role users
-- (e.g., super_admins who carry both consumer and designer rows in
-- user_roles) can pin which home surface the iOS app renders on
-- launch. NULL = "auto" — the client decides; for dual-role users the
-- iOS client defaults auto to designer.
--
-- Used by:
--   • apps/mobile/Patina/Patina/Services/Settings/SettingsService.swift
--   • apps/mobile/Patina/Patina/ContentView.swift (mainHomeView routing)
--   • apps/mobile/Patina/Patina/Features/Account/AccountView.swift (Workspace row)

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS preferred_home_mode TEXT
  CHECK (preferred_home_mode IN ('consumer', 'designer'));

COMMENT ON COLUMN user_settings.preferred_home_mode IS
  'Preferred home surface for dual-role users. NULL = auto (client decides). Values: consumer | designer.';
