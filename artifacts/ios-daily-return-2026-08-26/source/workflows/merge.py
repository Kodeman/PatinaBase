#!/usr/bin/env python3
"""Merge collated findings (research/30-collated-findings.json) with the three
verdict files (33-verify-code-truth.json, 34-verify-canon-truth.json,
35-verify-repro.json) into a verified/contested/unverified/refuted set.

Rules (per the scribe brief):
  - A finding is REFUTED if any verifier refuted it and no other verifier
    confirmed it (confirmed or adjusted count as "confirmed") with contrary
    evidence. When verifiers disagree (>=1 refute AND >=1 confirm), the
    finding is kept as CONTESTED with both sides' notes attached, and its
    confidence is lowered by 0.2 (floored at 0.0).
  - status = verified (>=1 confirm, 0 refute) | contested (>=1 confirm and
    >=1 refute) | unverified (only "unable" verdicts and/or files that never
    mention the id -- no confirm, no refute) | refuted (>=1 refute, 0 confirm
    -- dropped from 31-* into 32-refuted-findings.md).
  - corrected_refs / corrected_severity / corrected_observation are applied
    to VERIFIED findings only, per-field, from confirm-category verdicts, in
    priority order code_truth > repro > canon_truth (the deepest per-field
    static check, then live reproduction, then the canon/freshness pass,
    which occasionally also spot-checks code). The pre-correction value is
    preserved as original_severity / original_observation when a correction
    changes it, and which verifier supplied each correction is recorded in
    corrections_applied.
  - CONTESTED and UNVERIFIED findings are left with their original
    severity/observation/refs untouched (both sides are shown instead of
    silently picking a winner); a missing verdict file is skipped and noted
    rather than treated as a refutation or a confirmation.

Outputs:
  research/31-verified-findings.json  -- verified + contested + unverified
  research/31-verified-findings.md    -- same, as a table + per-item detail
  research/32-refuted-findings.md     -- what was dropped and why
"""
import json
import os

ROOT = "/Users/kody/Code/patina-merged/artifacts/ios-daily-return-2026-08-26"
RESEARCH = os.path.join(ROOT, "research")

COLLATED_PATH = os.path.join(RESEARCH, "30-collated-findings.json")

VERDICT_FILES = {
    "code_truth": "33-verify-code-truth.json",
    "canon_truth": "34-verify-canon-truth.json",
    "repro": "35-verify-repro.json",
}
LABELS = {
    "code_truth": "Code-truth (33)",
    "canon_truth": "Canon-truth (34)",
    "repro": "Repro (35)",
}
# Priority for applying corrections when more than one confirm-category
# verifier supplies a value for the same field.
PRIORITY = ["code_truth", "repro", "canon_truth"]

CONFIRM_VERDICTS = {"confirmed", "adjusted"}
REFUTE_VERDICTS = {"refuted"}
UNABLE_VERDICTS = {"unable"}

SEVERITY_RANK = {"S0": 0, "S1": 1, "S2": 2, "S3": 3}


def load_json(path):
    with open(path) as f:
        return json.load(f)


def shots_cell(shots, limit=3):
    if not shots:
        return ""
    if len(shots) <= limit:
        return ", ".join(shots)
    return ", ".join(shots[:limit]) + f" (+{len(shots) - limit} more)"


def main():
    collated = load_json(COLLATED_PATH)

    verdict_index = {}
    missing_files = []
    for key, fname in VERDICT_FILES.items():
        path = os.path.join(RESEARCH, fname)
        if not os.path.exists(path):
            missing_files.append(fname)
            verdict_index[key] = {}
            continue
        entries = load_json(path)
        verdict_index[key] = {e["id"]: e for e in entries}

    verified_out = []
    refuted_out = []

    counts = {"verified": 0, "contested": 0, "unverified": 0, "refuted": 0}

    for finding in collated:
        fid = finding["id"]
        per_file = {key: verdict_index[key].get(fid) for key in VERDICT_FILES}

        confirm_files = [k for k in VERDICT_FILES if per_file[k] and per_file[k]["verdict"] in CONFIRM_VERDICTS]
        refute_files = [k for k in VERDICT_FILES if per_file[k] and per_file[k]["verdict"] in REFUTE_VERDICTS]
        unable_files = [k for k in VERDICT_FILES if per_file[k] and per_file[k]["verdict"] in UNABLE_VERDICTS]
        absent_files = [k for k in VERDICT_FILES if per_file[k] is None]

        if refute_files and confirm_files:
            status = "contested"
        elif refute_files and not confirm_files:
            status = "refuted"
        elif confirm_files:
            status = "verified"
        else:
            status = "unverified"

        # Transparency block: every verifier's raw verdict + note (+ any
        # corrected fields it supplied), or "absent" if the file never
        # mentions this id (35-verify-repro.json only covers a 40-item
        # subset).
        verdicts_block = {}
        for key in VERDICT_FILES:
            entry = per_file[key]
            if entry is None:
                verdicts_block[key] = {"verifier": LABELS[key], "verdict": "absent", "note": None}
                continue
            block = {"verifier": LABELS[key], "verdict": entry["verdict"], "note": entry.get("note")}
            for field in ("corrected_refs", "corrected_severity", "corrected_observation"):
                if entry.get(field):
                    block[field] = entry[field]
            verdicts_block[key] = block

        merged = dict(finding)
        merged["status"] = status
        merged["verdicts"] = verdicts_block

        if status == "verified":
            sev_src = obs_src = refs_src = None
            for key in PRIORITY:
                if key not in confirm_files:
                    continue
                entry = per_file[key]
                if sev_src is None and entry.get("corrected_severity"):
                    if entry["corrected_severity"] != merged["severity"]:
                        merged["original_severity"] = merged["severity"]
                    merged["severity"] = entry["corrected_severity"]
                    sev_src = key
                if obs_src is None and entry.get("corrected_observation"):
                    if entry["corrected_observation"] != merged["observation"]:
                        merged["original_observation"] = merged["observation"]
                    merged["observation"] = entry["corrected_observation"]
                    obs_src = key
                if refs_src is None and entry.get("corrected_refs"):
                    merged["evidence"] = dict(merged["evidence"])
                    merged["evidence"]["original_refs"] = merged["evidence"].get("refs")
                    merged["evidence"]["refs"] = entry["corrected_refs"]
                    refs_src = key
            corrections = {}
            if sev_src:
                corrections["severity"] = LABELS[sev_src]
            if obs_src:
                corrections["observation"] = LABELS[obs_src]
            if refs_src:
                corrections["refs"] = LABELS[refs_src]
            if corrections:
                merged["corrections_applied"] = corrections

        elif status == "contested":
            merged["confidence"] = round(max(0.0, finding.get("confidence", 0.0) - 0.2), 3)
            merged["contested_because"] = {
                "refuted_by": [{"verifier": LABELS[k], "note": per_file[k]["note"]} for k in refute_files],
                "confirmed_by": [{"verifier": LABELS[k], "note": per_file[k]["note"]} for k in confirm_files],
            }

        elif status == "unverified":
            merged["unverified_because"] = {
                "unable": [{"verifier": LABELS[k], "note": per_file[k]["note"]} for k in unable_files],
                "absent": [LABELS[k] for k in absent_files],
            }

        elif status == "refuted":
            merged["refuted_because"] = {
                "refuted_by": [{"verifier": LABELS[k], "note": per_file[k]["note"]} for k in refute_files],
                "absent": [LABELS[k] for k in absent_files],
            }

        counts[status] += 1
        if status == "refuted":
            refuted_out.append(merged)
        else:
            verified_out.append(merged)

    verified_out.sort(key=lambda x: (SEVERITY_RANK.get(x["severity"], 9), -x.get("confidence", 0)))

    # ---------------------------------------------------------------- JSON
    out_json_path = os.path.join(RESEARCH, "31-verified-findings.json")
    with open(out_json_path, "w") as f:
        json.dump(
            {
                "meta": {
                    "source": "30-collated-findings.json",
                    "verdict_files_used": [VERDICT_FILES[k] for k in VERDICT_FILES if k not in [] and os.path.exists(os.path.join(RESEARCH, VERDICT_FILES[k]))],
                    "verdict_files_missing": missing_files,
                    "total_collated": len(collated),
                    "counts": counts,
                },
                "findings": verified_out,
            },
            f,
            indent=2,
        )

    # ------------------------------------------------------------------ MD
    out_md_path = os.path.join(RESEARCH, "31-verified-findings.md")
    lines = []
    lines.append("# Verified findings — The Daily Return (2026-08-26)")
    lines.append("")
    lines.append(
        f"Merged {len(collated)} collated findings against three verdict files "
        f"(code-truth, canon-truth, repro). Result: **{counts['verified']} verified**, "
        f"**{counts['contested']} contested**, **{counts['unverified']} unverified**, "
        f"**{counts['refuted']} refuted** (dropped — see `32-refuted-findings.md`)."
    )
    if missing_files:
        lines.append("")
        lines.append(f"Missing verdict files (skipped, treated as absent for every id): {', '.join(missing_files)}.")
    lines.append("")
    lines.append("| id | status | title | severity | confidence | seats | class | shots |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for m in verified_out:
        seats = ",".join(m.get("seats", []))
        lines.append(
            f"| {m['id']} | {m['status']} | {m['title']} | {m['severity']} | {m.get('confidence','')} | "
            f"{seats} | {m.get('class','')} | {shots_cell(m.get('evidence', {}).get('shots', []))} |"
        )
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Detail")
    lines.append("")
    for m in verified_out:
        lines.append(f"### {m['id']} — {m['title']} [{m['status']}]")
        lines.append("")
        lines.append(f"**Severity:** {m['severity']}" + (f" (was {m['original_severity']})" if m.get("original_severity") else "") + f" · **Confidence:** {m.get('confidence','')} · **Class:** {m.get('class','')} · **Seats:** {', '.join(m.get('seats', []))}")
        lines.append("")
        lines.append(m.get("observation", ""))
        if m.get("original_observation"):
            lines.append("")
            lines.append(f"*As originally filed: {m['original_observation']}*")
        if m.get("corrections_applied"):
            lines.append("")
            lines.append(f"*Corrections applied from: {', '.join(f'{k}←{v}' for k, v in m['corrections_applied'].items())}*")
        refs = m.get("evidence", {}).get("refs", [])
        if refs:
            lines.append("")
            lines.append("Refs: " + "; ".join(refs))
        shots = m.get("evidence", {}).get("shots", [])
        if shots:
            lines.append("")
            lines.append("Shots: " + ", ".join(shots))
        if m["status"] == "contested":
            lines.append("")
            lines.append("**Contested** —")
            for r in m["contested_because"]["refuted_by"]:
                lines.append(f"- REFUTED by {r['verifier']}: {r['note']}")
            for c in m["contested_because"]["confirmed_by"]:
                lines.append(f"- CONFIRMED by {c['verifier']}: {c['note']}")
        if m["status"] == "unverified":
            lines.append("")
            lines.append("**Unverified** —")
            for u in m["unverified_because"]["unable"]:
                lines.append(f"- UNABLE ({u['verifier']}): {u['note']}")
            if m["unverified_because"]["absent"]:
                lines.append(f"- No verdict recorded from: {', '.join(m['unverified_because']['absent'])}")
        lines.append("")
    with open(out_md_path, "w") as f:
        f.write("\n".join(lines) + "\n")

    # ------------------------------------------------------------ refuted
    out_refuted_path = os.path.join(RESEARCH, "32-refuted-findings.md")
    rlines = []
    rlines.append("# Refuted findings — The Daily Return (2026-08-26)")
    rlines.append("")
    rlines.append(
        f"{len(refuted_out)} of {len(collated)} collated findings were dropped: refuted by at least one "
        "verifier with no other verifier confirming the claim with contrary evidence. Authors: read the "
        "refuting note below before re-filing anything similar."
    )
    rlines.append("")
    if not refuted_out:
        rlines.append(
            "**None.** Every finding that drew a `refuted` verdict from one verifier was independently "
            "confirmed (`confirmed`/`adjusted`) by at least one of the other two verifiers, so per the merge "
            "rule it was kept as **contested** in `31-verified-findings.md` (both sides' notes attached, "
            "confidence lowered by 0.2) rather than dropped here. See the `status: contested` rows there — "
            "notably the shared refuted set from code-truth (`F21, F33, F35, F39, F57, F75, F82, F88, F94, "
            "F116, F149, F166, F181`) and the repro refutation (`F18`), each corroborated elsewhere."
        )
    else:
        for m in refuted_out:
            rlines.append(f"## {m['id']} — {m['title']}")
            rlines.append("")
            rlines.append(f"Originally filed: {m['severity']} · confidence {m.get('confidence','')} · seats {', '.join(m.get('seats', []))} · class {m.get('class','')}")
            rlines.append("")
            rlines.append(f"**As filed:** {m.get('observation','')}")
            rlines.append("")
            for r in m["refuted_because"]["refuted_by"]:
                rlines.append(f"**REFUTED by {r['verifier']}:** {r['note']}")
                rlines.append("")
            if m["refuted_because"]["absent"]:
                rlines.append(f"*(No verdict recorded from: {', '.join(m['refuted_because']['absent'])}.)*")
                rlines.append("")
    with open(out_refuted_path, "w") as f:
        f.write("\n".join(rlines) + "\n")

    print(json.dumps({
        "counts": counts,
        "missing_files": missing_files,
        "out_json": out_json_path,
        "out_md": out_md_path,
        "out_refuted": out_refuted_path,
    }, indent=2))


if __name__ == "__main__":
    main()
