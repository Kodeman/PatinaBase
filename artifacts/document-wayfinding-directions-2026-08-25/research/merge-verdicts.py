import json, os

BASE = "/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25"
findings = json.load(open(f"{BASE}/research/30-collated-findings.json"))

def load(path):
    if os.path.exists(path):
        return json.load(open(path))
    return []

code_v = {v["id"]: v for v in load(f"{BASE}/research/33-verify-code-truth.json")}
canon_v = {v["id"]: v for v in load(f"{BASE}/research/34-verify-canon-truth.json")}
repro_v = {v["id"]: v for v in load(f"{BASE}/probe/35-verify-repro.json")}

out = []
for f in findings:
    fid = f["id"]
    cv = code_v.get(fid, {})
    kv = canon_v.get(fid, {})
    rv = repro_v.get(fid, {})

    code_truth = cv.get("verdict", "unverified")
    code_note = cv.get("revised_claim") or cv.get("reason", "")
    canon_truth = kv.get("verdict", "unverified")
    canon_note = kv.get("revised_claim") or kv.get("reason", "")
    repro = rv.get("verdict", "unverified")
    repro_note = rv.get("revised_claim") or rv.get("reason", "")

    if code_truth == "narrows" and cv.get("revised_claim"):
        claim = cv.get("revised_claim")
    else:
        claim = f.get("observation", "")

    survives = (code_truth != "misread") and (canon_truth != "misread") and (repro != "not-reproduced")

    row = dict(f)
    row.update({
        "code_truth": code_truth,
        "code_note": code_note,
        "canon_truth": canon_truth,
        "canon_note": canon_note,
        "repro": repro,
        "repro_note": repro_note,
        "claim": claim,
        "survives": survives,
    })
    out.append(row)

with open(f"{BASE}/research/31-verified-findings.json", "w") as fh:
    json.dump(out, fh, indent=2)

total = len(out)
surviving = sum(1 for r in out if r["survives"])
killed_code = sum(1 for r in out if r["code_truth"] == "misread")
killed_canon = sum(1 for r in out if r["canon_truth"] == "misread")
killed_repro = sum(1 for r in out if r["repro"] == "not-reproduced")
ruled_against = sum(1 for r in out if isinstance(r["canon_truth"], str) and r["canon_truth"].startswith("ruled-against"))
known_open = sum(1 for r in out if isinstance(r["canon_truth"], str) and r["canon_truth"].startswith("known-open"))

sev_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1}

def sev_key(r):
    seats = r.get("seats", []) or []
    sev = str(r.get("severity", "")).lower()
    return (len(seats), sev_rank.get(sev, 0))

surv_rows = sorted([r for r in out if r["survives"]], key=sev_key, reverse=True)
killed_rows = [r for r in out if not r["survives"]]

def killer(r):
    if r["code_truth"] == "misread":
        return "code-truth"
    if r["canon_truth"] == "misread":
        return "canon-truth"
    if r["repro"] == "not-reproduced":
        return "repro"
    return "unknown"

lines = []
lines.append(f"# Verified Findings — The Document Wayfinding Review\n")
lines.append(f"Total findings: {total}  |  Surviving: {surviving}  |  Killed: {total - surviving}\n")
lines.append(f"- Killed by code-truth (misread): {killed_code}")
lines.append(f"- Killed by canon-truth (misread): {killed_canon}")
lines.append(f"- Killed by repro (not-reproduced): {killed_repro}")
lines.append(f"- Ruled-against by canon: {ruled_against}")
lines.append(f"- Known-open per canon: {known_open}\n")

lines.append("## Surviving findings\n")
lines.append("| id | title | seats | severity | confidence | width | flag | tasks | canon_truth | repro | claim |")
lines.append("|---|---|---|---|---|---|---|---|---|---|---|")
for r in surv_rows:
    seats = ", ".join(r.get("seats", []) or [])
    tasks = ", ".join(r.get("tasks", []) or []) if isinstance(r.get("tasks"), list) else r.get("tasks", "")
    title = str(r.get("title", "")).replace("|", "\\|")
    claim = str(r.get("claim", "")).replace("|", "\\|").replace("\n", " ")
    lines.append(f"| {r['id']} | {title} | {seats} | {r.get('severity','')} | {r.get('confidence','')} | {r.get('width','')} | {r.get('flag','')} | {tasks} | {r.get('canon_truth','')} | {r.get('repro','')} | {claim} |")

lines.append("\n## Killed findings\n")
lines.append("| id | title | killer | note |")
lines.append("|---|---|---|---|")
for r in killed_rows:
    title = str(r.get("title", "")).replace("|", "\\|")
    k = killer(r)
    note = ""
    if k == "code-truth":
        note = r.get("code_note", "")
    elif k == "canon-truth":
        note = r.get("canon_note", "")
    elif k == "repro":
        note = r.get("repro_note", "")
    note = str(note).replace("|", "\\|").replace("\n", " ")
    lines.append(f"| {r['id']} | {title} | {k} | {note} |")

with open(f"{BASE}/research/31-verified-findings.md", "w") as fh:
    fh.write("\n".join(lines) + "\n")

print(f"total={total} surviving={surviving} killed={total-surviving}")
print(f"killed_code={killed_code} killed_canon={killed_canon} killed_repro={killed_repro}")
print(f"ruled_against={ruled_against} known_open={known_open}")
