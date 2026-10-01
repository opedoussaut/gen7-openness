import cadquery as cq

PARAMS = {
    "length": 120.0,         # X
    "width": 80.0,           # Y
    "thickness": 8.0,        # Z
    "corner_hole_d": 9.0,
    "edge_offset": 12.0,     # hole centre to adjacent edges
    "bore_d": 30.0,
    "corner_radius": 6.0,
}

def build(p=PARAMS):
    L, W, T = p["length"], p["width"], p["thickness"]
    dx, dy = L / 2 - p["edge_offset"], W / 2 - p["edge_offset"]
    plate = (cq.Workplane("XY").rect(L, W).extrude(T)
             .edges("|Z").fillet(p["corner_radius"]))
    plate = (plate.faces(">Z").workplane()
             .pushPoints([(dx, dy), (-dx, dy), (dx, -dy), (-dx, -dy)])
             .hole(p["corner_hole_d"]))
    plate = plate.faces(">Z").workplane().hole(p["bore_d"])
    return plate

result = build()
