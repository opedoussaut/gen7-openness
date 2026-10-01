"""GEN7 Cameo MBSE agent — builds the AI Factory Cooling System model in CATIA Magic through cameo-mcp-bridge (MCP).

    python build_model.py <phase> [--spec model-spec.json] [--out ../evidence]

Phases (run in order; each is resumable — element IDs are kept in <out>/state.json):
    structure   packages, item and component library, context subsystems
    requirements stakeholder need, requirements, functions, thermal-flow activity
    loops       Loop A (abstract), Loop A v1, Loop A v2: parts, ports, connectors, item flows, values
    system      context and configuration blocks (complete system with Loop A v1 / v2)
    analysis    constraint blocks (equations), external evaluation, test cases with results, trace relationships
    profile     «Unchanged» / «Modified» / «Added» stereotypes applied to the Loop A v2 parts
    diagram:<name>  build, lay out, colour and export one diagram (see DIAGRAMS)
    summary     element counts and the evidence manifest

All results written into the model come from model-spec.json (GEN7 engineering calculator). The model says so.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import time

from mcp_session import McpCameo

ROOT_NAME = "AI Factory Cooling System (GEN7)"
PROVENANCE = ("Computed by the GEN7 deterministic engineering calculator (src/engineering/physics.js) outside Cameo and written "
              "into this model by the GEN7 Cameo MBSE agent. CATIA Magic Simulation Toolkit is not installed on this workstation, "
              "so Cameo did not execute this calculation.")

COLORS = {"neutral": "#F4F6F9", "loop": "#DCEAF8", "context": "#EEF2F7", "unchanged": "#EEEEEE", "modified": "#FFE2B0", "added": "#CDEFD7",
          "pass": "#D8F1E2", "fail": "#F8D3D1", "low": "#FFF1BF", "req": "#FFFFFF", "tc": "#F3F0FF", "action": "#EAF2FB", "item": "#FFFFFF"}

LIB_KIND = {"cdu": "Coolant Distribution Unit", "pump": "Circulation Pump", "hx": "Plate Heat Exchanger", "manifold": "Coolant Manifold",
            "valve": "Control Valve", "controller": "Thermal Controller"}
SENSOR_KIND = {"FM": "Flow Meter", "TS": "Temperature Sensor", "PS": "Pressure Sensor", "DPT": "Differential Pressure Transmitter"}
PORTS = {"Circulation Pump": ["in", "out", "cmd"], "Plate Heat Exchanger": ["in", "out", "fw"], "Coolant Manifold": ["in", "out"],
         "Control Valve": ["fw", "cmd"], "Thermal Controller": ["sig", "cmd"], "Flow Meter": ["sig"], "Temperature Sensor": ["sig"],
         "Pressure Sensor": ["sig"], "Differential Pressure Transmitter": ["sig"], "Coolant Distribution Unit": []}
ITEMS = {"Coolant (PG25)": "Propylene glycol 25 % coolant of the technology cooling loops.", "Facility Water": "Facility water.",
         "Heat": "Thermal energy.", "Control Signal": "Actuation command (speed, valve position).", "Measurement": "Sensor measurement."}


def lib_type(comp: dict) -> str:
    if comp["kind"] == "sensor":
        for pre, name in SENSOR_KIND.items():
            if comp["tag"].startswith(pre):
                return name
    return LIB_KIND[comp["kind"]]


def eid(r):
    if not isinstance(r, dict):
        return None
    return r.get("id") or (r.get("element") or {}).get("id") or (r.get("relationship") or {}).get("id")


def groovy_map(d: dict) -> str:
    if not d:
        return "[:]"
    return "[" + ", ".join(f"{json.dumps(k)}: {json.dumps(v)}" for k, v in d.items()) + "]"


DEFAULTS_SCRIPT = r'''
import com.nomagic.magicdraw.core.Application
import com.nomagic.magicdraw.openapi.uml.SessionManager
def project = Application.getInstance().getProject()
def ef = project.getElementsFactory()
def vals = %(vals)s
SessionManager.getInstance().createSession(project, "GEN7 values")
def n = 0
try {
  vals.each { id, v ->
    def p = project.getElementByID(id)
    def lit = ef.createLiteralRealInstance(); lit.setValue(v as double)
    p.setDefaultValue(lit); n++
  }
} finally { SessionManager.getInstance().closeSession(project) }
return "defaults " + n
'''

CONSTRAINT_SCRIPT = r'''
import com.nomagic.magicdraw.core.Application
import com.nomagic.magicdraw.openapi.uml.SessionManager
def project = Application.getInstance().getProject()
def ef = project.getElementsFactory()
def items = %(items)s
SessionManager.getInstance().createSession(project, "GEN7 constraints")
def n = 0
try {
  items.each { id, expr ->
    def block = project.getElementByID(id)
    def c = ef.createConstraintInstance()
    c.setName("equation")
    def spec = ef.createOpaqueExpressionInstance()
    spec.getBody().add(expr); spec.getLanguage().add("text")
    c.setSpecification(spec)
    block.getOwnedRule().add(c)
    n++
  }
} finally { SessionManager.getInstance().closeSession(project) }
return "constraints " + n
'''

COLOR_SCRIPT = r'''
import com.nomagic.magicdraw.core.Application
import com.nomagic.magicdraw.openapi.uml.SessionManager
import com.nomagic.magicdraw.openapi.uml.PresentationElementsManager
import java.awt.Color
def project = Application.getInstance().getProject()
def dpe = project.getDiagram(project.getElementByID("%(did)s"))
def targets = %(targets)s
def found = []
def walk
walk = { pe -> if (targets.containsKey(pe.getID())) found << pe; pe.getPresentationElements().each { walk(it) } }
walk(dpe)
SessionManager.getInstance().createSession(project, "GEN7 styling")
try {
  found.each { pe ->
    def pm = pe.getPropertyManager().clone()
    def c = new Color(Integer.parseInt(targets[pe.getID()].substring(1), 16))
    pm.getProperties().each { p -> if (p.getName() == "Fill Color") p.setValue(c); if (p.getName() == "Use Fill Color") p.setValue(true) }
    PresentationElementsManager.getInstance().setPresentationElementProperties(pe, pm)
  }
} finally { SessionManager.getInstance().closeSession(project) }
return "colored " + found.size()
'''

ROUTE_BY_ELEMENT_SCRIPT = r'''
import com.nomagic.magicdraw.core.Application
import com.nomagic.magicdraw.openapi.uml.SessionManager
import com.nomagic.magicdraw.openapi.uml.PresentationElementsManager
import com.nomagic.magicdraw.uml.symbols.paths.PathElement
import java.awt.Point
def project = Application.getInstance().getProject()
def dpe = project.getDiagram(project.getElementByID("%(did)s"))
def routes = %(routes)s
def found = []
def walk
walk = { pe -> def e = pe.getElement(); if (pe instanceof PathElement && e != null && routes.containsKey(e.getID())) found << pe; pe.getPresentationElements().each { walk(it) } }
walk(dpe)
def seen = [] as Set
def routed = 0, removed = 0
SessionManager.getInstance().createSession(project, "GEN7 routing")
try {
  found.each { pe ->
    def id = pe.getElement().getID()
    if (seen.contains(id)) { PresentationElementsManager.getInstance().deletePresentationElement(pe); removed++; return }
    seen << id
    def r = routes[id]
    def br = []
    for (int i = 4; i + 1 < r.size(); i += 2) br << new Point(r[i] as int, r[i + 1] as int)
    PresentationElementsManager.getInstance().changePathPoints(pe, new Point(r[0] as int, r[1] as int), new Point(r[2] as int, r[3] as int), br)
    routed++
  }
} finally { SessionManager.getInstance().closeSession(project) }
return "routed " + routed + ", removed duplicates " + removed + ", requested " + routes.size()
'''

DROP_FLOW_VIEWS_SCRIPT = r'''
import com.nomagic.magicdraw.core.Application
import com.nomagic.magicdraw.openapi.uml.SessionManager
import com.nomagic.magicdraw.openapi.uml.PresentationElementsManager
import com.nomagic.magicdraw.uml.symbols.paths.PathElement
def project = Application.getInstance().getProject()
def dpe = project.getDiagram(project.getElementByID("%(did)s"))
def found = []
def walk
walk = { pe -> def e = pe.getElement(); if (pe instanceof PathElement && e != null && e.getHumanType() == "Item Flow") found << pe; pe.getPresentationElements().each { walk(it) } }
walk(dpe)
SessionManager.getInstance().createSession(project, "GEN7 drop duplicate item-flow paths")
try { found.each { PresentationElementsManager.getInstance().deletePresentationElement(it) } } finally { SessionManager.getInstance().closeSession(project) }
return "removed " + found.size() + " standalone item-flow paths"
'''

PRUNE_PATHS_SCRIPT = r'''
import com.nomagic.magicdraw.core.Application
import com.nomagic.magicdraw.openapi.uml.SessionManager
import com.nomagic.magicdraw.openapi.uml.PresentationElementsManager
import com.nomagic.magicdraw.uml.symbols.paths.PathElement
def project = Application.getInstance().getProject()
def dpe = project.getDiagram(project.getElementByID("%(did)s"))
def keep = %(keep)s as Set
def paths = []
def walk
walk = { pe -> if (pe instanceof PathElement && pe.getElement() != null) paths << pe; pe.getPresentationElements().each { walk(it) } }
walk(dpe)
def seen = [] as Set
def drop = paths.findAll { pe -> def id = pe.getElement().getID(); def d = !keep.contains(id) || seen.contains(id); seen << id; d }
SessionManager.getInstance().createSession(project, "GEN7 prune auto-displayed paths")
try { drop.each { PresentationElementsManager.getInstance().deletePresentationElement(it) } } finally { SessionManager.getInstance().closeSession(project) }
return "kept " + (paths.size() - drop.size()) + ", removed " + drop.size()
'''

ACTION_BODY_SCRIPT = r'''
import com.nomagic.magicdraw.core.Application
import com.nomagic.magicdraw.openapi.uml.SessionManager
def project = Application.getInstance().getProject()
def ids = %(ids)s
SessionManager.getInstance().createSession(project, "GEN7 action bodies")
try { ids.each { id -> def a = project.getElementByID(id); a.getBody().clear(); a.getBody().add(a.getName()); a.getLanguage().clear(); a.getLanguage().add("English") } } finally { SessionManager.getInstance().closeSession(project) }
return "bodies " + ids.size()
'''

PROFILE_SCRIPT = r'''
import com.nomagic.magicdraw.core.Application
import com.nomagic.magicdraw.openapi.uml.SessionManager
import com.nomagic.uml2.ext.jmi.helpers.StereotypesHelper
def project = Application.getInstance().getProject()
def ef = project.getElementsFactory()
def owner = project.getElementByID("%(owner)s")
def apply = %(apply)s
def out = [:]
SessionManager.getInstance().createSession(project, "GEN7 change profile")
try {
  def profile = StereotypesHelper.getProfile(project, "GEN7 Engineering Change")
  if (profile == null) {
    profile = ef.createProfileInstance(); profile.setName("GEN7 Engineering Change"); profile.setOwner(owner)
  }
  def propMeta = StereotypesHelper.getMetaClassByName(project, "Property")
  def st = [:]
  ["Unchanged", "Modified", "Added"].each { n ->
    def s = StereotypesHelper.getStereotype(project, n, profile)
    if (s == null) s = StereotypesHelper.createStereotype(profile, n, [propMeta])
    st[n] = s
  }
  def model = project.getPrimaryModel()
  if (!StereotypesHelper.getAllProfiles(project).contains(profile)) {}
  try { com.nomagic.uml2.ext.jmi.helpers.ModelHelper.applyProfile(model, profile) } catch (Throwable e) { out.applyProfile = e.toString() }
  def n = 0
  apply.each { id, name -> def el = project.getElementByID(id); StereotypesHelper.addStereotype(el, st[name]); n++ }
  out.applied = n
  out.profile = profile.getID()
} finally { SessionManager.getInstance().closeSession(project) }
return out.toString()
'''


class Builder:
    def __init__(self, c: McpCameo, spec: dict, out: str):
        self.c, self.spec, self.out = c, spec, out
        self.state_path = os.path.join(out, "state.json")
        self.s = json.load(open(self.state_path)) if os.path.exists(self.state_path) else {}

    def save(self):
        with open(self.state_path, "w") as fh:
            json.dump(self.s, fh, indent=1)

    async def el(self, key, type, name, parent, label="", **kw):
        if key in self.s:
            return self.s[key]
        r = await self.c.call("cameo_create_element", label or f"Create {type} {name}", type=type, name=name, parent_id=parent, **kw)
        self.s[key] = eid(r)
        self.save()
        return self.s[key]

    async def rel(self, key, type, src, tgt, label="", **kw):
        if key in self.s:
            return self.s[key]
        r = await self.c.call("cameo_create_relationship", label or f"Create {type}", type=type, source_id=src, target_id=tgt, **kw)
        self.s[key] = eid(r)
        self.save()
        return self.s[key]

    async def doc(self, key, text):
        await self.c.call("cameo_modify_element", "Document element", element_id=self.s[key], documentation=text)

    async def macro(self, label, script):
        r = await self.c.call("cameo_execute_macro", label, script=script)
        if isinstance(r, dict) and r.get("success") is False:
            raise RuntimeError(f"macro failed: {r.get('error')}")
        return r

    # ------------------------------------------------------------------ phases
    async def structure(self):
        proj = await self.c.call("cameo_get_project", "Open project")
        self.s["_project"] = {"name": proj["name"], "file": proj["filePath"], "modelId": proj["primaryModelId"]}
        root = await self.el("pkg.root", "package", ROOT_NAME, proj["primaryModelId"], "Create study package")
        await self.doc("pkg.root", f"{self.spec['study']['title']} ({self.spec['study']['id']}). Built by the GEN7 Cameo MBSE agent through cameo-mcp-bridge. "
                       "SysML v1 (the SysML v2 plugin is not installed). Demonstration case — not a real facility.")
        for k, n in [("req", "01 Requirements"), ("fn", "02 Functions"), ("lib", "03 Component Library"), ("sys", "04 System Structure"),
                     ("v1", "05 Loop A v1 — current baseline"), ("v2", "06 Loop A v2 — proposed evolution"), ("ana", "07 Analysis"),
                     ("ver", "08 Verification"), ("views", "09 Views")]:
            await self.el(f"pkg.{k}", "package", n, root)
        real = await self.c.call("cameo_query_elements", "Find SysML Real value type", name="Real", type="DataType", limit=1)
        self.s["type.Real"] = real["elements"][0]["id"]
        for name, d in ITEMS.items():
            await self.el(f"item.{name}", "block", name, self.s["pkg.lib"], f"Item block {name}", documentation=d)
        for name, ports in PORTS.items():
            b = await self.el(f"lib.{name}", "block", name, self.s["pkg.lib"], f"Component block {name}")
            for p in ports:
                await self.el(f"port.{name}.{p}", "port", p, b, f"Port {name}.{p}")
        for part in self.spec["context"]["parts"]:
            await self.el(f"ctx.{part['type']}", "block", part["type"], self.s["pkg.sys"], f"Subsystem {part['type']}", documentation=part["doc"])
        self.save()

    async def requirements(self):
        pkg = self.s["pkg.req"]
        stk = self.spec["stakeholderNeed"]
        await self.el("req.STK-001", "requirement", stk["name"], pkg, "Stakeholder need")
        await self.c.call("cameo_set_tagged_values", "Requirement Id/Text", element_id=self.s["req.STK-001"], stereotype="Requirement", values={"Id": stk["id"], "Text": stk["text"]})
        for r in self.spec["requirements"]:
            k = f"req.{r['id']}"
            new = k not in self.s
            await self.el(k, "requirement", r["name"], pkg, f"Requirement {r['id']}")
            if new:
                await self.c.call("cameo_set_tagged_values", f"{r['id']} Id/Text", element_id=self.s[k], stereotype="Requirement", values={"Id": r["id"], "Text": r["text"]})
        await self.rel("rel.derive.FUTURE", "derive", self.s["req.REQ-FUTURE-001"], self.s["req.STK-001"], "REQ-FUTURE-001 derived from STK-001")
        for d in ["REQ-THERM-002", "REQ-THERM-003", "REQ-FLOW-001", "REQ-PRESS-001"]:
            await self.rel(f"rel.derive.FUTURE.{d}", "derive", self.s["req.REQ-FUTURE-001"], self.s[f"req.{d}"], f"REQ-FUTURE-001 derived from {d}")
        fpkg = self.s["pkg.fn"]
        top = await self.el("fn.top", "activity", "Cool the AI Factory", fpkg, "Top function")
        for f in self.spec["functions"]:
            await self.el(f"fn.{f['id']}", "activity", f"{f['id']} {f['name']}", fpkg, f"Function {f['id']}", documentation=f"Performed by {f['performedBy']}.")
        # Thermal flow (energy journey) activity
        act = await self.el("tf.act", "activity", "Reject AI heat (thermal flow)", fpkg, "Thermal-flow activity",
                            documentation="Energy journey from GPU electrical power to heat rejection or recovery.")
        await self.el("tf.init", "initial-node", "start", act, "Initial node")
        for i, n in enumerate(self.spec["thermalFlow"]):
            await self.el(f"tf.a{i}", "opaque-action", n, act, f"Action {n}")
        await self.el("tf.final", "final-node", "end", act, "Final node")
        await self.rel("tf.f.init", "control-flow", self.s["tf.init"], self.s["tf.a0"], "Flow start", owner_id=act)
        for i in range(len(self.spec["thermalFlow"]) - 1):
            await self.rel(f"tf.f{i}", "control-flow", self.s[f"tf.a{i}"], self.s[f"tf.a{i + 1}"], f"Flow {i}", owner_id=act)
        await self.rel("tf.f.final", "control-flow", self.s[f"tf.a{len(self.spec['thermalFlow']) - 1}"], self.s["tf.final"], "Flow end", owner_id=act)

    async def _values(self, block_key, values: dict, prefix):
        defaults = {}
        for name, v in values.items():
            k = f"{prefix}.val.{name}"
            new = k not in self.s
            await self.el(k, "property", name, self.s[block_key], f"Value {name}", type_id=self.s["type.Real"])
            if new:
                defaults[self.s[k]] = float(v)
        if defaults:
            await self.macro(f"Set {len(defaults)} value defaults on {prefix}", DEFAULTS_SCRIPT % {"vals": groovy_map(defaults)})

    async def loops(self):
        base = await self.el("loop.base", "block", "Loop A", self.s["pkg.sys"], "Abstract Loop A",
                             documentation="Primary cooling loop of row 4. Specialized by Loop A v1 (current baseline) and Loop A v2 (proposed evolution).")
        self.s["ctx.Loop A"] = base
        for cid in ("v1", "v2"):
            cfg = self.spec["configs"][cid]
            pkg = self.s[f"pkg.{cid}"]
            b = await self.el(f"{cid}.block", "block", cfg["name"], pkg, f"Block {cfg['name']}",
                              documentation=f"{cfg['label']}. {cfg['provenance']}. Control: {cfg['control']}.")
            await self.rel(f"{cid}.gen", "generalization", b, base, f"{cfg['name']} specializes Loop A")
            for comp in cfg["components"]:
                t = self.s[f"lib.{lib_type(comp)}"]
                await self.el(f"{cid}.part.{comp['tag']}", "property", comp["tag"], b, f"Part {comp['tag']}", type_id=t, aggregation="composite",
                              documentation=f"{comp['name']}. Status vs v1: {comp['status']}" + (f" (replaces {comp['replaces']})." if comp.get("replaces") else "."))
            topo = cfg["topology"]
            for kind, src_port, tgt_port, item in (("coolant", "out", "in", "Coolant (PG25)"), ("facility", "fw", "fw", "Facility Water"),
                                                   ("signal", "sig", "sig", "Measurement"), ("command", "cmd", "cmd", "Control Signal")):
                for a, z in topo[kind]:
                    ta = lib_type(next(x for x in cfg["components"] if x["tag"] == a))
                    tz = lib_type(next(x for x in cfg["components"] if x["tag"] == z))
                    k = f"{cid}.con.{a}.{z}"
                    con = await self.rel(k, "connector", self.s[f"port.{ta}.{src_port}"], self.s[f"port.{tz}.{tgt_port}"], f"Connector {a}→{z}",
                                         owner_id=b, source_part_with_port_id=self.s[f"{cid}.part.{a}"], target_part_with_port_id=self.s[f"{cid}.part.{z}"])
                    await self.rel(f"{k}.flow", "itemflow", self.s[f"port.{ta}.{src_port}"], self.s[f"port.{tz}.{tgt_port}"], f"Item flow {item} {a}→{z}",
                                   realizing_connector_id=con, conveyed_ids=[self.s[f"item.{item}"]], owner_id=pkg)
            vals = {"capacityKw": cfg["values"]["capacityKw"], "maxFlowLpm": cfg["values"]["maxFlowLpm"], "maxPumpPowerKw": cfg["values"]["maxPumpPowerKw"],
                    "singleFailureCapacityKw": cfg["values"]["singleFailureCapacityKw"], "hxUaKwPerK": cfg["values"]["hxUaKwPerK"],
                    "deltaTSetpointK": cfg["values"]["deltaTSetpointK"], "loopDpCoeffKpaPerLps2": cfg["values"]["systemDpCoeff"],
                    "futureLoadMarginPct": next(x for x in cfg["scenarios"] if x["id"] == "S4")["marginPct"]}
            await self._values(f"{cid}.block", vals, cid)

    async def system(self):
        pkg = self.s["pkg.sys"]
        variants = [("ctx", "AI Factory Cooling System", "loop.base"), ("sys1", "AI Factory Cooling System — Loop A v1", "v1.block"),
                    ("sys2", "AI Factory Cooling System — Loop A v2", "v2.block")]
        for key, name, loop_key in variants:
            b = await self.el(f"{key}.block", "block", name, pkg, f"System block {name}",
                              documentation="Complete AI Factory cooling architecture. " + ("Loop A shown as the abstract loop." if key == "ctx" else f"Configuration with {name.split('— ')[1]}; every other subsystem is identical."))
            for part in self.spec["context"]["parts"]:
                t = self.s[loop_key] if part["key"] == "loopA" else self.s[f"ctx.{part['type']}"]
                await self.el(f"{key}.part.{part['key']}", "property", part["name"], b, f"Part {part['name']}", type_id=t, aggregation="composite")
            for a, z, item in self.spec["context"]["chain"]:
                k = f"{key}.con.{a}.{z}"
                con = await self.rel(k, "connector", self.s[f"{key}.part.{a}"], self.s[f"{key}.part.{z}"], f"Connector {a}→{z}", owner_id=b)
                if f"{k}.flow" not in self.s:
                    r = await self.c.call("cameo_create_relationship", f"Item flow {item} {a}→{z}", allow_fail=True, type="itemflow",
                                          source_id=self.s[f"{key}.part.{a}"], target_id=self.s[f"{key}.part.{z}"], realizing_connector_id=con,
                                          conveyed_ids=[self.s[f"item.{item}"]], owner_id=pkg)
                    self.s[f"{k}.flow"] = eid(r)
                    self.save()

    async def analysis(self):
        pkg = self.s["pkg.ana"]
        items = {}
        for e in self.spec["equations"]:
            k = f"ana.eq.{e['id']}"
            new = k not in self.s
            await self.el(k, "constraint-block", e["name"], pkg, f"Constraint block {e['name']}", documentation=f"{e['expr']} — {e['note']}")
            if new:
                items[self.s[k]] = e["expr"]
        load = self.spec["scenarios"]
        k = "ana.projected"
        new = k not in self.s
        await self.el(k, "constraint-block", "Projected Thermal Load", pkg, "Projected thermal load", documentation="; ".join(f"{x['id']} {x['name']}: {x['loadKw']} kW — {x['basis']}" for x in load))
        if new:
            items[self.s[k]] = f"S4 = S3 + {self.spec['loads']['futureClusterRacks']} × {self.spec['loads']['futureRackKw']} kW = {load[3]['loadKw']} kW"
        if items:
            await self.macro(f"Write {len(items)} equations as constraints", CONSTRAINT_SCRIPT % {"items": groovy_map(items)})
        ev = await self.el("ana.eval", "activity", "Loop A thermal-hydraulic evaluation (external calculation)", pkg, "Evaluation activity",
                           documentation=PROVENANCE + " Inputs: boundary conditions, scenarios S1–S4, Loop A parameters. Method: " + "; ".join(e["expr"] for e in self.spec["equations"]))
        await self.rel("rel.refine.projected", "refine", self.s["ana.projected"], self.s["req.REQ-FUTURE-001"], "Projected load refines REQ-FUTURE-001")
        await self.rel("rel.trace.F2", "trace", self.s["fn.F2"], self.s["req.REQ-FUTURE-001"], "F2 traces to REQ-FUTURE-001")
        await self.rel("rel.alloc.F2", "allocate", self.s["fn.F2"], self.s["loop.base"], "F2 allocated to Loop A")
        await self.rel("rel.trace.eval", "trace", self.s["ana.eval"], self.s["v2.block"], "Evaluation traces to Loop A v2")
        await self.rel("rel.trace.eval1", "trace", self.s["ana.eval"], self.s["v1.block"], "Evaluation traces to Loop A v1")
        # satisfy: both configurations claim the envelope requirements; only v2 claims the future requirement.
        for r in self.spec["requirements"]:
            for cid in ("v1", "v2"):
                if r["id"] == "REQ-FUTURE-001" and cid == "v1":
                    continue
                await self.rel(f"rel.sat.{cid}.{r['id']}", "satisfy", self.s[f"{cid}.block"], self.s[f"req.{r['id']}"], f"{cid} satisfies {r['id']}")
        # test cases with results
        vpkg = self.s["pkg.ver"]
        req_scope = {r["id"]: r["scope"] for r in self.spec["requirements"]}
        for cid in ("v1", "v2"):
            cfg = self.spec["configs"][cid]
            for sc in cfg["scenarios"]:
                k = f"tc.{cid}.{sc['id']}"
                name = f"TC-{cid.upper()}-{sc['id']} {sc['name']} — {sc['status']}"
                d = (f"{cfg['name']} at {sc['name']} ({sc['loadKw']} kW), boundary: facility water {self.spec['boundary']['facilityWaterSupplyC']} °C / "
                     f"{self.spec['boundary']['facilityWaterFlowKgS']} kg/s. Result: supply {sc['supplyC']} °C, return {sc['returnC']} °C, ΔT {sc['deltaTK']} K, "
                     f"flow {sc['flowLpm']} L/min ({sc['flowLpmPerKw']} L/min/kW{', pumps at full speed' if sc['flowCapped'] else ''}), Δp {sc['dpKpa']} kPa, "
                     f"pump power {sc['pumpKw']} kW, capacity margin {sc['marginPct']} %. Violations: {', '.join(sc['violations']) or 'none'}. "
                     f"Status: {sc['status']}. {PROVENANCE}")
                new = k not in self.s
                await self.el(k, "activity", name, vpkg, f"Test case {name}", documentation=d)
                if new:
                    await self.c.call("cameo_apply_stereotype", "Apply «testCase»", element_id=self.s[k], stereotype="TestCase")
                for rid, scope in req_scope.items():
                    if sc["id"] in scope:
                        await self.rel(f"rel.ver.{cid}.{sc['id']}.{rid}", "verify", self.s[k], self.s[f"req.{rid}"], f"{name} verifies {rid}")
                await self.rel(f"rel.tc.trace.{cid}.{sc['id']}", "trace", self.s[k], self.s["ana.eval"], "Test case traces to evaluation")

    async def prune(self, did, keep):
        """Keep only the relationship paths this view is meant to show (Cameo auto-displays related paths)."""
        return await self.macro("Remove auto-displayed and duplicate paths", PRUNE_PATHS_SCRIPT % {"did": did, "keep": json.dumps([k for k in keep if k])})

    async def actions(self):
        ids = [self.s[f"tf.a{i}"] for i in range(len(self.spec["thermalFlow"]))]
        await self.macro("Show action names as bodies", ACTION_BODY_SCRIPT % {"ids": json.dumps(ids)})

    async def names(self):
        """Name the coolant and facility-water connectors after what they carry (shown on the diagrams)."""
        for cid in ("v1", "v2"):
            topo = self.spec["configs"][cid]["topology"]
            for kind, label in (("coolant", "PG25 coolant"), ("facility", "facility water")):
                for a, z in topo[kind]:
                    k = f"{cid}.con.{a}.{z}"
                    if self.s.get(f"{k}.named") != label:
                        await self.c.call("cameo_modify_element", f"Name connector {a}→{z}", element_id=self.s[k], name=label)
                        self.s[f"{k}.named"] = label
        for a, z, item in self.spec["context"]["chain"]:
            for key in ("ctx", "sys1", "sys2"):
                k = f"{key}.con.{a}.{z}"
                if self.s.get(f"{k}.named") != item:
                    await self.c.call("cameo_modify_element", f"Name connector {a}→{z}", element_id=self.s[k], name=item.lower())
                    self.s[f"{k}.named"] = item
        self.save()

    async def profile(self):
        apply = {self.s[f"v2.part.{c['tag']}"]: c["status"].capitalize() for c in self.spec["configs"]["v2"]["components"]}
        r = await self.macro("Create change profile and apply «Unchanged/Modified/Added»", PROFILE_SCRIPT % {"owner": self.s["pkg.root"], "apply": groovy_map(apply)})
        self.s["_profile"] = r.get("result") if isinstance(r, dict) else r
        self.save()

    # ------------------------------------------------------------------ diagrams
    async def place(self, did, key, element_id, x, y, w=-1, h=-1, container=None, label=""):
        r = await self.c.call("cameo_add_to_diagram", label or f"Place {key}", diagram_id=did, element_id=element_id, x=x, y=y, width=w, height=h,
                              container_presentation_id=container)
        return r["presentationId"]

    async def paths(self, did, items):
        """Draw paths; returns {relationshipId: pathPresentationId}."""
        items = [i for i in items if i[0] and i[1] and i[2]]
        if not items:
            return {}
        r = await self.c.call("cameo_add_diagram_paths", f"Draw {len(items)} paths", diagram_id=did,
                              paths=[{"relationshipId": r, "sourceShapeId": a, "targetShapeId": b} for r, a, b in items])
        return {x["relationshipId"]: x.get("presentationId") for x in (r or {}).get("results", []) if x.get("presentationId")}

    async def route(self, did, routes):
        """routes: list of (relationshipElementId, (sx, sy), (tx, ty), [(bx, by), ...]) — explicit orthogonal routing of
        every path of that relationship on the diagram; duplicate paths Cameo auto-displayed are removed."""
        m = {e: [a[0], a[1], z[0], z[1], *[v for pt in br for v in pt]] for e, a, z, br in routes if e}
        if m:
            r = await self.macro(f"Route {len(m)} paths", ROUTE_BY_ELEMENT_SCRIPT % {"did": did, "routes": groovy_map(m)})
            return r

    async def route_flows(self, did, flow_routes):
        """Cameo also draws each item flow as a separate dashed path between the ports, on top of the connector that
        realizes it. Remove those duplicate path views (the item flows stay in the model and on their connectors)."""
        r = await self.macro("Remove duplicate item-flow path views", DROP_FLOW_VIEWS_SCRIPT % {"did": did})
        await self.c.call("cameo_repair_conveyed_item_labels", "Show conveyed items on the connectors", allow_fail=True, diagram_id=did, reset_labels=True)
        return r

    async def resize(self, did, boxes):
        """boxes: {presentationId: (x, y, w, h)} — re-apply bounds after display changes (Cameo autosizes)."""
        if boxes:
            await self.c.call("cameo_move_shapes", f"Re-apply bounds of {len(boxes)} shapes", diagram_id=did, allow_fail=True,
                              shapes=[{"presentationId": p, "x": x, "y": y, "width": w, "height": h} for p, (x, y, w, h) in boxes.items()])

    async def props(self, did, pids, props):
        for pid in pids:
            await self.c.call("cameo_set_shape_properties", "Shape display", diagram_id=did, presentation_id=pid, properties=props, allow_fail=True)

    async def labels(self, did):
        await self.c.call("cameo_set_item_flow_label_presentation", "Item-flow labels: conveyed item only", allow_fail=True, diagram_id=did,
                          show_name=False, show_conveyed=True, show_item_property=False, show_direction=True, show_stereotype=False, reset_labels=True)

    async def color(self, did, targets: dict):
        if targets:
            await self.macro(f"Colour {len(targets)} shapes", COLOR_SCRIPT % {"did": did, "targets": groovy_map(targets)})

    async def new_diagram(self, key, type, name, owner):
        dk = f"diagram.{key}"
        if dk in self.s:
            await self.c.call("cameo_delete_element", f"Remove previous {name}", element_id=self.s[dk], allow_fail=True)
            del self.s[dk]
        r = await self.c.call("cameo_create_diagram", f"Create {type} diagram {name}", type=type, name=name, parent_id=owner)
        self.s[dk] = r["id"]
        self.save()
        return r["id"]

    async def export(self, key, did, name, kind, scale=150):
        img = await self.c.call("cameo_get_diagram_image", f"Export {name} from Cameo", diagram_id=did, scale_percentage=scale)
        os.makedirs(os.path.join(self.out, "diagrams"), exist_ok=True)
        path = os.path.join(self.out, "diagrams", f"{key}.png")
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(img["image"]))
        shapes = await self.c.call("cameo_list_diagram_shapes", f"Count shapes of {name}", diagram_id=did, summary_only=True)
        meta = {"key": key, "name": name, "cameoDiagramId": did, "diagramType": kind, "file": f"diagrams/{key}.png", "width": img.get("width"),
                "height": img.get("height"), "scalePercentage": scale, "shapeCount": (shapes or {}).get("totalCount"), "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "exportedBy": "cameo_get_diagram_image (CATIA Magic native diagram export)"}
        man = os.path.join(self.out, "diagrams.json")
        allm = json.load(open(man)) if os.path.exists(man) else {}
        allm[key] = meta
        json.dump(allm, open(man, "w"), indent=1)
        return meta


async def run(phase, spec_path, out):
    spec = json.load(open(spec_path, encoding="utf-8"))
    os.makedirs(out, exist_ok=True)
    events = os.path.join(out, "events-build.jsonl")
    async with McpCameo(events, phase=phase) as c:
        b = Builder(c, spec, out)
        if phase.startswith("diagram:"):
            from diagrams import build_diagram
            meta = await build_diagram(b, phase.split(":", 1)[1])
            print(json.dumps(meta, indent=1))
        elif phase == "summary":
            from diagrams import summary
            print(json.dumps(await summary(b), indent=1)[:3000])
        else:
            await getattr(b, phase)()
        b.save()
        print(f"{phase}: {len(c.calls)} MCP calls, {sum(1 for x in c.calls if not x['ok'])} failed, {sum(x['ms'] for x in c.calls) / 1000:.1f} s")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("phase")
    ap.add_argument("--spec", default="model-spec.json")
    ap.add_argument("--out", default="../evidence")
    a = ap.parse_args()
    asyncio.run(run(a.phase, a.spec, a.out))
