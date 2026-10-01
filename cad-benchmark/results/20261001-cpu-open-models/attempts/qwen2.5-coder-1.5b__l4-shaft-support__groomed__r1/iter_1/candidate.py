import cadquery as cq
from math import pi

PARAMS = {
    "plate_length": 160,
    "plate_width": 60,
    "plate_thickness": 10,
    "housing_x": 20,
    "housing_width": 56,
    "housing_depth": 45,
    "housing_height": 55,
    "axis_z": 40,
    "shaft_d": 20,
    "shaft_length": 140,
    "clearance": 0.2,
    "bolt_d": 9,
    "bolt_dy": 20
}

def build(p=PARAMS):
    base_plate = cq.Workplane("XY").box(p["plate_length"], p["plate_width"], p["plate_thickness"], centered=True).translate((0, 0, p["plate_thickness"]))

    housing_left = cq.Workplane("YZ", origin=(p["housing_x"], 0, p["housing_depth"])).center(p["housing_width"]/2, 0).circle(p["shaft_d"] + 2 * p["clearance"]).extrude(p["housing_height"] - p["clearance"])
    housing_right = cq.Workplane("YZ", origin=(-p["housing_x"], 0, p["housing_depth"])).center(p["housing_width"]/2, 0).circle(p["shaft_d"] + 2 * p["clearance"]).extrude(p["housing_height"] - p["clearance"])

    shaft = cq.Workplane("XY").circle(p["shaft_d"]).extrude(p["shaft_length"])

    bolt_left = cq.Workplane("YZ", origin=(p["housing_x"] - p["bolt_dy"], 0, p["axis_z"])).center(p["shaft_d"]/2, 0).circle(p["bolt_d"]).extrude(p["shaft_length"])
    bolt_right = cq.Workplane("YZ", origin=(p["housing_x"] + p["bolt_dy"], 0, p["axis_z"])).center(p["shaft_d"]/2, 0).circle(p["bolt_d"]).extrude(p["shaft_length"])

    result = {
        "base_plate": base_plate,
        "housing_left": housing_left,
        "housing_right": housing_right,
        "shaft": shaft,
        "bolt_left": bolt_left,
        "bolt_right": bolt_right
    }

    return result

result = build()
