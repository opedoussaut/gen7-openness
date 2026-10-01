import cadquery as cq

PARAMS = {
    "length": 100.0,          # X, main box
    "width": 70.0,            # Y
    "height": 50.0,           # Z, open at the top
    "wall": 4.0,
    "floor": 5.0,
    "corner_radius": 8.0,     # outer vertical edges
    "boss_d": 46.0,           # bearing boss on the +X wall
    "boss_len": 8.0,          # protrusion beyond the +X face
    "bore_d": 32.0,           # bearing bore, through boss and wall
    "boss_z": 25.0,
    "column_d": 10.0,         # four internal screw columns
    "column_inset": 10.0,     # column centre from outer X and Y faces
    "tap_d": 4.2,
    "tap_depth": 12.0,        # blind, from the top face
}

def build(p=PARAMS):
    L, W, H, w, f, R = p["length"], p["width"], p["height"], p["wall"], p["floor"], p["corner_radius"]
    outer = cq.Workplane("XY").rect(L, W).extrude(H).edges("|Z").fillet(R)
    inner = (cq.Workplane("XY").workplane(offset=f).rect(L - 2 * w, W - 2 * w)
             .extrude(H - f).edges("|Z").fillet(max(R - w, 0.5)))
    body = outer.cut(inner)
    cx, cy = L / 2 - p["column_inset"], W / 2 - p["column_inset"]
    pts = [(cx, cy), (-cx, cy), (cx, -cy), (-cx, -cy)]
    columns = cq.Workplane("XY").pushPoints(pts).circle(p["column_d"] / 2).extrude(H)
    body = body.union(columns)
    boss = (cq.Workplane("YZ", origin=(L / 2 - w, 0, 0)).center(0, p["boss_z"])
            .circle(p["boss_d"] / 2).extrude(w + p["boss_len"]))
    body = body.union(boss)
    bore = (cq.Workplane("YZ", origin=(L / 2 - w - 1, 0, 0)).center(0, p["boss_z"])
            .circle(p["bore_d"] / 2).extrude(w + p["boss_len"] + 2))
    taps = (cq.Workplane("XY").workplane(offset=H - p["tap_depth"]).pushPoints(pts)
            .circle(p["tap_d"] / 2).extrude(p["tap_depth"]))
    return body.cut(bore).cut(taps)

result = build()
