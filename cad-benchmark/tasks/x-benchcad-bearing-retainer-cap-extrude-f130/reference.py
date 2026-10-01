import cadquery as cq

# --- parameters ---
# boss_diameter = 41.1
# boss_height = 29.6
# bore_diameter = 17.0
# collar_diameter = 65.9
# collar_height = 6.5
# ear_pcd_radius = 45.5
# ear_diameter = 21.1
# bolt_diameter = 10.6

result = (
    cq.Workplane("XY")
    .cylinder(29.6, 20.55)
    .union(
        cq.Workplane("XY")
            .transformed(offset=cq.Vector(0.0, 0.0, -15.3), rotate=cq.Vector(0, 0, 0))
            .moveTo(47.819, -10.292)
            .threePointArc((56.05, 0.0), (47.819, 10.292))
            .lineTo(4.516, 20.048)
            .threePointArc((0.0, 20.55), (-4.516, 20.048))
            .lineTo(-47.819, 10.292)
            .threePointArc((-56.05, 0.0), (-47.819, -10.292))
            .lineTo(-4.516, -20.048)
            .threePointArc((0.0, -20.55), (4.516, -20.048))
            .lineTo(47.819, -10.292)
            .close()
            .extrude(8.45)
    )
    .cut(
        cq.Workplane("XY")
            .transformed(offset=cq.Vector(45.5, 0.0, -12.05), rotate=cq.Vector(0, 0, 0))
            .cylinder(19.5, 5.3)
    )
    .cut(
        cq.Workplane("XY")
            .transformed(offset=cq.Vector(-45.5, 0.0, -12.05), rotate=cq.Vector(0, 0, 0))
            .cylinder(19.5, 5.3)
    )
    .faces(">Z").workplane()
    .hole(17.0)
)

# Export
show_object(result)