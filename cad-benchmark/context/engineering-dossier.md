# Engineering context dossier — mechanical design cell (fictional organisation)

This dossier is the complete, unfiltered engineering context that a design cell would typically hand over with a request. It is used for the RAW configuration of the Lean AI comparison. The GROOMED configuration keeps only the sections tagged as relevant to the task, selected deterministically by tag — no model is involved in grooming.

## [std-units] Units and numeric conventions
All linear dimensions are millimetres and all angles are degrees unless stated otherwise. Dimensions in a request are nominal; do not apply tolerances to the CAD geometry itself. Model at nominal size; fits and tolerances are communicated in drawings, not by offsetting the solid. Diameters are always given as diameters (Ø), never radii, unless the word "radius" or the prefix R is used.

## [std-frame] Coordinate frame and placement
Every part is modelled in a single global right-handed coordinate system. The request states where the part sits: typically the bottom face on Z = 0 and the part centred on the origin in X and Y. Respect the stated placement exactly — automated checks probe the solid at fixed coordinates, so a correctly shaped part in the wrong place fails. "Along X" means the dimension measured in the X direction. For a hole "axis along X" means the hole is drilled in the X direction.

## [std-manufacturing] Manufacturability rules (machined aluminium and cast housings)
Minimum wall thickness 2.5 mm for machined aluminium, 3.5 mm for cast housings. Internal channels must keep at least 3 mm of material to any external face. Blind tapped holes need a drill depth at least 1.5 x the thread diameter. Avoid knife edges: no wall may taper to zero thickness. Internal corners of pockets machined with an end mill carry a radius; external vertical edges of housings are rounded for handling safety. Bosses that carry bearings need a wall of at least 0.2 x the bore diameter around the bore.

## [std-assembly] Assembly modelling rules
Each part is a separate solid in its assembled position in the common coordinate system. Parts may touch (share a face) where they are seated but must never interpenetrate. Rotating shafts run in bores with a stated radial clearance; the clearance is modelled explicitly (bore diameter = shaft diameter + 2 x radial clearance). Bolted interfaces use coaxial clearance holes through every clamped part. Naming of parts must follow the request exactly, because downstream tools find parts by name.

## [std-change] Engineering change practice
An engineering change request (ECR) modifies an existing released model. Change only what the ECR asks for. Every feature not mentioned in the ECR — interfaces, bolt patterns, envelopes, mounting features — is preserved exactly. Prefer changing the driving parameter rather than editing derived geometry, so that downstream features follow automatically. Keep the parameter names of the released model so that configuration tables remain valid. Return the complete modified program, not a diff.

## [part-plate] Design note — mounting plates
Mounting plates locate a sub-assembly on a machine frame. The corner holes are positioned relative to the plate edges (edge offset), so when the plate is resized the holes keep the same distance to the edges. The central bore provides clearance for a shaft or a cable gland. Corner radii on the vertical edges remove sharp corners for handling.

## [part-flange] Design note — pipe flanges
Flanges join pipe sections. The raised face concentrates the gasket load. Bolt holes are equally spaced on the pitch circle diameter (PCD); the angular position of the first hole is fixed by the request so that mating flanges align. The bore follows the pipe inside diameter. The bolt pattern is an interface: it must never change when other dimensions change.

## [part-bracket] Design note — angle brackets
Angle brackets carry loads between perpendicular faces. The inside bend fillet reduces stress concentration where base and upright meet. The gusset stiffens the angle and is centred across the width. Slots in the base allow position adjustment along X; holes in the upright are fixed fastening points. Slots and holes are placed relative to the side edges (edge offset) so that a wider bracket keeps the same edge distance.

## [part-heatsink] Design note — finned heat sinks
Extruded heat sinks carry an array of parallel fins on a base. The fin pattern is symmetric about the centre so that the heat source sits under the middle fin. Fin pitch is a design parameter: changing the fin count keeps the pitch and re-centres the pattern. Mounting holes sit in the gaps between fins so that a screwdriver can reach them.

## [part-housing] Design note — actuator gearbox housings
The housing is an open-top shell. The bearing boss on the +X wall carries the output-shaft bearing; the boss wall around the bore must stay at least 7 mm for stiffness. Screw columns in the four inner corners take the cover screws through blind tapped holes from the top face. The wall and floor thickness are driving parameters of the shell. The bearing bore follows the bearing outside diameter chosen by the supplier.

## [part-coldplate] Design note — liquid cold plates
Cold plates for accelerator modules carry coolant in an internal serpentine channel machined from below and closed by a brazed lid; in the CAD model the plate is a single solid with an enclosed channel. Every pass must be in series — a connection at the wrong end short-circuits the flow and leaves passes without coolant. Inlet and outlet ports are vertical holes from the top face into the first and last pass. Mounting holes sit outside the channel area.

## [part-shaft-support] Design note — shaft support assemblies
Two housings carry a shaft on a common base plate. Both bores are coaxial with the shaft. The housings are bolted to the plate with coaxial clearance holes. The clearance holes in the plate follow the housing positions, and the bores follow the shaft diameter with a constant radial clearance.

## [api-core] CadQuery essentials
Start from `cq.Workplane("XY")`. `rect(w, h)` and `circle(r)` draw centred 2D shapes on the current workplane; `extrude(d)` extrudes them along the workplane normal. `box(x, y, z, centered=False)` creates a box with its corner at the origin; with the default `centered=True` the box is centred in all three axes. `workplane(offset=z)` creates a parallel workplane offset along the normal. `center(x, y)` moves the workplane origin. `pushPoints([(x, y), ...])` places the next 2D operation at several points. Combine solids with `a.union(b)`, `a.cut(b)` and `a.intersect(b)`. The planes "XY", "YZ" and "XZ" have normals +Z, +X and -Y respectively. `circle()` takes a RADIUS, so a Ø9 hole is `circle(4.5)`.

## [api-holes] CadQuery holes
`hole(d)` drills a through hole of DIAMETER d, centred on each point of the current workplane, through the whole solid. A blind hole of depth h: `hole(d, h)`. To drill from the top face: `.faces(">Z").workplane().pushPoints(pts).hole(d)`. Holes along X can be cut with a cylinder built on a "YZ" workplane: `cq.Workplane("YZ", origin=(x0, 0, 0)).center(y, z).circle(r).extrude(length)` and then `body.cut(cyl)`.

## [api-patterns] CadQuery patterns
Linear arrays: `rarray(xSpacing, ySpacing, xCount, yCount)` places points centred on the workplane origin. Polar arrays: `polarArray(radius, startAngle, angle, count)` places points on a circle, starting at startAngle degrees measured from +X. Alternatively compute the points in Python (e.g. with `math.cos` and `math.sin`) and use `pushPoints`.

## [api-fillets] CadQuery fillets and chamfers
`edges("|Z").fillet(r)` rounds all edges parallel to Z. Select a single edge near a point with `edges(cq.selectors.NearestToPointSelector((x, y, z)))`. Fillet before cutting holes through the filleted region where possible. A fillet larger than the adjacent faces fails with a kernel error; reduce the radius or change the order of operations.

## [api-sketch] CadQuery slots and sketches
`slot2D(length, diameter, angle=0)` draws a slot with rounded ends; `length` is the OVERALL length, `diameter` the slot width; it is centred on each pushed point. Triangles and other polygons: `polyline([(x1, y1), (x2, y2), (x3, y3)]).close().extrude(t)`.

## [api-shell] CadQuery shells and pockets
An open-top shell can be made by cutting an inner box from an outer box: outer = rect(L, W).extrude(H); inner = workplane(offset=floor).rect(L - 2*wall, W - 2*wall).extrude(H - floor); body = outer.cut(inner). The `shell()` operation also works: `faces(">Z").shell(-wall)` removes the top face and hollows inward, but it gives a floor equal to the wall thickness.

## [api-boolean] CadQuery internal features
Enclosed internal features are made by cutting a solid that lies entirely inside the body: build the channel as a union of boxes and `body.cut(channel)`. A cut that touches an outer face opens the body — check every box extent against the outer dimensions. Ports into an internal channel are cylinders cut from the top face down to the channel.

## [api-assembly] CadQuery multi-part results
For an assembly, build each part as its own Workplane in its final position and return a Python dict `{"name": workplane, ...}`. Do not union the parts together. Position parts with workplane offsets and `center()`, or with `.translate((x, y, z))`.

## [noise-materials] Material datasheet extract — EN AW-6061-T6
Density 2.70 g/cm³. Tensile strength Rm ≥ 290 MPa, yield Rp0.2 ≥ 240 MPa, elongation A ≥ 8 %. Young's modulus 68.9 GPa, Poisson ratio 0.33. Thermal conductivity 167 W/m·K, coefficient of thermal expansion 23.6 µm/m·K (20–100 °C). Specific heat 896 J/kg·K. Good machinability, good corrosion resistance, weldable (TIG/MIG) with loss of temper in the heat-affected zone. Anodising: type II decorative or type III hard coat, 25–50 µm. Typical applications: frames, brackets, housings, heat sinks, cold plates. Supplied as plate (6–150 mm), bar, and extruded profiles. Certificates: EN 10204 3.1 required for every batch. Storage: dry, indoor, separated from steel to avoid galvanic contamination.

## [noise-materials] Material datasheet extract — EN-GJS-500-7 (ductile cast iron)
Tensile strength ≥ 500 MPa, yield ≥ 320 MPa, elongation ≥ 7 %. Hardness 170–230 HB. Density 7.1 g/cm³. Good castability for complex housings; machining allowance 2–3 mm per face on cast surfaces. Minimum cast wall 4 mm for sand casting. Draft angles 1–3° on vertical cast faces unless machined. Ultrasonic inspection of critical sections per EN 12680-3. Not used for the parts in this benchmark's current release.

## [noise-materials] Material datasheet extract — 1.4404 stainless steel
Austenitic stainless steel (316L). Tensile 500–700 MPa, yield ≥ 200 MPa, elongation ≥ 40 %. Excellent corrosion resistance including chlorides. Thermal conductivity 15 W/m·K. Poor machinability relative to aluminium; use sharp tools and generous coolant. Passivation per ASTM A967 after machining. Used for wetted parts in coolant loops when aluminium compatibility with the coolant cannot be guaranteed.

## [noise-quality] Supplier quality manual — excerpt chapter 7 (first article inspection)
7.1 A first article inspection report (FAIR) is required for every new part number, every revision change affecting form, fit or function, and after a production lapse of more than 24 months. 7.2 The FAIR covers 100 % of drawing characteristics, including notes. Each characteristic is ballooned on the drawing and reported with the measured value, the method and the gauge identifier. 7.3 Material and special-process certificates are attached. 7.4 The supplier may not ship production quantities before written FAIR approval. 7.5 Deviations are requested through the deviation request form DRF-02 and are valid for a stated quantity only. 7.6 Gauges must be calibrated and traceable to national standards; calibration interval maximum 12 months. 7.7 Measurement system analysis (gauge R&R) below 10 % is required for characteristics marked as critical; 10–30 % is acceptable with justification. 7.8 Records are retained for 15 years.

## [noise-quality] Supplier quality manual — excerpt chapter 9 (packaging)
Parts are packed in VCI bags, individually separated, with machined faces protected by caps or foam. Labels carry part number, revision, quantity, batch, date of manufacture and supplier code in clear text and as a GS1-128 barcode. Maximum pallet weight 800 kg; pallets are four-way entry, heat treated per ISPM 15. Mixed revisions in one shipment are not permitted.

## [noise-tests] Test report TR-2291 — thermal cycling of a previous cold plate revision
Specimen: cold plate rev. B (superseded). 500 cycles between −20 °C and +85 °C, 30 min dwell, ramp 5 K/min. Leak test before and after at 6 bar helium, acceptance < 1e-6 mbar·l/s. Result: pass at 500 cycles; braze joint microsection shows no voids above 0.2 mm. Pressure drop at 2 l/min water/glycol 70/30 at 25 °C: 0.21 bar. Thermal resistance at 1 kW heat load: 0.018 K/W. Recommendation: proceed with rev. C channel geometry (8 x 4 mm, 5 passes), which is the subject of the current design request.

## [noise-tests] Test report TR-2304 — bracket static load test
Specimen: angle bracket rev. A, 6061-T6, 6 mm thick, without gusset. Load 1.2 kN at the upright hole line, 50 mm lever. Measured deflection 0.84 mm, permanent set 0.11 mm after unloading, above the 0.05 mm limit. Root cause: bending at the inside bend. Corrective action: add a central gusset and an inside bend fillet (implemented in rev. B, the subject of the current request).

## [noise-minutes] Design review minutes DR-118 (extract)
Attendees: design, manufacturing engineering, quality, purchasing. Topics: 1) Supplier capacity for the next quarter — machined parts lead time is now eight weeks; purchasing to qualify a second source. 2) Drawing template update — new title block from next month; existing drawings are updated at the next revision only. 3) PLM migration — CAD vault cut-over planned over a weekend; no check-ins during the freeze window. 4) Housing cover screws — manufacturing asks to standardise on M5 across product lines; decision deferred, current designs keep M5 tapping drill Ø4.2. 5) Cost reduction — review of anodise colour options; black anodise retained for customer-visible parts only. Actions: purchasing (second source), design (template), IT (migration communication).

## [noise-minutes] Programme status report — week 37 (extract)
Overall status amber. Three ECRs open, two in review. Tooling for the cast housing variant delayed by two weeks due to pattern rework. Thermal validation of the cold plate rev. C scheduled for week 41. Budget consumption 64 % at 58 % of schedule. Risks: single-source bearing supplier (mitigation: second bearing size qualified — see ECR-0587); late customer requirement on connector orientation (under assessment). Staffing: one mechanical designer joins in week 39.

## [noise-erp] ERP item master extract
ITEM 400-1180 MOUNTING PLATE 120x80 AL6061 — status released, make, routing MILL-03, standard cost 18.40 EUR, lot size 50. ITEM 400-1220 FLANGE DN65 PN16 STYLE — released, buy, supplier S-0412, lead time 35 days, standard cost 42.10 EUR. ITEM 400-1305 ANGLE BRACKET 80x50x60 — released, make, routing MILL-01/DEBURR, cost 9.75 EUR. ITEM 400-1410 HEAT SINK 60x60 — released, buy (extrusion + machining), supplier S-0877, cost 6.30 EUR. ITEM 400-1550 ACTUATOR HOUSING — released, make, routing MILL-05 5-axis, cost 61.00 EUR. ITEM 400-1602 COLD PLATE 120x80 — in development, make, braze outsourced S-0990. ITEM 400-1700 SHAFT SUPPORT ASSY — in development, phantom BOM. ITEM 900-0050 SCREW ISO 4762 M8x25 8.8 ZN — buy, cost 0.11 EUR. ITEM 900-0230 BEARING 6006-2RS (Ø30 x Ø55 x 13) — buy, single source. ITEM 900-0231 BEARING 6202-2RS (Ø15 x Ø35 x 11) — buy, alternate source qualified.

## [noise-history] Revision history of unrelated parts
Part 400-0920 cable clamp: rev. A initial release; rev. B slot widened 6 to 6.5 mm for cable tolerance; rev. C material changed to PA66-GF30. Part 400-0935 sensor bracket: rev. A initial; rev. B hole pattern moved 2 mm for sensor variant; rev. C anodise added. Part 400-0951 cover plate: rev. A initial; rev. B screw holes changed from M4 to M5 clearance; rev. C logo engraving removed. Part 400-0977 spacer: rev. A initial; rev. B length tolerance tightened to ±0.05 mm; rev. C chamfer 0.5 x 45° added both ends. Part 400-0990 knob: rev. A initial; rev. B knurl pitch changed; rev. C colour changed to RAL 7016.

## [noise-legal] Confidentiality and export notice
This dossier is a fictional example created for benchmarking. It contains no real customer, supplier or programme information. In a real organisation such a dossier would carry a confidentiality classification, an export-control classification number (where applicable) and handling instructions, which are reproduced here only to make the RAW context representative of what engineers actually receive.
