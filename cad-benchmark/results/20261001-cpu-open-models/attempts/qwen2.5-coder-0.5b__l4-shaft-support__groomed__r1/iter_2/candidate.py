import cadquery as cq

# Define the parameters
PARAMS = {
    "plate_length": 160,
    "plate_width": 60,
    "plate_thickness": 10,
    "housing_x": 20,
    "housing_width": 56,
    "housing_depth": 45,
    "housing_height": 10,
    "axis_z": 0,
    "shaft_d": 20,
    "shaft_length": 140,
    "bolt_d": 0.2,
    "bolt_dy": 20
}

# Define the build function
def build(p=PARAMS):
    # Create the base plate
    base_plate = cq.Workplane("XY", origin=(0, 0, 0))
    base_plate.pushPoints([(0, 0), (plate_length, 0), (plate_length, plate_thickness), (0, plate_thickness)])
    
    # Create the housing left
    housing_left = cq.Workplane("YZ", origin=(housing_x, 0, 0))
    housing_left.pushPoints([(housing_x, 0), (housing_x, housing_width), (housing_width, housing_depth), (housing_x, housing_height)])
    
    # Create the housing right
    housing_right = cq.Workplane("YZ", origin=(housing_x, housing_width, 0))
    housing_right.pushPoints([(housing_x, housing_width), (housing_x, housing_width), (housing_width, housing_depth), (housing_x, housing_height)])
    
    # Create the shaft
    shaft = cq.Workplane("XY", origin=(housing_x, housing_width, housing_depth))
    shaft.pushPoints([(housing_x, housing_width), (housing_x, housing_width), (housing_width, housing_depth), (housing_x, housing_depth)])
    
    # Create the bolted interface
    bolt_d = cq.Workplane("XY", origin=(housing_x, housing_width, housing_depth))
    bolt_d.pushPoints([(housing_x, housing_width), (housing_x, housing_width), (housing_width, housing_depth), (housing_x, housing_depth)])
    
    # Combine the parts
    result = base_plate.union(housing_left).union(housing_right).union(shaft).union(bolt_d)
    
    return result

# Call the build function and print the result
result = build()
print(result)
