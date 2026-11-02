"""Renders docs/cover.svg from the part model below. Run: python3 docs/cover/cover.py

The picture is derived from the model, never edited by hand. Line weight means one
thing: how committed a change is. Dashed thin is proposed, mid is backed up, bold
is applied.
"""
import json
from pathlib import Path

PALETTE = {
    "surface": "#F7F4EE",
    "text": "#2B2A28",
    "text-2": "#6B675F",
    "guide": "#CFC8BA",
    "accent": "#2F7D6B",
    "accent-wash": "#DCEDE6",
    "accent-ink": "#1F5A4C",
    "paper": "#FFFFFF",
}
WEIGHT = {"proposed": 2, "kept": 3, "applied": 4.5}

MODEL = {
    "subject": "a terminal proposes a budget change on a dashed draft card, a copy is filed in a box, then the change is sealed into an envelope",
    "alt": "A terminal window, a dashed preview card showing values before and after, a backup box, and a budget envelope receiving the change.",
    "viewBox": [0, 0, 1200, 400],
    "focal": "preview-card",
    "parts": [
        {"id": "ground", "prim": "line", "x1": 60, "y1": 330, "x2": 1140, "y2": 330, "key": "guide", "w": 1.5,
         "does": "seats the objects on one plane"},
        {"id": "terminal", "prim": "rect", "x": 70, "y": 120, "w": 230, "h": 170, "r": 12, "fill": "text", "ink": None,
         "does": "the command that asks for a change"},
        {"id": "terminal-dots", "prim": "repeat", "of": {"prim": "circle", "r": 5, "fill": "text-2"},
         "at": [[92, 140], [110, 140], [128, 140]], "does": "reads the dark block as a window"},
        {"id": "terminal-lines", "prim": "repeat", "of": {"prim": "rect", "h": 9, "r": 4, "fill": "guide"},
         "at": [[90, 172, 120], [90, 194, 160], [90, 216, 96], [90, 238, 140]], "does": "typed commands"},
        {"id": "cursor", "prim": "rect", "x": 90, "y": 258, "w": 14, "h": 14, "r": 2, "fill": "accent", "ink": None,
         "does": "the prompt waiting for a yes"},
        {"id": "preview-card", "prim": "rect", "x": 380, "y": 70, "w": 340, "h": 250, "r": 14, "fill": "paper",
         "ink": "proposed", "dash": [10, 8], "does": "the proposed change, not yet real"},
        {"id": "rows-before", "prim": "repeat", "of": {"prim": "rect", "h": 16, "r": 8, "fill": "guide"},
         "at": [[412, 120, 110], [412, 170, 80], [412, 220, 130], [412, 270, 60]], "does": "values as they are now"},
        {"id": "rows-arrows", "prim": "repeat", "of": {"prim": "chevron"},
         "at": [[548, 128], [548, 178], [548, 228], [548, 278]], "does": "before becomes after"},
        {"id": "rows-after", "prim": "repeat", "of": {"prim": "rect", "h": 16, "r": 8, "fill": "accent"},
         "at": [[588, 120, 96], [588, 170, 104], [588, 220, 70], [588, 270, 100]], "does": "values the change would set"},
        {"id": "backup-box", "prim": "box", "x": 795, "y": 230, "w": 120, "h": 90, "fill": "accent-wash",
         "ink": "kept", "does": "the copy filed before anything changes"},
        {"id": "envelope", "prim": "envelope", "x": 975, "y": 150, "w": 170, "h": 115, "fill": "paper",
         "ink": "applied", "does": "the budget, where the change finally lands"},
        {"id": "slip", "prim": "rect", "x": 1030, "y": 112, "w": 60, "h": 62, "r": 4, "fill": "accent", "ink": None,
         "does": "the applied change entering the budget"},
    ],
    "arrows": [
        {"from": [305, 205], "to": [372, 205], "w": WEIGHT["proposed"], "dash": [6, 6]},
        {"from": [728, 260], "to": [786, 272], "w": WEIGHT["kept"]},
        {"from": [922, 268], "to": [962, 218], "w": WEIGHT["applied"], "bend": -24},
    ],
    "labels": [
        {"x": 550, "y": 352, "text": "preview", "anchor": "middle"},
        {"x": 855, "y": 352, "text": "back up", "anchor": "middle"},
        {"x": 1060, "y": 352, "text": "apply", "anchor": "middle"},
    ],
}


def ink(part):
    w = part.get("ink", "kept")
    if w is None:
        return 'stroke="none"'
    dash = f' stroke-dasharray="{part["dash"][0]} {part["dash"][1]}"' if "dash" in part else ""
    return f'stroke="{PALETTE["text"]}" stroke-width="{WEIGHT[w]}" stroke-linejoin="round"{dash}'


def render_part(p):
    if p["prim"] == "line":
        return [f'<line x1="{p["x1"]}" y1="{p["y1"]}" x2="{p["x2"]}" y2="{p["y2"]}" stroke="{PALETTE[p["key"]]}" stroke-width="{p["w"]}" stroke-linecap="round"/>']
    if p["prim"] == "rect":
        return [f'<rect x="{p["x"]}" y="{p["y"]}" width="{p["w"]}" height="{p["h"]}" rx="{p.get("r", 0)}" fill="{PALETTE[p["fill"]]}" {ink(p)}/>']
    if p["prim"] == "circle":
        return [f'<circle cx="{p["x"]}" cy="{p["y"]}" r="{p["r"]}" fill="{PALETTE[p["fill"]]}"/>']
    if p["prim"] == "chevron":
        x, y = p["x"], p["y"]
        return [f'<path d="M{x} {y - 7} L{x + 10} {y} L{x} {y + 7}" fill="none" stroke="{PALETTE["text-2"]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>']
    if p["prim"] == "repeat":
        out = []
        for pt in p["at"]:
            child = {**p["of"], "x": pt[0], "y": pt[1]}
            if len(pt) > 2:
                child["w"] = pt[2]
            child.setdefault("ink", None)
            out += render_part(child)
        return out
    if p["prim"] == "box":
        x, y, w, h = p["x"], p["y"], p["w"], p["h"]
        lid = 18
        return [
            f'<rect x="{x}" y="{y + lid}" width="{w}" height="{h - lid}" rx="6" fill="{PALETTE[p["fill"]]}" {ink(p)}/>',
            f'<rect x="{x - 8}" y="{y}" width="{w + 16}" height="{lid + 4}" rx="6" fill="{PALETTE[p["fill"]]}" {ink(p)}/>',
            f'<rect x="{x + w / 2 - 18}" y="{y + lid + 18}" width="36" height="8" rx="4" fill="{PALETTE["accent-ink"]}"/>',
        ]
    if p["prim"] == "envelope":
        x, y, w, h = p["x"], p["y"], p["w"], p["h"]
        return [
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{PALETTE[p["fill"]]}" {ink(p)}/>',
            f'<path d="M{x} {y + 8} L{x + w / 2} {y + h * 0.55} L{x + w} {y + 8}" fill="none" {ink(p)} stroke-linecap="round"/>',
        ]
    raise ValueError(p["prim"])


def render_arrow(a):
    (x1, y1), (x2, y2) = a["from"], a["to"]
    dash = f' stroke-dasharray="{a["dash"][0]} {a["dash"][1]}"' if "dash" in a else ""
    bend = a.get("bend", 0)
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2 + bend
    return (f'<path d="M{x1} {y1} Q{mx} {my} {x2} {y2}" fill="none" stroke="{PALETTE["text"]}" '
            f'stroke-width="{a["w"]}" stroke-linecap="round"{dash} marker-end="url(#head)"/>')


def render(model):
    vb = model["viewBox"]
    order = model["parts"]
    # The slip enters the envelope from above, so it draws before the envelope's front.
    slip = next(p for p in order if p["id"] == "slip")
    body = [p for p in order if p["id"] != "slip"]
    env_idx = next(i for i, p in enumerate(body) if p["id"] == "envelope")
    body.insert(env_idx, slip)
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{" ".join(map(str, vb))}" role="img" aria-labelledby="t d">',
        f'<title id="t">actual-budget-cli</title><desc id="d">{model["alt"]}</desc>',
        '<defs><marker id="head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">'
        f'<path d="M1 1 L8 5 L1 9" fill="none" stroke="{PALETTE["text"]}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>',
        f'<rect x="0" y="0" width="{vb[2]}" height="{vb[3]}" rx="20" fill="{PALETTE["surface"]}"/>',
    ]
    for p in body:
        out += render_part(p)
    out += [render_arrow(a) for a in model["arrows"]]
    for lab in model["labels"]:
        out.append(f'<text x="{lab["x"]}" y="{lab["y"]}" text-anchor="{lab["anchor"]}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" '
                   f'font-size="20" fill="{PALETTE["text-2"]}">{lab["text"]}</text>')
    out.append("</svg>")
    return "\n".join(out) + "\n"


def check(model):
    ids = [p["id"] for p in model["parts"]]
    assert model["focal"] in ids, "focal must name a part"
    assert len(ids) <= 14, "part budget is 14"
    for p in model["parts"]:
        assert len(p.get("does", "").split()) >= 2, f'{p["id"]} needs a "does" entry'


if __name__ == "__main__":
    check(MODEL)
    target = Path(__file__).resolve().parents[1] / "cover.svg"
    target.write_text(render(MODEL))
    print(f"wrote {target}")
