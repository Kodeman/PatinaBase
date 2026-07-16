-- ═══════════════════════════════════════════════════════════════════════════
-- 00335 — device_push_tokens: APNs registration store (Arrival Arc, I66)
--
-- Program: Arrival Arc (Wave 2). The client iOS app registers its APNs device
-- token here; the apns-send edge function reads tokens by user and pushes to
-- api.push.apple.com or api.sandbox.push.apple.com PER TOKEN.
--
-- environment (I66 — the load-bearing column): Patina's Release signing is
-- Apple Development (never a true distribution archive), so every token
-- registered today is a SANDBOX token. The APNs host MUST be chosen from the
-- environment captured at registration — never inferred from build config or a
-- server-side default. A token pushed at the wrong host is a guaranteed
-- BadDeviceToken.
--
-- token is globally UNIQUE: Apple device tokens are per app+device; a token
-- re-registered by a different signed-in user must MOVE to that user (the app
-- upserts on conflict), never fan out pushes to a previous owner.
--
-- RLS: owner-only ALL — the app manages its own tokens (register on launch,
-- delete on sign-out). apns-send reads via service_role (bypasses RLS).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.device_push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null unique,
  platform    text not null default 'ios',
  environment text not null check (environment in ('sandbox','production')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.device_push_tokens is
  'APNs device tokens, one row per registered device token (Arrival Arc, I66). '
  'environment is captured per-token at registration and drives '
  'api.push vs api.sandbox.push host selection in apns-send — today''s builds '
  'sign as Apple Development, so expect sandbox until a true distribution '
  'archive ships. token is globally unique: re-registration by another user '
  'moves the token.';

comment on column public.device_push_tokens.environment is
  'I66: captured per-token at registration (aps-environment entitlement of the '
  'registering build), drives the APNs host per token. NEVER inferred '
  'server-side.';

create index if not exists idx_device_push_tokens_user on public.device_push_tokens(user_id);

drop trigger if exists update_device_push_tokens_updated_at on public.device_push_tokens;
create trigger update_device_push_tokens_updated_at
  before update on public.device_push_tokens
  for each row execute function public.update_updated_at_column();

alter table public.device_push_tokens enable row level security;

drop policy if exists device_push_tokens_owner_all on public.device_push_tokens;
create policy device_push_tokens_owner_all on public.device_push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Owner manages own tokens end-to-end (register, re-register, sign-out delete).
revoke all on public.device_push_tokens from public, anon;
grant select, insert, update, delete on public.device_push_tokens to authenticated;
grant all on public.device_push_tokens to service_role;
