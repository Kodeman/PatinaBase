-- Trigger functions are internal implementation details, not PostgREST RPCs.
-- PostgreSQL checks trigger-function privileges when the trigger is created,
-- so runtime table writes do not require callers to retain EXECUTE.

REVOKE ALL ON FUNCTION public.spec_book_validate_na_declarations()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.spec_book_bump_spec_version()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.spec_book_validate_working_links()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.spec_book_reject_immutable_change()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.spec_book_guard_revision_update()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.spec_book_guard_artifact_update()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.spec_book_set_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.spec_book_attach_ffe_line()
  FROM PUBLIC, anon, authenticated, service_role;
