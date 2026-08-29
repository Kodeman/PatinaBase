#!/usr/bin/env python3
import json, os

BASE = "/Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28"
RES = os.path.join(BASE, "research")

def load(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None

findings = load(os.path.join(RES, "30-collated-findings.json")) or []
code_truth = load(os.path.join(RES, "33-verify-code-truth.json"))
repro = load(os.path.join(BASE, "probe", "34-verify-repro.json"))
canon = load(os.path.join(RES, "35-verify-canon-context.json"))

missing_files = []
def index(lst, name):
    if lst is None:
        missing_files.append(name)
        return {}
    return {row["id"]: row for row in lst}

ct_idx = index(code_truth, "33-verify-code-truth.json")
rp_idx = index(repro, "34-verify-repro.json")
cn_idx = index(canon, "35-verify-canon-context.json")

rows = []
for f in findings:
    fid = f["id"]
    ct = ct_idx.get(fid, {"verdict": "unverified", "reason": "", "evidence": "", "revised_claim": ""})
    rp = rp_idx.get(fid, {"verdict": "unverified", "reason": "", "evidence": "", "revised_claim": ""})
    cn = cn_idx.get(fid, {"verdict": "unverified", "reason": "", "evidence": "", "revised_claim": ""})

    ct_v = ct.get("verdict", "unverified")
    rp_v = rp.get("verdict", "unverified")
    cn_v = cn.get("verdict", "unverified")

    claim = f.get("observation", "")
    if ct_v == "narrows" and ct.get("revised_claim"):
        claim = ct["revised_claim"]

    survives = (ct_v != "misread") and (rp_v != "not-reproduced") and (cn_v != "misread")

    blocked = isinstance(cn_v, str) and cn_v.startswith("blocked:")
    nogo_id = cn_v.split(":", 1)[1] if blocked else None

    row = dict(f)
    row["code_truth"] = ct_v
    row["code_note"] = ct.get("reason", "")
    row["repro"] = rp_v
    row["repro_note"] = rp.get("reason", "")
    row["canon"] = cn_v
    row["canon_note"] = cn.get("reason", "")
    row["claim"] = claim
    row["survives"] = survives
    row["blocked"] = blocked
    row["nogo_id"] = nogo_id
    rows.append(row)

out_json = os.path.join(RES, "31-verified-findings.json")
with open(out_json, "w") as f:
    json.dump(rows, f, indent=2)

total = len(rows)
survivors = [r for r in rows if r["survives"]]
dropped = [r for r in rows if not r["survives"]]
blocked_rows = [r for r in rows if r["blocked"]]

killed_by_ct = [r for r in dropped if r["code_truth"] == "misread"]
killed_by_rp = [r for r in dropped if r["repro"] == "not-reproduced" and r["code_truth"] != "misread"]
killed_by_cn = [r for r in dropped if r["canon"] == "misread" and r["code_truth"] != "misread" and r["repro"] != "not-reproduced"]

def sev_rank(s):
    order = {"blocker": 3, "high": 2, "medium": 1, "low": 0}
    return order.get(s, -1)

survivors_sorted = sorted(
    survivors,
    key=lambda r: (len(r.get("seats", [])), sev_rank(r.get("severity", ""))),
    reverse=True,
)

by_sev = {"blocker": 0, "high": 0, "medium": 0, "low": 0}
for r in survivors:
    sv = r.get("severity", "")
    if sv in by_sev:
        by_sev[sv] += 1

lines = []
lines.append("# Verified Findings — The Document, The Smart Lens (refutation wave)")
lines.append("")
lines.append("## Header / counts")
lines.append(f"- Total findings: {total}")
lines.append(f"- Survivors: {len(survivors)}")
lines.append(f"- Dropped: {len(dropped)}")
lines.append(f"- Killed by code_truth (misread): {len(killed_by_ct)}")
lines.append(f"- Killed by repro (not-reproduced, not already killed by code_truth): {len(killed_by_rp)}")
lines.append(f"- Killed by canon (misread, not already killed above): {len(killed_by_cn)}")
lines.append(f"- Blocked (canon 'blocked:' rows, kept but flagged): {len(blocked_rows)}")
if missing_files:
    lines.append(f"- ⚠ Missing/unparseable verdict files (all ids treated 'unverified' for that refuter): {', '.join(missing_files)}")
else:
    lines.append("- All three refuter files present and parsed for all ids.")

nogo_counts = {}
for r in blocked_rows:
    nogo_counts[r["nogo_id"]] = nogo_counts.get(r["nogo_id"], 0) + 1
if nogo_counts:
    lines.append("- Blocked rows by no-go id: " + ", ".join(f"{k}={v}" for k, v in sorted(nogo_counts.items())))

lines.append("")
lines.append("## Surviving findings (ordered by seat count desc, severity desc)")
lines.append("")
lines.append("| id | title | seats | severity | confidence | width | scroll_state | why_it_blocks | frame_cost_estimate | tasks | code_truth | repro | canon | claim |")
lines.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
for r in survivors_sorted:
    seats = ",".join(r.get("seats", []))
    tasks = ",".join(r.get("task_ids", []))
    claim = str(r.get("claim", "")).replace("|", "\\|").replace("\n", " ")
    title = str(r.get("title", "")).replace("|", "\\|")
    why = str(r.get("why_it_blocks", "")).replace("|", "\\|")
    lines.append(
        f"| {r['id']} | {title} | {len(r.get('seats', []))} | {r.get('severity','')} | {r.get('confidence','')} | "
        f"{r.get('width','')} | {r.get('scroll_state','')} | {why} | {r.get('frame_cost_estimate','')} | {tasks} | "
        f"{r.get('code_truth','')} | {r.get('repro','')} | {r.get('canon','')} | {claim} |"
    )

lines.append("")
lines.append("## Blocked findings (kept, flagged for proposal authors)")
lines.append("")
lines.append("| id | title | no-go | canon_note |")
lines.append("|---|---|---|---|")
for r in blocked_rows:
    title = str(r.get("title", "")).replace("|", "\\|")
    note = str(r.get("canon_note", "")).replace("|", "\\|").replace("\n", " ")
    lines.append(f"| {r['id']} | {title} | {r.get('nogo_id','')} | {note} |")

lines.append("")
lines.append("## Killed findings")
lines.append("")
lines.append("| id | title | killed by | note |")
lines.append("|---|---|---|---|")
for r in dropped:
    title = str(r.get("title", "")).replace("|", "\\|")
    if r["code_truth"] == "misread":
        who = "code_truth"
        note = r.get("code_note", "")
    elif r["repro"] == "not-reproduced":
        who = "repro"
        note = r.get("repro_note", "")
    elif r["canon"] == "misread":
        who = "canon"
        note = r.get("canon_note", "")
    else:
        who = "unknown"
        note = ""
    note = str(note).replace("|", "\\|").replace("\n", " ")
    lines.append(f"| {r['id']} | {title} | {who} | {note} |")

out_md = os.path.join(RES, "31-verified-findings.md")
with open(out_md, "w") as f:
    f.write("\n".join(lines) + "\n")

print(f"total={total} survivors={len(survivors)} dropped={len(dropped)} blocked={len(blocked_rows)}")
print("by_severity(survivors)=", by_sev)
print("json:", out_json)
print("md:", out_md)
