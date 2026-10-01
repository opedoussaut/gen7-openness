import cadquery as cq

PARAMS = {
    "base_size": 60.0,        # square, X and Y
    "base_thickness": 5.0,
    "fin_count": 9,
    "fin_thickness": 1.6,     # along X
    "fin_height": 25.0,       # above the base
    "fin_pitch": 7.0,         # centre to centre along X
    "hole_d": 3.4,
    "hole_offset": 25.0,      # holes at (+/-offset, +/-offset)
}

def build(p=PARAMS):
    S, tb = p["base_size"], p["base_thickness"]
    body = cq.Workplane("XY").rect(S, S).extrude(tb)
    n, pitch = int(p["fin_count"]), p["fin_pitch"]
    xs = [(i - (n - 1) / 2) * pitch for i in range(n)]
    fins = (cq.Workplane("XY").workplane(offset=tb)
            .pushPoints([(x, 0) for x in xs]).rect(p["fin_thickness"], S).extrude(p["fin_height"]))
    body = body.union(fins)
    o = p["hole_offset"]
    holes = (cq.Workplane("XY").pushPoints([(o, o), (-o, o), (o, -o), (-o, -o)])
             .circle(p["hole_d"] / 2).extrude(tb))
    return body.cut(holes)

result = build()
