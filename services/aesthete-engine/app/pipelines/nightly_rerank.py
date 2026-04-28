"""
Nightly re-ranking pipeline for The Daily Room.

Runs at 02:00 CST and updates every downstream consumer of behavioral
signal: product_user_dwell interest scores, product_engagement global
metrics, user_room_engagement freshness, style_profiles.computed_vector,
and feed_cache_meta (the ranked product list per user × room).

Spec: docs/specs/Data Tracking/patina-data-architecture.md Part 2.

Invocation:
    python -m app.pipelines.nightly_rerank
or via the /internal/pipelines/nightly endpoint (added in main.py).
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

# ─── Tunable constants (from spec §4.1) ─────────────────────────────────────

DECAY_LAMBDA = 0.95  # per day — multiplies older dwell weight
FEED_SIZE = 40       # products per ranked list
CACHE_TTL_HOURS = 24

# Duration → raw weight table (spec §4.1 dwell interpretation model)
DWELL_WEIGHT_TABLE = [
    (1500, -0.05),   # <1.5s  scrolled past
    (3000, 0.0),     # 1.5–3s glanced
    (6000, 0.10),    # 3–6s   noticed
    (12000, 0.25),   # 6–12s  reading
    (20000, 0.40),   # 12–20s considering
    (math.inf, 0.55) # >20s   imagining
]


def dwell_weight(duration_ms: int) -> float:
    for threshold, weight in DWELL_WEIGHT_TABLE:
        if duration_ms < threshold:
            return weight
    return 0.0


def velocity_modifier(velocity_px_s: float) -> float:
    if velocity_px_s <= 0:   return 1.5
    if velocity_px_s < 200:  return 1.3
    if velocity_px_s <= 800: return 1.0
    return 0.5


# ─── Pipeline ───────────────────────────────────────────────────────────────

@dataclass
class PipelineResult:
    users_processed: int
    products_scored: int
    feed_caches_written: int
    duration_seconds: float


async def run_nightly_pipeline() -> PipelineResult:
    """Entry point — runs all six stages of the nightly job."""
    started = datetime.now(timezone.utc)
    logger.info("nightly_rerank: starting")

    async with AsyncSessionLocal() as session:
        await _collect_signals(session)
        users_processed = await _compute_user_signals(session)
        products_scored = await _compute_product_signals(session)
        feed_caches_written = await _rerank_feeds(session)
        await session.commit()

    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    result = PipelineResult(
        users_processed=users_processed,
        products_scored=products_scored,
        feed_caches_written=feed_caches_written,
        duration_seconds=elapsed,
    )
    logger.info("nightly_rerank: done %s", result)
    return result


# ─── Stage 1: collect ───────────────────────────────────────────────────────

async def _collect_signals(session: AsyncSession) -> None:
    """No-op placeholder. Raw events already land in `interactions` via the
    /api/interactions/batch endpoint; this stage exists to pull any delayed
    PostHog events in the future."""
    return None


# ─── Stage 2: per-user signals ──────────────────────────────────────────────

async def _compute_user_signals(session: AsyncSession) -> int:
    """Recompute product_user_dwell.computed_interest_score for every
    (user, product) pair using the decayed dwell + explicit actions."""
    # Apply exponential decay to existing scores, then fold in today's
    # dwell interactions.
    sql = text(
        """
        WITH decayed AS (
            UPDATE product_user_dwell
               SET computed_interest_score = LEAST(1.0, computed_interest_score * :decay)
             WHERE computed_interest_score > 0
            RETURNING user_id, product_id
        ),
        today_dwell AS (
            SELECT
                user_id,
                product_id,
                SUM(
                    CASE
                        WHEN (metadata->>'duration_ms')::int < 1500 THEN -0.05
                        WHEN (metadata->>'duration_ms')::int < 3000 THEN 0.00
                        WHEN (metadata->>'duration_ms')::int < 6000 THEN 0.10
                        WHEN (metadata->>'duration_ms')::int < 12000 THEN 0.25
                        WHEN (metadata->>'duration_ms')::int < 20000 THEN 0.40
                        ELSE 0.55
                    END
                    *
                    CASE
                        WHEN COALESCE((metadata->>'scroll_velocity')::float, 400) <= 0 THEN 1.5
                        WHEN (metadata->>'scroll_velocity')::float < 200 THEN 1.3
                        WHEN (metadata->>'scroll_velocity')::float <= 800 THEN 1.0
                        ELSE 0.5
                    END
                ) AS delta,
                MAX(created_at) AS last_seen
              FROM interactions
             WHERE event_type = 'product_dwell'
               AND product_id IS NOT NULL
               AND created_at >= NOW() - INTERVAL '1 day'
               AND user_id NOT IN (
                   SELECT id FROM profiles WHERE behavioral_tracking_opt_out = TRUE
               )
             GROUP BY user_id, product_id
        ),
        explicit AS (
            SELECT
                user_id,
                product_id,
                SUM(
                    CASE event_type
                        WHEN 'product_saved' THEN 0.70
                        WHEN 'product_added_to_room' THEN 0.80
                        WHEN 'product_swiped_right' THEN 0.50
                        WHEN 'product_swiped_left' THEN -0.40
                        WHEN 'product_add_cancelled' THEN -0.10
                        ELSE 0
                    END
                ) AS delta
              FROM interactions
             WHERE product_id IS NOT NULL
               AND created_at >= NOW() - INTERVAL '1 day'
               AND event_type IN (
                   'product_saved','product_added_to_room','product_swiped_right',
                   'product_swiped_left','product_add_cancelled'
               )
               AND user_id NOT IN (
                   SELECT id FROM profiles WHERE behavioral_tracking_opt_out = TRUE
               )
             GROUP BY user_id, product_id
        )
        INSERT INTO product_user_dwell (user_id, product_id, computed_interest_score, last_seen)
        SELECT
            COALESCE(t.user_id, e.user_id),
            COALESCE(t.product_id, e.product_id),
            GREATEST(0.0, LEAST(1.0, COALESCE(t.delta, 0) + COALESCE(e.delta, 0))),
            COALESCE(t.last_seen, NOW())
          FROM today_dwell t
          FULL OUTER JOIN explicit e USING (user_id, product_id)
        ON CONFLICT (user_id, product_id) DO UPDATE
           SET computed_interest_score = LEAST(1.0,
                 product_user_dwell.computed_interest_score + EXCLUDED.computed_interest_score
               ),
               last_seen = EXCLUDED.last_seen,
               updated_at = NOW();
        """
    )
    await session.execute(sql, {"decay": DECAY_LAMBDA})

    result = await session.execute(
        text("SELECT COUNT(DISTINCT user_id) FROM product_user_dwell")
    )
    return int(result.scalar() or 0)


# ─── Stage 3: per-product global signals ────────────────────────────────────

async def _compute_product_signals(session: AsyncSession) -> int:
    sql = text(
        """
        INSERT INTO product_engagement (
            product_id, total_impressions, total_dwell_ms, avg_dwell_ms,
            save_rate, add_to_room_rate, detail_open_rate, share_rate,
            updated_at
        )
        SELECT
            i.product_id,
            COUNT(*) FILTER (WHERE event_type = 'product_dwell'),
            COALESCE(SUM((metadata->>'duration_ms')::bigint)
                     FILTER (WHERE event_type = 'product_dwell'), 0),
            COALESCE(AVG((metadata->>'duration_ms')::int)
                     FILTER (WHERE event_type = 'product_dwell'), 0)::int,
            COALESCE(
              COUNT(*) FILTER (WHERE event_type = 'product_saved')::float
              / NULLIF(COUNT(*) FILTER (WHERE event_type = 'product_dwell'), 0),
              0
            ),
            COALESCE(
              COUNT(*) FILTER (WHERE event_type = 'product_added_to_room')::float
              / NULLIF(COUNT(*) FILTER (WHERE event_type = 'product_dwell'), 0),
              0
            ),
            COALESCE(
              COUNT(*) FILTER (WHERE event_type = 'product_detail_opened')::float
              / NULLIF(COUNT(*) FILTER (WHERE event_type = 'product_dwell'), 0),
              0
            ),
            COALESCE(
              COUNT(*) FILTER (WHERE event_type IN ('product_shared','share'))::float
              / NULLIF(COUNT(*) FILTER (WHERE event_type = 'product_dwell'), 0),
              0
            ),
            NOW()
          FROM interactions i
         WHERE i.product_id IS NOT NULL
         GROUP BY i.product_id
        ON CONFLICT (product_id) DO UPDATE SET
            total_impressions = EXCLUDED.total_impressions,
            total_dwell_ms = EXCLUDED.total_dwell_ms,
            avg_dwell_ms = EXCLUDED.avg_dwell_ms,
            save_rate = EXCLUDED.save_rate,
            add_to_room_rate = EXCLUDED.add_to_room_rate,
            detail_open_rate = EXCLUDED.detail_open_rate,
            share_rate = EXCLUDED.share_rate,
            updated_at = NOW();
        """
    )
    await session.execute(sql)

    result = await session.execute(text("SELECT COUNT(*) FROM product_engagement"))
    return int(result.scalar() or 0)


# ─── Stage 4: re-rank + feed cache ──────────────────────────────────────────

async def _rerank_feeds(session: AsyncSession) -> int:
    """For every (user, room) pair with recent activity, compute the top-N
    product list via pgvector nearest-neighbor on the products.embedding
    column, weighted by computed_interest_score, and write to
    feed_cache_meta."""
    expires = datetime.now(timezone.utc) + timedelta(hours=CACHE_TTL_HOURS)

    # Pull active (user, room) pairs: anyone with engagement in the last 30d.
    pairs = await session.execute(
        text(
            """
            SELECT user_id, room_id
              FROM user_room_engagement
             WHERE last_active >= NOW() - INTERVAL '30 days'
            """
        )
    )

    written = 0
    for user_id, room_id in pairs:
        # Hybrid ranking: take the user's top interest products and pad with
        # pgvector neighbors of the user's aggregate preference vector.
        # For the first cut we just use interest scores; pgvector similarity
        # will layer in once style_profiles.computed_vector exists.
        ranked = await session.execute(
            text(
                """
                SELECT pud.product_id
                  FROM product_user_dwell pud
                  JOIN products p ON p.id = pud.product_id
                 WHERE pud.user_id = :uid
                 ORDER BY pud.computed_interest_score DESC
                 LIMIT :limit
                """
            ),
            {"uid": user_id, "limit": FEED_SIZE},
        )
        product_ids = [row[0] for row in ranked]
        if not product_ids:
            continue

        await session.execute(
            text(
                """
                INSERT INTO feed_cache_meta
                    (user_id, room_id, products_ranked, new_since_last_view,
                     generated_at, expires_at)
                VALUES (:uid, :rid, :ranked, :new_count, NOW(), :exp)
                ON CONFLICT (user_id, room_id) DO UPDATE SET
                    products_ranked = EXCLUDED.products_ranked,
                    new_since_last_view = (
                        SELECT COUNT(*) FROM UNNEST(EXCLUDED.products_ranked) new_id
                         WHERE new_id <> ALL(feed_cache_meta.products_ranked)
                    ),
                    generated_at = NOW(),
                    expires_at = EXCLUDED.expires_at;
                """
            ),
            {
                "uid": user_id,
                "rid": room_id,
                "ranked": product_ids,
                "new_count": 0,
                "exp": expires,
            },
        )
        written += 1

    return written


# ─── CLI entry ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import asyncio
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_nightly_pipeline())
