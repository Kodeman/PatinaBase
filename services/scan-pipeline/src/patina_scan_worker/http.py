"""Shared httpx session — the worker's single outbound channel.

All traffic is outbound HTTPS to Strata (PostgREST + Storage); the worker opens
no inbound listener (design §9, zero-ingress). The service-role key is the
worker's only write credential and is sent on every request as both ``apikey``
and ``Authorization: Bearer`` (the Supabase REST + Storage contract). It is held
only in memory here, sourced from the ``EnvironmentFile``.
"""

from __future__ import annotations

import httpx

from .config import Settings


def build_session(settings: Settings) -> httpx.Client:
    return httpx.Client(
        base_url=settings.supabase_url,
        headers={
            "apikey": settings.service_role_key,
            "Authorization": f"Bearer {settings.service_role_key}",
        },
        timeout=settings.http_timeout_s,
    )
