"""Diagram builders for the GEN7 Cameo MBSE agent: explicit layouts (no blind auto-layout), colours, native export.

Every diagram is created inside CATIA Magic, laid out with explicit coordinates, coloured through the Cameo API and
exported with Cameo's own image export. GEN7 only displays the exported PNGs.
"""
from __future__ import annotations

import json
import os
import time

from build_model import COLORS, lib_type, eid

DIAGRAMS = {
    "context": "AI Factory Cooling System — System Context",
    "system_v1": "AI Factory Cooling System — Loop A v1",
    "system_v2": "AI Factory Cooling System — Loop A v2",
    "internal_v1": "Loop A v1 — Internal Architecture",
    "internal_v2": "Loop A v2 — Internal Architecture",
    "thermal_flow": "AI Factory — Thermal Flow",
    "traceability": "Thermal Requirement Traceability",
    "verification_v1": "Loop A v1 — Verification",
    "verification_v2": "Loop A v2 — Verification",
    "evolution": "Loop A v1 → v2 — Architecture Evolution",
}

STATUS_COLOR = {"PASS": COLORS["pass"], "FAIL": COLORS["fail"], "LOW MARGIN": COLORS["low"],
                "UNCHANGED": COLORS["unchanged"], "MODIFIED": COLORS["modified"], "ADDED": COLORS["added"]}

# ---------------------------------------------------------------- context / complete system
def _ctx_geometry(nested: bool):
    """Explicit geometry (x, y, w, h) of the system-level views. Tall shapes span the rows they connect to,
    so every chain connector is a straight horizontal line."""
    if not nested:
        G = {"compute": (30, 205, 200, 70), "coldplates": (290, 205, 200, 70), "rackmani": (550, 100, 220, 280),
             "loopA": (840, 100, 300, 80), "loopB": (840, 300, 200, 80), "control": (840, 470, 300, 70),
             "hx": (1220, 100, 220, 280), "fw": (1510, 205, 220, 70), "plant": (1800, 100, 200, 280),
             "reject": (2070, 100, 220, 80), "recover": (2070, 300, 220, 80)}
        rows = {"loopA": 140, "loopB": 340}
    else:
        G = {"compute": (30, 205, 200, 70), "coldplates": (290, 205, 200, 70), "rackmani": (550, 100, 220, 480),
             "loopA": (840, 40, 1000, 400), "loopB": (840, 500, 240, 80), "control": (840, 640, 300, 70),
             "hx": (1920, 100, 220, 480), "fw": (2210, 205, 220, 70), "plant": (2500, 100, 200, 480),
             "reject": (2770, 100, 220, 80), "recover": (2770, 500, 220, 80)}
        rows = {"loopA": 240, "loopB": 540}
    return G, rows


def _ctx_routes(G, rows, nested):
    """Endpoints and break points for each chain connector (a, z) → (source, target, breaks)."""
    cy = lambda k: G[k][1] + G[k][3] // 2
    right = lambda k, y: (G[k][0] + G[k][2], y)
    left = lambda k, y: (G[k][0], y)
    main = 240
    R = {("compute", "coldplates"): (right("compute", main), left("coldplates", main), []),
         ("coldplates", "rackmani"): (right("coldplates", main), left("rackmani", main), []),
         ("rackmani", "loopA"): (right("rackmani", rows["loopA"]), left("loopA", rows["loopA"]), []),
         ("rackmani", "loopB"): (right("rackmani", rows["loopB"]), left("loopB", rows["loopB"]), []),
         ("loopA", "hx"): (right("loopA", rows["loopA"]), left("hx", rows["loopA"]), []),
         ("loopB", "hx"): (right("loopB", rows["loopB"]), left("hx", rows["loopB"]), []),
         ("hx", "fw"): (right("hx", main), left("fw", main), []),
         ("fw", "plant"): (right("fw", main), left("plant", main), []),
         ("plant", "reject"): (right("plant", cy("reject")), left("reject", cy("reject")), []),
         ("plant", "recover"): (right("plant", cy("recover")), left("recover", cy("recover")), [])}
    cx, cyy, cw, ch = G["control"]
    lbx = G["loopB"][0] + G["loopB"][2] // 2
    R[("control", "loopB")] = ((lbx, cyy), (lbx, G["loopB"][1] + G["loopB"][3]), [])
    ax = G["loopB"][0] + G["loopB"][2] + 40
    R[("control", "loopA")] = ((ax, cyy), (ax, G["loopA"][1] + G["loopA"][3]), [])
    return R


def _loop_geometry(cid, cfg, x0, y0, scale=1.0):
    """Geometry of Loop A components (absolute coordinates). Used inside the complete-system views (scaled) and the
    internal-architecture views (scale 1)."""
    tags = {c["tag"]: c for c in cfg["components"]}
    pumps = [t for t in tags if t.startswith("P-")]
    a1 = [p for p in pumps if p.startswith("P-101") or p.startswith("P-201")]
    a2 = [p for p in pumps if p not in a1]
    hxs = [t for t in tags if t.startswith("HX-")]
    rm = next(t for t in tags if t.startswith("RM-"))
    sm = next(t for t in tags if t.startswith("SM-"))
    k = lambda v: int(round(v * scale))
    rows = [k(250), k(450)]
    G = {rm: (0, k(140), k(150), k(420)), sm: (k(940), k(140), k(150), k(420))}
    for r, ps in zip(rows, (a1, a2)):
        if len(ps) == 1:
            G[ps[0]] = (k(280), r - k(40), k(170), k(80))
        else:
            G[ps[0]] = (k(280), r - k(82), k(170), k(64))
            G[ps[1]] = (k(280), r + k(18), k(170), k(64))
    for r, h in zip(rows, hxs):
        G[h] = (k(580), r - k(60), k(200), k(120))
    G = {t: (x0 + x, y0 + y, w, h) for t, (x, y, w, h) in G.items()}
    rows = [y0 + r for r in rows]
    return tags, G, rows, (rm, sm, hxs, a1, a2)


def _coolant_routes(cfg, G, rows, parts, scale=1.0):
    """Port positions and orthogonal routes of the coolant path RM → pumps → HX → SM."""
    rm, sm, hxs, a1, a2 = parts
    k = lambda v: int(round(v * scale))
    mid = lambda t: G[t][1] + G[t][3] // 2
    ports, routes = {}, {}
    rmx = G[rm][0] + G[rm][2]
    ports[(rm, "out")] = (rmx, mid(rm))
    ports[(sm, "in")] = (G[sm][0], mid(sm))
    vx1 = rmx + (G[a1[0]][0] - rmx) // 2
    for r, (h, ps) in enumerate(zip(hxs, (a1, a2))):
        ports[(h, "in")] = (G[h][0], rows[r])
        ports[(h, "out")] = (G[h][0] + G[h][2], rows[r])
        for p in ps:
            ports[(p, "in")] = (G[p][0], mid(p))
            ports[(p, "out")] = (G[p][0] + G[p][2], mid(p))
            routes[(rm, p)] = (ports[(rm, "out")], ports[(p, "in")], [(vx1, mid(rm)), (vx1, mid(p))])
            vx2 = G[p][0] + G[p][2] + (G[h][0] - G[p][0] - G[p][2]) // 2
            routes[(p, h)] = (ports[(p, "out")], ports[(h, "in")], [] if mid(p) == rows[r] else [(vx2, mid(p)), (vx2, rows[r])])
        vx3 = G[h][0] + G[h][2] + (G[sm][0] - G[h][0] - G[h][2]) // 2
        routes[(h, sm)] = (ports[(h, "out")], ports[(sm, "in")], [(vx3, rows[r]), (vx3, mid(sm))])
    return ports, routes


async def _context_like(b, key, block_key, loop_detail: str | None):
    s, spec = b.s, b.spec
    did = await b.new_diagram(key, "ibd", DIAGRAMS[key], s[f"{block_key}.block"])
    nested = loop_detail is not None
    G, rows = _ctx_geometry(nested)
    pe, colors = {}, {}
    for part in spec["context"]["parts"]:
        k = part["key"]
        x, y, w, h = G[k]
        pe[k] = await b.place(did, k, s[f"{block_key}.part.{k}"], x, y, w, h)
        colors[pe[k]] = COLORS["loop"] if k == "loopA" else COLORS["context"]
    R = _ctx_routes(G, rows, nested)
    drawn = await b.paths(did, [(s.get(f"{block_key}.con.{a}.{z}"), pe[a], pe[z]) for a, z, _ in spec["context"]["chain"]])
    routes = [(s.get(f"{block_key}.con.{a}.{z}"), *R[(a, z)]) for a, z, _ in spec["context"]["chain"]]
    if nested:
        cid = loop_detail
        cfg = spec["configs"][cid]
        lx, ly, lw, lh = G["loopA"]
        sc = 0.8
        tags, LG, lrows, parts = _loop_geometry(cid, cfg, lx + 40, ly - 60, sc)
        ports, croutes = _coolant_routes(cfg, LG, lrows, parts, sc)
        npe = {}
        for t, (x, y, w, h) in LG.items():
            npe[t] = await b.place(did, t, s[f"{cid}.part.{t}"], x, y, w, h, container=pe["loopA"])
            colors[npe[t]] = STATUS_COLOR[tags[t]["status"]] if cid == "v2" else COLORS["neutral"]
        await b.props(did, list(npe.values()), {"Show Classifier": False})
        await b.resize(did, {npe[t]: LG[t] for t in LG})
        pshape = {}
        for (t, pname), (px, py) in ports.items():
            pshape[(t, pname)] = await b.place(did, f"{t}.{pname}", s[f"port.{lib_type(tags[t])}.{pname}"], px - 7, py - 7, container=npe[t])
        items, keys = [], []
        for a, z in cfg["topology"]["coolant"]:
            items.append((s.get(f"{cid}.con.{a}.{z}"), pshape[(a, "out")], pshape[(z, "in")]))
            keys.append((a, z))
        await b.paths(did, items)
        routes += [(s.get(f"{cid}.con.{a}.{z}"), *croutes[(a, z)]) for a, z in keys]
    await b.route(did, routes)
    flows = [(s.get(f"{block_key}.con.{a}.{z}.flow"), *R[(a, z)]) for a, z, _ in spec["context"]["chain"]]
    if nested:
        flows += [(s.get(f"{loop_detail}.con.{a}.{z}.flow"), *croutes[(a, z)]) for a, z in keys]
    await b.route_flows(did, flows)
    await b.labels(did)
    await b.color(did, colors)
    return await b.export(key, did, DIAGRAMS[key], "SysML Internal Block Diagram")


# ---------------------------------------------------------------- Loop A internal architecture
async def _internal(b, key, cid):
    s, spec = b.s, b.spec
    cfg = spec["configs"][cid]
    did = await b.new_diagram(key, "ibd", DIAGRAMS[key], s[f"{cid}.block"])
    tags, G, rows, parts = _loop_geometry(cid, cfg, 140, 0)
    ports, R = _coolant_routes(cfg, G, rows, parts)
    rm, sm, hxs, a1, a2 = parts
    tc = next(t for t in tags if t.startswith("TC-"))
    sensors = [t for t in tags if tags[t]["kind"] == "sensor"]
    hxc = lambda h: G[h][0] + G[h][2] // 2
    G["CV-101"] = (hxc(hxs[0]) - 80, 30, 160, 56)
    G["CV-102"] = (hxc(hxs[1]) - 80, 614, 160, 56)
    sx0, pitch, sw = 440, 128, 118
    for i, t in enumerate(sensors):
        G[t] = (sx0 + i * pitch, 730, sw, 56)
    G[tc] = (330, 870, sx0 + len(sensors) * pitch - 10 - 330, 70)
    # facility ports
    ports[("CV-101", "fw")] = (hxc(hxs[0]), 86)
    ports[(hxs[0], "fw")] = (hxc(hxs[0]), G[hxs[0]][1])
    ports[("CV-102", "fw")] = (hxc(hxs[1]), 614)
    ports[(hxs[1], "fw")] = (hxc(hxs[1]), G[hxs[1]][1] + G[hxs[1]][3])
    R[("CV-101", hxs[0])] = (ports[("CV-101", "fw")], ports[(hxs[0], "fw")], [])
    R[("CV-102", hxs[1])] = (ports[("CV-102", "fw")], ports[(hxs[1], "fw")], [])
    # signals: every sensor drops to a measurement bus just above the controller
    tcx, tcy, tcw, tch = G[tc]
    sig_x, bus_y = tcx + tcw // 2 + 40, tcy - 30
    ports[(tc, "sig")] = (sig_x, tcy)
    for t in sensors:
        x, y, w, h = G[t]
        ports[(t, "sig")] = (x + w // 2, y + h)
        R[(t, tc)] = (ports[(t, "sig")], ports[(tc, "sig")], [(x + w // 2, bus_y), (sig_x, bus_y)])
    # commands: one bus on the left, between the return manifold and the pumps
    bus_x = G[rm][0] + G[rm][2] + 90
    ports[(tc, "cmd")] = (bus_x, tcy)
    for a, z in cfg["topology"]["command"]:
        x, y, w, h = G[z]
        if z.startswith("P-"):
            ports[(z, "cmd")] = (x, y + int(h * 0.82))
        else:
            ports[(z, "cmd")] = (x, y + h // 2)
        R[(tc, z)] = (ports[(tc, "cmd")], ports[(z, "cmd")], [(bus_x, ports[(z, "cmd")][1])])
    pe, colors = {}, {}
    for t, (x, y, w, h) in G.items():
        pe[t] = await b.place(did, t, s[f"{cid}.part.{t}"], x, y, w, h)
        colors[pe[t]] = STATUS_COLOR[tags[t]["status"]] if cid == "v2" else COLORS["neutral"]
    pshape = {}
    for (t, pname), (px, py) in ports.items():
        pshape[(t, pname)] = await b.place(did, f"{t}.{pname}", s[f"port.{lib_type(tags[t])}.{pname}"], px - 7, py - 7, container=pe[t])
    topo = cfg["topology"]
    pairs = [(a, z, "out", "in") for a, z in topo["coolant"]] + [(a, z, "fw", "fw") for a, z in topo["facility"]] + \
            [(a, z, "sig", "sig") for a, z in topo["signal"]] + [(a, z, "cmd", "cmd") for a, z in topo["command"]]
    drawn = await b.paths(did, [(s.get(f"{cid}.con.{a}.{z}"), pshape[(a, pa)], pshape[(z, pz)]) for a, z, pa, pz in pairs])
    await b.route(did, [(s.get(f"{cid}.con.{a}.{z}"), *R[(a, z)]) for a, z, _, _ in pairs])
    await b.route_flows(did, [(s.get(f"{cid}.con.{a}.{z}.flow"), *R[(a, z)]) for a, z, _, _ in pairs])
    await b.props(did, [pe[t] for t in sensors], {"Show Classifier": False})
    await b.resize(did, {pe[t]: G[t] for t in sensors})
    await b.labels(did)
    await b.color(did, colors)
    return await b.export(key, did, DIAGRAMS[key], "SysML Internal Block Diagram")


# ---------------------------------------------------------------- thermal flow
async def _thermal(b, key):
    s, spec = b.s, b.spec
    did = await b.new_diagram(key, "activity", DIAGRAMS[key], s["tf.act"])
    n = len(spec["thermalFlow"])
    pe, colors = {}, {}
    half = (n + 1) // 2
    for i in range(n):
        if i < half:
            x, y = 110 + i * 250, 80
        else:
            x, y = 110 + (n - 1 - i) * 250, 300
        pe[i] = await b.place(did, f"a{i}", s[f"tf.a{i}"], x, y, 200, 64)
        colors[pe[i]] = COLORS["action"]
    pe["init"] = await b.place(did, "init", s["tf.init"], 30, 100, 26, 26)
    pe["final"] = await b.place(did, "final", s["tf.final"], 30, 318, 30, 30)
    paths = [(s["tf.f.init"], pe["init"], pe[0])] + [(s[f"tf.f{i}"], pe[i], pe[i + 1]) for i in range(n - 1)] + [(s["tf.f.final"], pe[n - 1], pe["final"])]
    await b.paths(did, paths)
    await b.color(did, colors)
    return await b.export(key, did, DIAGRAMS[key], "Activity Diagram")


# ---------------------------------------------------------------- traceability
async def _trace(b, key):
    s, spec = b.s, b.spec
    did = await b.new_diagram(key, "requirement", DIAGRAMS[key], s["pkg.views"])
    v1s4 = next(x for x in spec["configs"]["v1"]["scenarios"] if x["id"] == "S4")
    v2s4 = next(x for x in spec["configs"]["v2"]["scenarios"] if x["id"] == "S4")
    P = {
        "stk": (s["req.STK-001"], 30, 40, 280, 140), "proj": (s["ana.projected"], 30, 300, 280, 120),
        "req": (s["req.REQ-FUTURE-001"], 420, 150, 330, 170),
        "f2": (s["fn.F2"], 860, 40, 260, 60), "loop": (s["loop.base"], 1230, 40, 200, 70),
        "v2": (s["v2.block"], 1230, 230, 200, 70), "eval": (s["ana.eval"], 900, 620, 330, 70),
        "tc1": (s[f"tc.v1.S4"], 250, 450, 330, 64), "tc2": (s[f"tc.v2.S4"], 620, 450, 330, 64),
    }
    pe = {}
    for k, (e, x, y, w, h) in P.items():
        pe[k] = await b.place(did, k, e, x, y, w, h)
    rels = [
        (s["rel.derive.FUTURE"], pe["req"], pe["stk"]), (s["rel.refine.projected"], pe["proj"], pe["req"]),
        (s["rel.trace.F2"], pe["f2"], pe["req"]), (s["rel.alloc.F2"], pe["f2"], pe["loop"]), (s["v2.gen"], pe["v2"], pe["loop"]),
        (s["rel.sat.v2.REQ-FUTURE-001"], pe["v2"], pe["req"]), (s["rel.trace.eval"], pe["eval"], pe["v2"]),
        (s["rel.ver.v1.S4.REQ-FUTURE-001"], pe["tc1"], pe["req"]), (s["rel.ver.v2.S4.REQ-FUTURE-001"], pe["tc2"], pe["req"]),
        (s["rel.tc.trace.v1.S4"], pe["tc1"], pe["eval"]), (s["rel.tc.trace.v2.S4"], pe["tc2"], pe["eval"]),
    ]
    await b.paths(did, rels)
    await b.prune(did, [r for r, _, _ in rels])
    await b.c.call("cameo_set_shape_compartments", "Hide the parts list of Loop A v2 on this view", allow_fail=True,
                   diagram_id=did, presentation_id=pe["v2"], compartments={"showParts": False})
    await b.color(did, {pe["tc1"]: STATUS_COLOR[v1s4["status"]], pe["tc2"]: STATUS_COLOR[v2s4["status"]], pe["v2"]: COLORS["loop"], pe["loop"]: COLORS["context"],
                        pe["stk"]: COLORS["req"], pe["req"]: COLORS["req"], pe["proj"]: COLORS["neutral"], pe["f2"]: COLORS["action"], pe["eval"]: COLORS["action"]})
    return await b.export(key, did, DIAGRAMS[key], "Requirement Diagram")


# ---------------------------------------------------------------- verification
async def _verification(b, key, cid):
    s, spec = b.s, b.spec
    did = await b.new_diagram(key, "requirement", DIAGRAMS[key], s[f"pkg.ver"])
    verdict = {v["id"]: v["verdict"] for v in spec["verification"][cid]}
    sc = {x["id"]: x for x in spec["configs"][cid]["scenarios"]}
    # Requirements grouped above the test cases that verify them: S2 | S1 + S3 (envelope) | S4 (future).
    groups = [(["REQ-THERM-001", "REQ-AVAIL-001", "REQ-EFF-001"], ["S2"]),
              (["REQ-THERM-002", "REQ-THERM-003", "REQ-FLOW-001", "REQ-PRESS-001"], ["S1", "S3"]),
              (["REQ-FUTURE-001"], ["S4"])]
    pe, colors = {}, {}
    x, W, gap = 30, 260, 20
    for reqs, tcs in groups:
        gx = x
        for rid in reqs:
            pe[rid] = await b.place(did, rid, s[f"req.{rid}"], x, 30, W, 170)
            colors[pe[rid]] = STATUS_COLOR[verdict[rid]]
            x += W + gap
        span = x - gap - gx
        tw = 300
        for i, t in enumerate(tcs):
            tx = gx + (span - len(tcs) * tw - (len(tcs) - 1) * 40) // 2 + i * (tw + 40)
            k = f"tc.{cid}.{t}"
            pe[k] = await b.place(did, k, s[k], tx, 330, tw, 74)
            colors[pe[k]] = STATUS_COLOR[sc[t]["status"]]
        x += 60
    rels = []
    for t in sc:
        for r in spec["requirements"]:
            rk = f"rel.ver.{cid}.{t}.{r['id']}"
            if rk in s:
                rels.append((s[rk], pe[f"tc.{cid}.{t}"], pe[r["id"]]))
    await b.paths(did, rels)
    await b.prune(did, [r for r, _, _ in rels])
    await b.color(did, colors)
    return await b.export(key, did, DIAGRAMS[key], "Requirement Diagram")


# ---------------------------------------------------------------- evolution
async def _evolution(b, key):
    s, spec = b.s, b.spec
    did = await b.new_diagram(key, "bdd", DIAGRAMS[key], s["pkg.views"])
    rel = await b.rel("rel.evolves", "trace", s["v2.block"], s["v1.block"], "Loop A v2 evolves from Loop A v1", name="evolves from")
    pe = {}
    pe["loop"] = await b.place(did, "loop", s["loop.base"], 520, 30, 220, 70)
    pe["v1"] = await b.place(did, "v1", s["v1.block"], 40, 200, -1, -1)
    pe["v2"] = await b.place(did, "v2", s["v2.block"], 800, 200, -1, -1)
    rels = [(s["v1.gen"], pe["v1"], pe["loop"]), (s["v2.gen"], pe["v2"], pe["loop"]), (rel, pe["v2"], pe["v1"])]
    await b.paths(did, rels)
    await b.prune(did, [r for r, _, _ in rels])
    await b.color(did, {pe["loop"]: COLORS["context"], pe["v1"]: COLORS["neutral"], pe["v2"]: COLORS["loop"]})
    return await b.export(key, did, DIAGRAMS[key], "SysML Block Definition Diagram")


async def build_diagram(b, name):
    if name == "context":
        return await _context_like(b, "context", "ctx", None)
    if name in ("system_v1", "system_v2"):
        cid = name[-2:]
        return await _context_like(b, name, "sys1" if cid == "v1" else "sys2", cid)
    if name in ("internal_v1", "internal_v2"):
        return await _internal(b, name, name[-2:])
    if name == "thermal_flow":
        return await _thermal(b, name)
    if name == "traceability":
        return await _trace(b, name)
    if name in ("verification_v1", "verification_v2"):
        return await _verification(b, name, name[-2:])
    if name == "evolution":
        return await _evolution(b, name)
    raise SystemExit(f"unknown diagram {name}; one of {list(DIAGRAMS)}")


async def summary(b):
    c, s = b.c, b.s
    counts = {}
    for t in ("Class", "Property", "Port", "Connector", "Activity", "Abstraction", "InformationFlow", "Diagram"):
        r = await c.call("cameo_query_elements", f"Count {t} in the study package", type=t, package_id=s["pkg.root"], limit=1, allow_fail=True)
        counts[t] = (r or {}).get("totalCount")
    reqs = await c.call("cameo_query_elements", "List requirements", stereotype="Requirement", package_id=s["pkg.root"], limit=50)
    status = await c.call("cameo_status", "Bridge status")
    m = {"builtAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "project": s.get("_project"), "rootPackageId": s["pkg.root"], "counts": counts,
         "requirements": [{"id": e["id"], "name": e["name"]} for e in reqs.get("elements", [])], "bridge": {k: status.get(k) for k in ("pluginName", "pluginVersion", "apiVersion", "handshakeVersion")}}
    json.dump(m, open(os.path.join(b.out, "model-summary.json"), "w"), indent=1)
    return m
