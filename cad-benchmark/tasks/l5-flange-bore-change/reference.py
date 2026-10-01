import math
import cadquery as cq

PARAMS = {
    "outer_d": 160.0,
    "thickness": 18.0,
    "bore_d": 76.0,
    "raised_face_d": 100.0,
    "raised_face_h": 3.0,
    "bolt_count": 8,
    "bolt_hole_d": 18.0,
    "pcd": 125.0,
}

def build(p=PARAMS):
    body = cq.Workplane("XY").circle(p["outer_d"] / 2).extrude(p["thickness"])
    rf = (cq.Workplane("XY").workplane(offset=p["thickness"])
          .circle(p["raised_face_d"] / 2).extrude(p["raised_face_h"]))
    body = body.union(rf)
    n, r = int(p["bolt_count"]), p["pcd"] / 2
    pts = [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    holes = cq.Workplane("XY").pushPoints(pts).circle(p["bolt_hole_d"] / 2).extrude(p["thickness"] + p["raised_face_h"])
    bore = cq.Workplane("XY").circle(p["bore_d"] / 2).extrude(p["thickness"] + p["raised_face_h"])
    return body.cut(holes).cut(bore)

result = build()
