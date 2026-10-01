import cadquery as cq

PARAMS = {
    "plate_length": 160.0,    # X
    "plate_width": 60.0,      # Y
    "plate_thickness": 10.0,  # Z, plate from Z=0
    "housing_x": 50.0,        # housings centred at X = +/-housing_x
    "housing_width": 20.0,    # X
    "housing_depth": 56.0,    # Y
    "housing_height": 45.0,   # Z, sits on the plate top
    "axis_z": 40.0,           # shaft axis height
    "shaft_d": 20.0,
    "shaft_length": 140.0,    # centred on X=0
    "clearance": 0.2,         # radial clearance shaft / bore
    "bolt_d": 9.0,            # vertical bolt holes through housing and plate
    "bolt_dy": 20.0,          # bolt holes at Y = +/-bolt_dy
}

def build(p=PARAMS):
    tp = p["plate_thickness"]
    bore_d = p["shaft_d"] + 2 * p["clearance"]
    hx, dy = p["housing_x"], p["bolt_dy"]
    bolt_pts = [(sx * hx, sy * dy) for sx in (1, -1) for sy in (1, -1)]
    plate = cq.Workplane("XY").rect(p["plate_length"], p["plate_width"]).extrude(tp)
    plate = plate.cut(cq.Workplane("XY").pushPoints(bolt_pts).circle(p["bolt_d"] / 2).extrude(tp))

    def housing(x):
        h = (cq.Workplane("XY").workplane(offset=tp).center(x, 0)
             .rect(p["housing_width"], p["housing_depth"]).extrude(p["housing_height"]))
        bore = (cq.Workplane("YZ", origin=(x - p["housing_width"], 0, 0)).center(0, p["axis_z"])
                .circle(bore_d / 2).extrude(2 * p["housing_width"]))
        bolts = (cq.Workplane("XY").workplane(offset=tp).pushPoints([(x, dy), (x, -dy)])
                 .circle(p["bolt_d"] / 2).extrude(p["housing_height"]))
        return h.cut(bore).cut(bolts)

    shaft = (cq.Workplane("YZ", origin=(-p["shaft_length"] / 2, 0, 0)).center(0, p["axis_z"])
             .circle(p["shaft_d"] / 2).extrude(p["shaft_length"]))
    return {"base_plate": plate, "housing_left": housing(-hx), "housing_right": housing(hx), "shaft": shaft}

result = build()
