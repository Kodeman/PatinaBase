-- Migration: 00118_client_invitations
-- Magic-link invitations from designers to prospective clients.
-- Used by the `client-invite` edge function.

CREATE TABLE IF NOT EXISTS public.client_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  designer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  personal_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_invitations_token ON public.client_invitations(token);
CREATE INDEX IF NOT EXISTS idx_client_invitations_email ON public.client_invitations(lower(email));
CREATE INDEX IF NOT EXISTS idx_client_invitations_designer ON public.client_invitations(designer_id);

ALTER TABLE public.client_invitations ENABLE ROW LEVEL SECURITY;

-- Designers can read invitations they sent.
CREATE POLICY client_invitations_designer_read
  ON public.client_invitations
  FOR SELECT
  TO authenticated
  USING (designer_id = auth.uid());

-- Designers can create invitations for themselves.
CREATE POLICY client_invitations_designer_insert
  ON public.client_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (designer_id = auth.uid());

-- Designers can revoke (delete) their own pending invitations.
CREATE POLICY client_invitations_designer_delete
  ON public.client_invitations
  FOR DELETE
  TO authenticated
  USING (designer_id = auth.uid() AND accepted_at IS NULL);

-- No public/anon SELECT policy: token lookups happen server-side via the
-- service role (edge function or Next.js admin client).
COMMENT ON TABLE public.client_invitations IS
  'Magic-link invitations sent by designers to clients. Token lookups go through the client-invite edge function (service role).';
