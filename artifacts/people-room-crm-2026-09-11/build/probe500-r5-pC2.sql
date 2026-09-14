\pset pager off
BEGIN;
SET LOCAL search_path TO public;
SELECT 'before' AS at, count(*) AS runs FROM job_runs WHERE job_name='compliance-document-expiry-sweep';
SELECT 'call1' AS at, public.sweep_compliance_expiries() AS r;
SELECT 'after1' AS at, count(*) AS runs FROM job_runs WHERE job_name='compliance-document-expiry-sweep';
SELECT 'notices1' AS at, count(*) FROM studio_compliance_notices;
SELECT 'call2' AS at, public.sweep_compliance_expiries() AS r;
SELECT 'after2' AS at, count(*) AS runs FROM job_runs WHERE job_name='compliance-document-expiry-sweep';
SELECT 'runs' AS at, id, status, detail FROM job_runs WHERE job_name='compliance-document-expiry-sweep' ORDER BY id;
ROLLBACK;
