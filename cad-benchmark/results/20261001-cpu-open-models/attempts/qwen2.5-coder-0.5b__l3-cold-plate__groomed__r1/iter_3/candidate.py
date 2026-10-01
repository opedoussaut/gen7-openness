import cadquery as cq

# Define the PARAMS dictionary
PARAMS = {
    "length": 120,
    "width": 80,
    "thickness": 12,
    "channel_width": 8,
    "channel_height": 4,
    "channel_z": 4,
    "passes": 5,
    "pass_pitch": 1,
    "straight_half": True,
    "port_d": 8,
    "mount_hole_d": 6.6,
    "mount_dx": 54,
    "mount_dy": 34
}

# Define the build function
def build(p=PARAMS):
    # Create a Workplane with the specified dimensions
    workplane = cq.Workplane("XY")
    
    # Draw the cold plate
    rect = cq.rect(p["length"], p["width"])
    workplane.pushPoints([(0, 0), (p["length"], 0), (p["length"], p["width"]), (0, p["width"])])
    
    # Draw the internal serpentine channel
    circle = cq.circle(p["channel_width"])
    workplane.pushPoints([(0, 0), (p["channel_width"], 0), (p["channel_width"], p["channel_height"]), (0, p["channel_height"])])
    
    # Draw the four through mounting holes
    for i in range(p["passes"]):
        # Draw the through hole
        hole = cq.hole(p["channel_height"])
        workplane.pushPoints([(0, 0), (p["channel_height"], 0), (p["channel_height"], p["channel_height"]), (0, p["channel_height"])])
        
        # Draw the mounting hole
        hole = cq.hole(p["mount_hole_d"])
        workplane.pushPoints([(0, 0), (p["mount_hole_d"], 0), (p["mount_hole_d"], p["mount_hole_d"]), (0, p["mount_hole_d"])])
    
    # Return the Workplane containing the solid
    return workplane

# Call the build function and store the result
result = build()
