-- Canonical runner entrypoint; the isolated wrapper owns every DB change.
\set ON_ERROR_STOP on
\ir readiness_batch_isolated.psql
