import cadquery as cq

PARAMS = {
    "length": 80.0,           # base along X
    "width": 50.0,            # along Y
    "height": 60.0,           # upright along Z
    "thickness": 6.0,
    "bend_radius": 5.0,       # inside fillet between base and upright
    "gusset_thickness": 6.0,
    "gusset_leg": 40.0,
    "slot_width": 9.0,
    "slot_length": 29.0,      # overall
    "slot_center_x": 55.0,
    "hole_d": 11.0,
    "hole_z": 40.0,
    "edge_offset": 12.0,      # slot / hole centre lines from the Y edges
}

def build(p=PARAMS):
    L, W, H, t = p["length"], p["width"], p["height"], p["thickness"]
    base = cq.Workplane("XY").box(L, W, t, centered=False)
    upright = cq.Workplane("XY").box(t, W, H, centered=False)
    body = base.union(upright)
    # inside bend fillet: the concave edge along Y at x=t, z=t
    body = body.edges(cq.selectors.NearestToPointSelector((t, W / 2, t))).fillet(p["bend_radius"])
    g, gt = p["gusset_leg"], p["gusset_thickness"]
    gusset = (cq.Workplane("XZ", origin=(0, W / 2 + gt / 2, 0))
              .polyline([(t, t), (t + g, t), (t, t + g)]).close().extrude(gt))
    body = body.union(gusset)
    e = p["edge_offset"]
    slots = (cq.Workplane("XY").pushPoints([(p["slot_center_x"], e), (p["slot_center_x"], W - e)])
             .slot2D(p["slot_length"], p["slot_width"]).extrude(t))
    holes = (cq.Workplane("YZ").pushPoints([(e, p["hole_z"]), (W - e, p["hole_z"])])
             .circle(p["hole_d"] / 2).extrude(t))
    return body.cut(slots).cut(holes)

result = build()
