"""``patina-scan-worker`` console entry point.

Subcommands (design §4):
  run [--once]   long-lived claim loop; --once claims-and-drains one batch then exits
  once           alias for `run --once` (cron-style / manual re-drain / debugging)
  doctor         preflight, no queue interaction (§6)
"""

from __future__ import annotations

import argparse
import logging
import sys

from .config import ConfigError, settings_from_env
from .doctor import doctor as run_doctor


def _configure_logging(level_name: str) -> None:
    level = getattr(logging, level_name.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def _run(once: bool) -> int:
    from .worker import run  # deferred: avoids importing httpx for `doctor` if unused

    try:
        settings = settings_from_env()
    except ConfigError as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 2
    _configure_logging(settings.log_level)
    tally = run(settings, once=once)
    if once:
        logging.getLogger("patina_scan_worker.cli").info("drain complete: %s", tally)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="patina-scan-worker")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_run = sub.add_parser("run", help="claim loop (long-lived)")
    p_run.add_argument(
        "--once", action="store_true",
        help="claim-and-drain one batch then exit (cron-style / debugging)",
    )

    sub.add_parser("once", help="alias for `run --once`")
    sub.add_parser("doctor", help="preflight: env / DB / Storage / GPU / disk")

    args = parser.parse_args(argv)

    if args.cmd == "doctor":
        return run_doctor()
    if args.cmd == "once":
        return _run(once=True)
    if args.cmd == "run":
        return _run(once=args.once)
    parser.error(f"unknown command {args.cmd!r}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
