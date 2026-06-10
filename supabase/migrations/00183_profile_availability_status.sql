-- 00183: Designer availability status (header avatar menu).
--
-- Persists the *declared* status (online/away/busy/offline) the user picks in
-- the portal header so it survives refresh and is observable by other
-- surfaces (e.g. the client portal can later show designer availability next
-- to chat). Live "actually connected" presence is a follow-up; this column is
-- the declared-status half of that model.
--
-- RLS: intentionally no new policies. 00013's policies already give exactly
-- the semantics we want — "Profiles are viewable by everyone" (SELECT) means
-- availability is world-readable BY DESIGN, and "Users can update own
-- profile" restricts writes to the owner.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS availability_status text NOT NULL DEFAULT 'online'
    CHECK (availability_status IN ('online', 'away', 'busy', 'offline')),
  ADD COLUMN IF NOT EXISTS availability_changed_at timestamptz;

-- Realtime: profile UPDATE events must reach subscribed clients so status
-- changes sync across tabs/devices. No-op if the publication is FOR ALL
-- TABLES or already includes profiles.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION
  WHEN duplicate_object OR undefined_object THEN NULL;
END $$;
