#!/usr/bin/env python3
"""Collate the nine seat finding files into canonical findings.

Method (per brief): load all nine 2x-panel-*.json arrays; first pass groups
raw findings by exact `key`; second pass merges findings whose surface+class
match and whose titles/observations describe the same problem (curated by
hand below, conservatively -- verified by reading full title+observation
text for every candidate pair with title similarity >= ~0.55 across the 313
exact-key groups). Findings that are clearly related but not confidently the
same problem are recorded via `related[]` instead of merged.

Outputs:
  research/30-collated-findings.json  -- full canonical array
  research/30-collated-findings.md    -- id/title/severity/confidence/seats/class/shots table
"""
import json
import os
import re
from collections import defaultdict

ROOT = "/Users/kody/Code/patina-merged/artifacts/ios-daily-return-2026-08-26"
RESEARCH = os.path.join(ROOT, "research")

SEATS = ["h1", "h2", "h3", "d1", "d2", "d3", "u1", "u2", "u3"]

SEVERITY_RANK = {"S0": 0, "S1": 1, "S2": 2, "S3": 3}


# ---------------------------------------------------------------------------
# Curated second-pass merge groups.
#
# Each group lists raw finding ids (seat-prefixed, e.g. "H1-04") that were
# independently confirmed -- by reading each item's full title AND
# observation text -- to describe the *same* on-screen/code-level problem,
# even though their `key` slugs differ (different seats coined different
# slugs for the same defect). Conservative: pairs that only shared surface
# vocabulary or a generic pattern (e.g. two different screens both "drop a
# deadline on the detail view") were left ungrouped and instead cross-linked
# via RELATED_PAIRS below.
# ---------------------------------------------------------------------------
MERGE_GROUPS = [
    # Shared link opens Safari, not the app (no associated-domains entitlement).
    ["H1-23", "H3-29", "U1-32"],
    # Share sheet titled "Patina Designer Portal" / app.patina.cloud, no product context.
    ["H1-22", "H3-28", "D1-22", "D3-05", "U1-31", "U3-23", "D2-24"],
    # "UNKNOWN MAKER" card in the browse grid.
    ["H1-08", "H3-14"],
    # Boards can be created but addToBoard has no call site -- never fill.
    ["H1-12", "U3-16", "H2-11", "H3-18", "U1-14", "U2-10"],
    # Product photography does not match the listed piece.
    ["H1-07", "D3-02", "H3-13", "U3-12", "D1-26", "U2-08"],
    # Every piece-detail tap: "Couldn't load product" / "Let's try that again", hard trap.
    ["H1-04", "U3-03", "H3-16", "D3-03", "D1-21", "U2-07", "U3-19"],
    # Engaged/matched-designer home renders the guest home verbatim (James Okafor case).
    ["H1-27", "H3-35", "D1-12", "U1-12"],
    # Invoice payment failure: red line under a live, still-enabled Pay button.
    ["H3-55", "U3-42"],
    # Companion panel has no "Saved" row until the saved count is non-zero.
    ["H1-13", "H3-17", "U1-13"],
    # Studio hub: three disagreeing counts for one inbox on one screen.
    ["H3-33", "D1-16", "U1-22", "H2-19", "D2-06", "D3-16"],
    # No partner/household/second-seat concept anywhere in the app.
    ["H3-30", "U1-34", "H1-24"],
    # The e-signature sheet restates no amount, terms, line items or date.
    ["H2-30", "U3-40", "D3-12", "D2-09", "D1-05", "H3-51"],
    # Notifications reads "Nothing yet" while the Studio shows real pending items.
    ["D1-10", "U3-35", "D3-18", "U1-24", "H3-38"],
    # Story card's unread dot is hard-coded on, never clears.
    ["H1-02", "H3-07", "H2-03", "U1-07"],
    # Proposals list/section header mislabels an accepted (unsigned) $100,000 proposal "SIGNED".
    ["H2-29", "D2-07", "D3-20", "H3-52", "U3-41", "D1-04"],
    # First-launch coach marks cover the card they are describing.
    ["H1-40", "H3-05"],
    # Filter chip row clips "Storage" to "Stor" at XXL Dynamic Type.
    ["H1-35", "H3-45", "U3-10"],
    # Push permission asked exactly once, only after a design-request submission, no rationale.
    ["U1-25", "U3-38", "H3-39", "H1-29"],
    # No "since your last visit" delta anywhere -- a relaunch looks byte-identical.
    ["H1-32", "H3-42", "U1-28"],
    # The designer is named exactly once in the whole app, on the invoice, no contact affordance.
    ["H3-48", "D1-01", "H2-37", "D3-21"],
    # A completed project sorts above the live/in-progress ones.
    ["H2-24", "D1-30"],
    # "Browse Picks for This Room" silently drops room scoping / is not room-filtered.
    ["H1-43", "U3-11"],
    # Companion's "Your studio" row promises PROJECTS/MESSAGES/DECISIONS, lands on a bare list.
    ["D1-35", "D2-10", "H2-21"],
    # No commercial next step / purchase path -- every piece ends at "Add to Room" -> "Saved ✓".
    ["H1-09", "H3-27", "U3-26", "D1-23"],
    # No compare surface, no notes field written, no decision aids on a piece.
    ["H1-21", "H3-26", "U3-22"],
    # No dimensions or lead time on any piece, anywhere.
    ["H1-06", "H3-12"],
    # Settings "Account >" row is inert -- tapped, nothing happens.
    ["H1-46", "H3-57", "U2-24"],
    # Companion orb sits on top of / clips the primary action button on multiple screens.
    ["H1-34", "H3-46", "D1-34"],
    # Designer-facing FF&E/portal instruction leaked to the client's project screen.
    ["H3-49", "D3-22"],
    # Color/colour decision (rug) presented with no swatch or image on either option.
    ["H2-15", "U3-25", "D1-19", "D2-14"],
    # A date shown on the list card (due/expiry/overdue) vanishes on the detail screen itself.
    ["D1-06", "D1-07", "H3-34", "D2-15"],
    # AR is offered in the UI but structurally cannot ever render (usdz_url NULL everywhere).
    ["H1-18", "U2-17"],
    # Room entry: ft input is reinterpreted/stored as metres (18x14 ft -> 2713 sqft).
    ["H1-16", "H3-21"],
    # Piece-detail save is local-only and duplicating; isSaved never seeded from storage.
    ["H2-09", "U3-20"],
    # No Sign Out and no Delete Account control anywhere in Settings.
    ["H1-45", "H3-56", "U3-46", "D1-28"],
    # No order object/screen/ETA to return to, on either side of direct_orders.
    ["H1-47", "U1-18"],
    # "N% match" / "N% MATCH" never states what it is matched against.
    ["H1-20", "H3-15", "U1-38"],
    # No "Add to room" action anywhere in the card menu, even entered from the room itself.
    ["H1-15", "H3-24", "U2-16"],
    # Browse grid geometry is broken -- cards clipped off-canvas / off-screen.
    ["H1-05", "H3-11", "U2-04", "U3-02", "D3-01", "D1-25"],
    # A typed (manual) room-entry form is relabelled "Captured" / "Rescan" / "SCANNED".
    ["H1-17", "H3-23", "U2-27"],
    # Launch screen is blank white before the app's cream ground appears.
    ["H1-41", "H3-03"],
    # Studio / money rail reachable only via an unlabeled top-right monogram avatar.
    ["H2-20", "H3-32", "D1-15", "D3-15"],
    # apns-send is real and provisioned but none of its callers touch money-shaped events.
    ["H2-27", "D1-33", "U3-37", "D2-22", "H3-40", "H1-28"],
    # Studio/money rows are unreachable by / not exposed to VoiceOver.
    ["H2-36", "D1-27"],
    # An active project with nothing pending disappears entirely from Today.
    ["D1-37", "U1-11"],
    # "No search field anywhere in the app" (all four surfaces named across seats).
    ["H1-42", "H3-10", "U3-01", "H2-05", "U2-05"],
]

# Findings that are clearly adjacent/thematically linked but were kept as
# separate canonical findings (different concrete defect, different code
# path, or just not confidently the same claim). Cross-linked via related[].
RELATED_PAIRS = [
    ("D1-10", "H2-27"),   # notifications-empty-while-due <-> push fires for nothing money-shaped
    ("D1-23", "U3-22"),   # no purchase path <-> no compare/notes decision aids
    ("H1-46", "H1-45"),   # account row inert <-> no sign-out/delete-account control
    ("D3-19", "U3-33"),   # budget shows one of three projects <-> two conflicting budget numbers
    ("U3-28", "H3-48"),   # orders carry no designer attribution <-> designer named once in whole app
    ("H1-31", "U1-30"),   # returning guest loses session <-> returning client offered to re-file
    ("H2-33", "H1-22"),   # share: wrong app + wrong name (compound) <-> designer-portal branding cluster
    ("H2-33", "H1-23"),   # share: wrong app + wrong name (compound) <-> link-cannot-open-app cluster
    ("H1-47", "U3-28"),   # no order object to track <-> direct_orders has no designer attribution
]


def load_all():
    items = []
    failures = []
    for seat in SEATS:
        path = os.path.join(RESEARCH, f"2x-panel-{seat}.json")
        if not os.path.exists(path):
            failures.append(f"missing seat file: 2x-panel-{seat}.json")
            continue
        try:
            with open(path) as f:
                data = json.load(f)
        except Exception as e:
            failures.append(f"could not parse 2x-panel-{seat}.json: {e}")
            continue
        for it in data:
            items.append(it)
    return items, failures


class DSU:
    def __init__(self, ids):
        self.parent = {i: i for i in ids}

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            # deterministic root: lexicographically smaller id wins, so output is stable
            if rb < ra:
                ra, rb = rb, ra
            self.parent[rb] = ra


def natural_key(raw_id):
    m = re.match(r"([A-Z]+)(\d+)-(\d+)", raw_id)
    if not m:
        return (raw_id,)
    return (m.group(1), int(m.group(2)), int(m.group(3)))


def main():
    items, failures = load_all()
    n_raw = len(items)
    byid = {it["id"]: it for it in items}

    dsu = DSU(list(byid.keys()))

    # Pass 1: exact key match
    by_key = defaultdict(list)
    for it in items:
        by_key[it["key"]].append(it["id"])
    for key, ids in by_key.items():
        for other in ids[1:]:
            dsu.union(ids[0], other)

    # Pass 2: curated cross-key merges
    skipped_merge_ids = []
    for group in MERGE_GROUPS:
        present = [i for i in group if i in byid]
        missing = [i for i in group if i not in byid]
        if missing:
            skipped_merge_ids.extend(missing)
        for other in present[1:]:
            dsu.union(present[0], other)

    # Group members by DSU root
    clusters = defaultdict(list)
    for raw_id in byid:
        clusters[dsu.find(raw_id)].append(raw_id)

    def severity_rank(it):
        return SEVERITY_RANK.get(it["severity"], 9)

    canonical_by_root = {}
    for root, member_ids in clusters.items():
        member_ids_sorted = sorted(member_ids, key=natural_key)
        members = [byid[i] for i in member_ids_sorted]

        # representative: highest severity, then longest observation, then lowest natural id
        representative = sorted(
            members,
            key=lambda it: (severity_rank(it), -len(it.get("observation", "")), natural_key(it["id"])),
        )[0]

        seats = sorted({it["seat"] for it in members})
        source_ids = [it["id"] for it in members]
        task_ids = sorted({t for it in members for t in it.get("task_ids", [])})

        shots = sorted({s for it in members for s in it.get("evidence", {}).get("shots", [])})
        refs = sorted({r for it in members for r in it.get("evidence", {}).get("refs", [])})

        severities = [it["severity"] for it in members]
        max_severity = min(severities, key=lambda s: SEVERITY_RANK.get(s, 9))

        confidences = [it.get("confidence", 0) for it in members]
        mean_confidence = round(sum(confidences) / len(confidences), 3)

        already_ruled_vals = []
        for it in members:
            v = it.get("already_ruled")
            if v and v not in already_ruled_vals:
                already_ruled_vals.append(v)
        already_ruled = " | ".join(already_ruled_vals) if already_ruled_vals else None

        july_status_vals = []
        for it in members:
            v = it.get("july_status")
            if v and v not in july_status_vals:
                july_status_vals.append(v)
        july_status = " | ".join(july_status_vals) if july_status_vals else None

        proposal_seeds = []
        for it in members:
            v = it.get("proposal_seed")
            if v and v not in proposal_seeds:
                proposal_seeds.append(v)

        canonical_by_root[root] = {
            "root": root,
            "seats": seats,
            "source_ids": source_ids,
            "task_ids": task_ids,
            "key": representative["key"],
            "surface": representative["surface"],
            "tier": representative["tier"],
            "class": representative["class"],
            "title": representative["title"],
            "observation": representative["observation"],
            "why_it_matters": representative["why_it_matters"],
            "evidence": {"shots": shots, "refs": refs},
            "severity": max_severity,
            "confidence": mean_confidence,
            "already_ruled": already_ruled,
            "july_status": july_status,
            "proposal_seeds": proposal_seeds,
            "related": [],
        }

    # Resolve related pairs (raw id -> canonical root) and cross-link, dedup, skip self-links
    root_lookup = {}
    for root, member_ids in clusters.items():
        for mid in member_ids:
            root_lookup[mid] = root

    related_links = defaultdict(set)
    related_skipped = []
    for a, b in RELATED_PAIRS:
        if a not in root_lookup or b not in root_lookup:
            related_skipped.append((a, b))
            continue
        ra, rb = root_lookup[a], root_lookup[b]
        if ra == rb:
            continue  # already merged, no separate related link needed
        related_links[ra].add(rb)
        related_links[rb].add(ra)

    # Order: severity S0->S3, then by seat count desc, then by root natural order for stability
    ordered_roots = sorted(
        canonical_by_root.keys(),
        key=lambda r: (
            SEVERITY_RANK.get(canonical_by_root[r]["severity"], 9),
            -len(canonical_by_root[r]["seats"]),
            natural_key(r),
        ),
    )

    id_map = {}  # root -> F## id
    for idx, root in enumerate(ordered_roots, start=1):
        id_map[root] = f"F{idx:02d}"

    final = []
    for root in ordered_roots:
        c = canonical_by_root[root]
        c["id"] = id_map[root]
        c["related"] = sorted({id_map[r] for r in related_links.get(root, set())})
        del c["root"]
        final.append(c)

    # reorder keys for readability
    key_order = [
        "id", "title", "seats", "source_ids", "task_ids", "key", "surface", "tier",
        "class", "observation", "why_it_matters", "evidence", "severity", "confidence",
        "already_ruled", "july_status", "proposal_seeds", "related",
    ]
    final_ordered = [{k: c[k] for k in key_order} for c in final]

    out_json = os.path.join(RESEARCH, "30-collated-findings.json")
    with open(out_json, "w") as f:
        json.dump(final_ordered, f, indent=2)

    # Markdown table
    out_md = os.path.join(RESEARCH, "30-collated-findings.md")
    lines = []
    lines.append("# Collated findings — The Daily Return (2026-08-26)")
    lines.append("")
    lines.append(
        f"Merged {n_raw} raw findings from 9 seats into {len(final_ordered)} canonical findings "
        f"({len(by_key)} exact-key groups, {len(MERGE_GROUPS)} curated cross-key merges applied)."
    )
    if failures:
        lines.append("")
        lines.append("**Failures:**")
        for f_ in failures:
            lines.append(f"- {f_}")
    if skipped_merge_ids:
        lines.append("")
        lines.append(f"**Note:** curated merge referenced missing raw ids (skipped): {sorted(set(skipped_merge_ids))}")
    if related_skipped:
        lines.append("")
        lines.append(f"**Note:** related-pair referenced missing raw ids (skipped): {related_skipped}")
    lines.append("")
    lines.append("| id | title | severity | confidence | seats | class | shots |")
    lines.append("|---|---|---|---|---|---|---|")
    for c in final_ordered:
        shots = ", ".join(c["evidence"]["shots"][:3])
        if len(c["evidence"]["shots"]) > 3:
            shots += f" (+{len(c['evidence']['shots']) - 3} more)"
        title_escaped = c["title"].replace("|", "\\|")
        lines.append(
            f"| {c['id']} | {title_escaped} | {c['severity']} | {c['confidence']} | "
            f"{','.join(c['seats'])} | {c['class']} | {shots} |"
        )

    with open(out_md, "w") as f:
        f.write("\n".join(lines) + "\n")

    print(f"n_raw={n_raw}")
    print(f"n_exact_key_groups={len(by_key)}")
    print(f"n_canonical={len(final_ordered)}")
    print(f"failures={failures}")
    print(f"skipped_merge_ids={sorted(set(skipped_merge_ids))}")
    print(f"related_skipped={related_skipped}")
    print(f"wrote {out_json}")
    print(f"wrote {out_md}")


if __name__ == "__main__":
    main()
