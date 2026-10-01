import cadquery as cq
import math

PARAMS = {
    "base_size": 60,
    "base_thickness": 5,
    "fin_count": 9,
    "fin_thickness": 1.6,
    "fin_height": 25,
    "fin_pitch": 7,
    "hole_d": 3.4,
    "hole_offset": 0
}

def build(p=PARAMS):
    # Create the base
    base = cq.Workplane("XY").box(p["base_size"], p["base_size"], p["base_thickness"], centered=True)
    
    # Create the fins
    fin_height = p["fin_height"]
    fin_pitch = p["fin_pitch"]
    fin_count = p["fin_count"]
    fin_thickness = p["fin_thickness"]
    
    # Create the fins on the top of the base
    fin_points = []
    for i in range(fin_count):
        x = -p["base_size"] / 2 + fin_pitch * (i + 1)
        fin_points.append((x, fin_height, 0))
    fin_points.append((p["base_size"] / 2, fin_height, 0))
    
    fin_cylinders = []
    for x, y, z in fin_points:
        cyl = cq.Workplane("YZ", origin=(x, 0, 0)).center(y, z).circle(p["fin_thickness"]).extrude(fin_height)
        fin_cylinders.append(cyl)
    
    fin_body = cq.Workplane("XY").union(fin_cylinders)
    
    # Create the through holes in the base
    hole_d = p["hole_d"]
    hole_offset = p["hole_offset"]
    hole_points = [(p["base_size"] / 2 - hole_offset, p["base_size"] / 2 - hole_offset, 0), (p["base_size"] / 2 + hole_offset, p["base_size"] / 2 + hole_offset, 0)]
    hole_holes = []
    for x, y, z in hole_points:
        hole_holes.append(cq.Workplane("XY").hole(hole_d, z))
    
    base = base.union(hole_holes)
    
    # Combine the base and fins
    result = base.union(fin_body)
    
    return result

result = build()
