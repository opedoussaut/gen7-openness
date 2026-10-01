import cadquery as cq

# --- parameters ---
# outer_radius = 22.9
# inner_radius = 10.5
# n_convolutions = 4
# convolution_height = 10.4
# taper_factor = 0.199

result = (
    cq.Workplane("XY")
    .polyline([(6.16, 0.0), (30.0, 0.0), (10.369, 10.4), (22.615, 20.8), (10.108, 31.2), (21.476, 41.6), (9.847, 52.0), (20.337, 62.4), (9.586, 72.8), (19.197, 83.2), (6.16, 83.2), (6.16, 0.0)])
    .close()
    .revolve(360, (0, 0, 0), (0, 1, 0))
)

# Export
show_object(result)