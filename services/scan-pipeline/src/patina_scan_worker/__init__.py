"""Patina Field Capture scan-pipeline reconstruction worker.

A pull-based, zero-ingress worker that turns an uploaded capture bundle into a
versioned, tolerance-stamped Room File deliverable. It claims work from the
existing ``agent_tasks`` queue (never a parallel queue), reaches production over
outbound HTTPS only (Supabase PostgREST + Storage), and runs natively under
systemd on a Linux box.

Design authority: docs/design/field-capture/scan-pipeline-worker-design.md (R109).
Stages: ingest (this build, item 9) → solve (item 10) → drawings (item 11).
"""

__version__ = "0.1.0"
