import cadquery as cq

PARAMS = {
    "length": 120.0,          # X
    "width": 80.0,            # Y
    "thickness": 12.0,        # Z
    "channel_width": 8.0,
    "channel_height": 4.0,
    "channel_z": 4.0,         # channel floor height
    "passes": 5,              # straight passes along X
    "pass_pitch": 14.0,       # along Y, centred on Y=0
    "straight_half": 45.0,    # straights run from -45 to +45 in X
    "port_d": 8.0,
    "mount_hole_d": 6.6,
    "mount_dx": 54.0,
    "mount_dy": 34.0,
}

def build(p=PARAMS):
    L, W, T = p["length"], p["width"], p["thickness"]
    cw, ch, cz = p["channel_width"], p["channel_height"], p["channel_z"]
    n, pitch, xh = int(p["passes"]), p["pass_pitch"], p["straight_half"]
    ys = [(i - (n - 1) / 2) * pitch for i in range(n)]
    body = cq.Workplane("XY").rect(L, W).extrude(T)
    chan = None
    def add(s):
        nonlocal chan
        chan = s if chan is None else chan.union(s)
    for y in ys:  # straights, including the square ends of the turns
        add(cq.Workplane("XY").workplane(offset=cz).center(0, y).rect(2 * xh + cw, cw).extrude(ch))
    for i in range(n - 1):  # U-turns alternate +X, -X, ...
        x = xh if i % 2 == 0 else -xh
        y0, y1 = ys[i], ys[i + 1]
        add(cq.Workplane("XY").workplane(offset=cz).center(x, (y0 + y1) / 2).rect(cw, y1 - y0).extrude(ch))
    body = body.cut(chan)
    x_out = xh if (n - 1) % 2 == 0 else -xh
    ports = (cq.Workplane("XY").workplane(offset=cz).pushPoints([(-xh, ys[0]), (x_out, ys[-1])])
             .circle(p["port_d"] / 2).extrude(T - cz))
    mdx, mdy = p["mount_dx"], p["mount_dy"]
    mounts = (cq.Workplane("XY").pushPoints([(mdx, mdy), (-mdx, mdy), (mdx, -mdy), (-mdx, -mdy)])
              .circle(p["mount_hole_d"] / 2).extrude(T))
    return body.cut(ports).cut(mounts)

result = build()
