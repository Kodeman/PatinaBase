#!/usr/bin/env python3
"""Build research/36-findings-by-theme.md from research/31-verified-findings.json.

Groups the 213 verified/contested/unverified findings (0 refuted this round)
by class (return, purchase, trust, wayfinding, content, reach), prints counts
and a severity-ordered one-liner per finding per class, then closes with a
hand-picked "twelve that matter most" -- ranked by severity x seat-count x
confidence -- each carrying a verbatim seat quote pulled from that seat's
own 2x-panel-<seat>.md narrative.
"""
import json
import os

ROOT = "/Users/kody/Code/patina-merged/artifacts/ios-daily-return-2026-08-26"
RESEARCH = os.path.join(ROOT, "research")

SEVERITY_RANK = {"S0": 0, "S1": 1, "S2": 2, "S3": 3}
CLASS_ORDER = ["return", "purchase", "trust", "wayfinding", "content", "reach"]
CLASS_LABEL = {
    "return": "Return — reasons to open the app tomorrow",
    "purchase": "Purchase — the money rail, from browse to buy",
    "trust": "Trust — is the app telling the truth about my project",
    "wayfinding": "Wayfinding — can I find the thing I already know exists",
    "content": "Content — is what's on screen actually about my stuff",
    "reach": "Reach — designer/household presence and contact",
}

# Hand-curated top-12, with a verbatim quote pulled from the credited seat's
# own 2x-panel-<seat>.md narrative (persona name kept for attribution).
SEAT_PERSONA = {
    "H1": "Maya & Devon (32/34), Grand Rapids MI",
    "H2": "Ruth, Des Moines IA",
    "H3": "Walt (63), Madison WI",
    "D1": "Leah Hartwell, solo residential designer, Columbus OH",
    "D2": "Priya, Minneapolis — principal, three-person studio",
    "D3": "Tom (51), kitchen/bath + furnishings, Milwaukee",
    "U1": "UX lens — retention & habit design",
    "U2": "UX lens — interaction, navigation & visual",
    "U3": "UX lens — commerce",
}

TOP_TWELVE = [
    ("F01", "H1", "the share sheet says I am about to send Devon a link titled “Patina Designer "
     "Portal” / “app.patina.cloud”… I am a homeowner sharing a chair, and the app is "
     "handing my husband the *designer's* portal, under the designer portal's name. I would not send that."),
    ("F05", "H3", "the grid is *broken*. The left-hand column runs off the left edge of the phone: "
     "a maker reads ‘M & BOARD’, a name reads ‘rloom Oak / ing Table’, and a price reads ‘,200’. "
     "The cards are four different sizes."),
    ("F02", "D3", "First, the ‘SIGNED’ mislabel on an unsigned $100,000 document — I will "
     "not send a client to an app that can't accurately describe the legal status of what they signed "
     "with me."),
    ("F03", "D1", "That is the instrument that binds my client to a non-refundable deposit, and it "
     "restates nothing. I have been through one scope dispute in eight years and it was won on "
     "paperwork. This is not paperwork."),
    ("F07", "H2", "Nothing ‘landed here.’ Nothing ever will, unless someone changes the "
     "backend — the grounding read confirms no push fires for a proposal or an invoice anywhere "
     "in this codebase today."),
    ("F08", "H3", "Meanwhile, two screens away: two decisions overdue since Aug 22, $4,250 due Sep 1, "
     "a proposal expiring Sep 8. Zero notifications."),
    ("F04", "U2", "Every path through Browse ends here — I have never reached a single working "
     "product page in this walk. If I were a real shopper I'd be back on Wayfair by now, not because "
     "the sofa was wrong but because the app would not let me see it."),
    ("F41", "U1", "Three totals for one inbox. A count is a return trigger exactly as long as I "
     "believe it."),
    ("F42", "H1", "Pinterest is *only* this. If the ‘save it for later’ part is shakier than "
     "Pinterest's, the whole nightly ritual has no reason to move here."),
    ("F09", "H2", "at ‘Aspen Loft Refresh · from Leah Hartwell’ — a small line of mono text under a "
     "bill. No photo, no way to message her, no bio, nothing that says this is a real person I'm "
     "three months into a relationship with."),
    ("F12", "H3", "Eleven taps, one app kill, and no screen that would take my money for a chair. "
     "Taps to money: there is no number. There is no path."),
    ("F10", "H1", "The account whose request was accepted and claimed eight days ago sees a home "
     "reading ‘Bring your first room into Patina’ — byte-for-byte the guest home — "
     "no designer, no status, no match… The one true fact about that account appears nowhere in "
     "the app."),
]


def load_json(path):
    with open(path) as f:
        return json.load(f)


def one_liner(obs, limit=200):
    obs = obs.strip().replace("\n", " ")
    if len(obs) <= limit:
        return obs
    return obs[:limit].rsplit(" ", 1)[0] + "…"


def main():
    data = load_json(os.path.join(RESEARCH, "31-verified-findings.json"))
    findings = {f["id"]: f for f in data["findings"]}
    by_class = {}
    for f in data["findings"]:
        by_class.setdefault(f.get("class"), []).append(f)

    lines = []
    lines.append("# Findings by theme — The Daily Return (2026-08-26)")
    lines.append("")
    lines.append(
        f"{len(data['findings'])} findings ({data['meta']['counts']['verified']} verified, "
        f"{data['meta']['counts']['contested']} contested, {data['meta']['counts']['unverified']} "
        f"unverified — 0 refuted this round, see `32-refuted-findings.md`), grouped by class."
    )
    lines.append("")
    lines.append("| class | count |")
    lines.append("|---|---|")
    for c in CLASS_ORDER:
        lines.append(f"| {c} | {len(by_class.get(c, []))} |")
    lines.append("")

    for c in CLASS_ORDER:
        items = by_class.get(c, [])
        items.sort(key=lambda x: (SEVERITY_RANK.get(x["severity"], 9), -x.get("confidence", 0)))
        lines.append(f"## {CLASS_LABEL[c]} ({len(items)})")
        lines.append("")
        for f in items:
            tag = "" if f["status"] == "verified" else f" [{f['status']}]"
            lines.append(f"- **{f['id']}** ({f['severity']}){tag} — {f['title']}. {one_liner(f['observation'])}")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## The twelve that matter most")
    lines.append("")
    lines.append(
        "Ranked by severity × seat-count × confidence across all 213 findings. Each carries a "
        "verbatim line from the credited seat's own panel report (`research/2x-panel-<seat>.md`) — "
        "the sentence that best voices why this one is the one to fix first."
    )
    lines.append("")
    for rank, (fid, seat, quote) in enumerate(TOP_TWELVE, start=1):
        f = findings[fid]
        persona = SEAT_PERSONA[seat]
        lines.append(f"### {rank}. {fid} — {f['title']}")
        lines.append("")
        lines.append(
            f"**{f['severity']}** · confidence {f.get('confidence','')} · {len(f.get('seats', []))} "
            f"seats ({', '.join(f.get('seats', []))}) · class: {f.get('class','')} · status: {f['status']}"
        )
        lines.append("")
        lines.append(f"> “{quote}”")
        lines.append(f"> — **{seat}**, {persona}")
        lines.append("")
        shots = f.get("evidence", {}).get("shots", [])
        if shots:
            lines.append("Shots: " + ", ".join(shots))
            lines.append("")

    out_path = os.path.join(RESEARCH, "36-findings-by-theme.md")
    with open(out_path, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    print(out_path)


if __name__ == "__main__":
    main()
