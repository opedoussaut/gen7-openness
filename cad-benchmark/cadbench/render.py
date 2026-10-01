"""Deterministic line rendering with one camera and one scale per task.

Every model's result for a task is projected with the same direction and mapped into the same
frame (derived from the reference part), so side-by-side images are directly comparable:
a part that is too large really looks too large.
"""
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.GCPnts import GCPnts_QuasiUniformDeflection
from OCP.HLRAlgo import HLRAlgo_Projector
from OCP.HLRBRep import HLRBRep_Algo, HLRBRep_HLRToShape
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt

VIEW_DIR = (1.0, -1.35, 0.95)   # isometric-like, from front-right, above
SIZE = (640, 440)
MARGIN = 0.08


def _polylines(compound):
    out = []
    if compound is None or compound.IsNull():
        return out
    exp = TopExp_Explorer(compound, TopAbs_EDGE)
    while exp.More():
        edge = TopoDS.Edge_s(exp.Current())
        try:
            curve = BRepAdaptor_Curve(edge)
            disc = GCPnts_QuasiUniformDeflection(curve, 0.05)
            if disc.IsDone() and disc.NbPoints() > 1:
                pts = [disc.Value(i) for i in range(1, disc.NbPoints() + 1)]
                out.append([(p.X(), p.Y()) for p in pts])
        except Exception:
            pass
        exp.Next()
    return out


def project(shapes):
    """Return (visible polylines, hidden polylines) in projection-plane coordinates."""
    hlr = HLRBRep_Algo()
    for s in shapes:
        hlr.Add(s.wrapped)
    hlr.Projector(HLRAlgo_Projector(gp_Ax2(gp_Pnt(), gp_Dir(*VIEW_DIR))))
    hlr.Update()
    hlr.Hide()
    h = HLRBRep_HLRToShape(hlr)
    visible = _polylines(h.VCompound()) + _polylines(h.OutLineVCompound()) + _polylines(h.Rg1LineVCompound())
    hidden = _polylines(h.HCompound()) + _polylines(h.OutLineHCompound())
    return visible, hidden


def frame_for(shapes):
    """Fixed 2D frame (xmin, ymin, scale) derived from the reference projection."""
    vis, hid = project(shapes)
    pts = [p for line in vis + hid for p in line]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    # leave room for a candidate up to ~25 % larger than the reference
    usable_w, usable_h = SIZE[0] * (1 - 2 * MARGIN) / 1.25, SIZE[1] * (1 - 2 * MARGIN) / 1.25
    scale = min(usable_w / max(w, 1e-6), usable_h / max(h, 1e-6))
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    return {"cx": cx, "cy": cy, "scale": scale}


def svg(shapes, frame, title=""):
    vis, hid = project(shapes)
    W, H = SIZE
    s, cx, cy = frame["scale"], frame["cx"], frame["cy"]

    def path(lines):
        parts = []
        for line in lines:
            pts = [(W / 2 + (x - cx) * s, H / 2 - (y - cy) * s) for x, y in line]
            parts.append("M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts))
        return " ".join(parts)

    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{title}">'
            f'<path class="hid" d="{path(hid)}" fill="none" stroke="#9fb3c4" stroke-width="0.8" stroke-dasharray="3 3"/>'
            f'<path class="vis" d="{path(vis)}" fill="none" stroke="#0e2a3f" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>'
            '</svg>')
